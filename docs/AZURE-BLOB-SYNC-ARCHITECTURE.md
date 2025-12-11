# Azure Blob → Supabase Sync Architecture

**Created**: 2025-12-09
**Status**: ✅ Approved - Ready for Implementation

## Overview

Replace MaidCentral API v2 calls with Azure Blob Storage as the single source of truth. Supabase Edge Function polls Azure every 15 minutes to sync schedule and user data.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Azure Blob Storage                                             │
│  Container: mc-backup-data (or similar)                         │
│                                                                 │
│  Files:                                                         │
│    {servicecompanyid}_schedules.json  (7+ days of jobs)         │
│    users.json                         (ALL users)               │
│                                                                 │
│  Example:                                                       │
│    1_schedules.json   → All jobs for company 1 (7-day window)   │
│    users.json         → All users across ALL groups             │
└────────────────────┬────────────────────────────────────────────┘
                     │ SAS Token (stored in Supabase Secrets)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase Edge Function: azure-sync                             │
│  Triggered: Every 15 minutes via pg_cron                        │
│                                                                 │
│  1. List blobs in Azure container                               │
│  2. For each schedule file ({companyid}_schedules.json):        │
│     a. Download JSON from Azure                                 │
│     b. Save to Supabase Storage: {company_id}/{date}/schedule.json │
│     c. Update schedule_data metadata table                      │
│  3. For users.json:                                             │
│     a. Download JSON from Azure                                 │
│     b. Sync users to Supabase Auth (create/update/delete)       │
│     c. Update user_profiles table                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│                                                                 │
│  Storage (Blob):                                                │
│    Bucket: schedule-data                                        │
│    Path: {service_company_id}/{date}/schedule.json              │
│                                                                 │
│  PostgreSQL:                                                    │
│    - service_company_groups                                     │
│    - companies                                                  │
│    - user_profiles (linked to auth.users)                       │
│    - schedule_data (metadata + storage refs)                    │
│    - sync_jobs (audit trail)                                    │
│                                                                 │
│  Auth:                                                          │
│    - auth.users (created/updated from Azure user files)         │
│    - Magic link authentication                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Azure Blob File Conventions

### Schedule Files
**Pattern**: `{servicecompanyid}_schedules.json`
**Example**: `1_schedules.json`

**Contents**: Single company with all jobs for 7+ day rolling window
```json
{
  "ServiceCompanyId": 1,
  "ServiceCompanyGroupId": 1,
  "ServiceCompanyGroupName": "Castle Keepers",
  "Name": "Charleston",
  "IsActive": true,
  "TimeZoneInfoId": "Eastern Standard Time",
  "GeneratedAt": "2025-12-10T21:00:53Z",
  "DateRangeStart": "2025-12-10",
  "DateRangeEnd": "2025-12-16",
  "FeatureToggles": {
    "TechDashboard_DisplayBillRate": true,
    "TechDashboard_DisplayFeeSplitRate": true,
    "TechDashboard_DisplayAddOnRate": true,
    "TechDashboard_DisplayRoomRate": true,
    "TechDashboard_DisplayCustomerPhoneNumbers": false,
    "TechDashboard_DisplayCustomerEmails": false,
    "TechDashboard_HideDiscounts": false
  },
  "Jobs": [
    { /* Format A job structure - jobs across all dates in range */ }
  ]
}
```

### User Files
**Pattern**: `users.json` (single file for ALL users across ALL groups)
**Example**: `users.json`

**Contents**: All users across all service company groups
```json
{
  "GeneratedAt": "2025-12-09T06:00:00Z",
  "ServiceCompanyGroups": [
    {
      "ServiceCompanyGroupId": 32,
      "ServiceCompanyGroupName": "One Organized Mom",
      "IsActive": true,
      "ServiceCompanies": [
        {
          "ServiceCompanyId": 59,
          "Name": "One Organized Mom",
          "ServiceCompanyGroupId": 32,
          "IsActive": true,
          "Users": [
            {
              "UserId": "c278b273-7d6b-4394-9911-7fe85fb50181",
              "Email": "user@example.com",
              "EmployeeInformationId": 3013,
              "FirstName": "John",
              "LastName": "Doe",
              "FullName": "John Doe",
              "Roles": ["Administrator", "Employee"],
              "ServiceCompanyId": 59
            }
          ]
        }
      ]
    },
    {
      "ServiceCompanyGroupId": 45,
      "ServiceCompanyGroupName": "Another Cleaning Co",
      "IsActive": true,
      "ServiceCompanies": [...]
    }
  ]
}
```

---

## Part 1: Supabase Implementation

### Phase 1: Supabase Secrets Setup
Add Azure credentials to Supabase secrets:
```bash
supabase secrets set AZURE_BLOB_SAS_URL="https://storageaccount.blob.core.windows.net/container?sv=..."
# OR
supabase secrets set AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=..."
```

### Phase 2: Edge Function - azure-sync

**File**: `supabase/functions/azure-sync/index.ts`

**Responsibilities**:
1. List all blobs in Azure container
2. Filter for schedule files matching pattern `{companyid}_schedules.json`
3. Download and process `users.json`
4. Process schedule files:
   - Download JSON
   - Upsert company record in `companies` table
   - Upsert group record in `service_company_groups` table
   - Upload to Supabase Storage: `{company_id}/{date}/schedule.json`
   - Update `schedule_data` metadata
5. Process user file:
   - Download JSON
   - For each User:
     - Create/update in Supabase Auth (admin API)
     - Upsert `user_profiles` record
     - Handle deletions (users removed from Azure file → hard delete in Supabase)
6. Log sync results to `sync_jobs` table

**Key Code Sections**:

```typescript
// Fetch blob list from Azure
async function listAzureBlobs(sasUrl: string): Promise<string[]> {
  const listUrl = `${sasUrl}&restype=container&comp=list`
  const response = await fetch(listUrl)
  // Parse XML response, extract blob names
  return blobNames
}

// Download specific blob
async function downloadBlob(sasUrl: string, blobName: string): Promise<any> {
  const blobUrl = `${sasUrl.split('?')[0]}/${blobName}?${sasUrl.split('?')[1]}`
  const response = await fetch(blobUrl)
  return response.json()
}

// Sync users with create/update/delete logic
async function syncUsers(usersData: any) {
  // Collect all user IDs from Azure
  const azureUserIds = new Set<string>()
  for (const group of usersData.ServiceCompanyGroups) {
    for (const company of group.ServiceCompanies) {
      for (const user of company.Users) {
        azureUserIds.add(user.UserId)
      }
    }
  }

  // Get all existing users
  const { data: existingUsers } = await supabase
    .from('user_profiles')
    .select('id, email')

  // Create/Update users from Azure
  for (const group of usersData.ServiceCompanyGroups) {
    for (const company of group.ServiceCompanies) {
      for (const user of company.Users) {
        // Upsert to auth.users and user_profiles
        await supabase.auth.admin.createUser({
          email: user.Email,
          user_metadata: { ... }
        })
      }
    }
  }

  // Hard delete users not in Azure file
  for (const existing of existingUsers) {
    if (!azureUserIds.has(existing.id)) {
      await supabase.auth.admin.deleteUser(existing.id)
    }
  }
}
```

### Phase 3: pg_cron Schedule (15 minutes)

```sql
SELECT cron.schedule(
  'azure-sync-15min',
  '*/15 * * * *',  -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/azure-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  ) as request_id;
  $$
);
```

### Phase 4: Database Schema Updates

No major changes needed - existing schema supports this:
- `service_company_groups` - populated from Azure group data
- `companies` - populated from Azure ServiceCompanies
- `user_profiles` - synced from Azure user files
- `schedule_data` - metadata pointing to Supabase Storage
- `sync_jobs` - audit trail of sync operations

**Minor addition** - track last processed blob:
```sql
ALTER TABLE service_company_groups
ADD COLUMN last_user_sync_at TIMESTAMPTZ,
ADD COLUMN last_user_file_hash TEXT;

ALTER TABLE schedule_data
ADD COLUMN azure_blob_name TEXT,
ADD COLUMN azure_blob_hash TEXT;
```

### Phase 5: Optimization - Skip Unchanged Files

To avoid re-processing unchanged files every 15 minutes:
1. Store blob ETag/hash when processed
2. On next sync, compare ETag before downloading
3. Skip if unchanged

```typescript
// Check if blob changed since last sync
const blobHeaders = await fetch(blobUrl, { method: 'HEAD' })
const etag = blobHeaders.headers.get('ETag')

const { data: existing } = await supabase
  .from('schedule_data')
  .select('azure_blob_hash')
  .eq('azure_blob_name', blobName)
  .single()

if (existing?.azure_blob_hash === etag) {
  console.log(`Skipping ${blobName} - unchanged`)
  return
}
```

---

## Files to Create/Modify (Supabase)

### New Files
1. `supabase/functions/azure-sync/index.ts` - Main sync Edge Function

### Modified Files
1. `supabase/migrations/xxx_azure_sync_schema.sql` - Add blob tracking columns

### Remove/Deprecate
1. `supabase/functions/hourly-sync/` - No longer needed (replaced by azure-sync)
2. `supabase/functions/background-worker/` - May simplify or remove if azure-sync handles everything

---

## Data Flow Summary

```
Every 15 minutes:
  1. pg_cron → triggers azure-sync Edge Function

  2. azure-sync lists Azure blobs:
     - 1_schedules.json (schedule for company 1)
     - 2_schedules.json (schedule for company 2)
     - users.json (all users)

  3. For users.json (if changed):
     - Download from Azure
     - Sync to Supabase Auth (create/update/delete)
     - Update user_profiles

  4. For each schedule blob (if changed):
     - Download from Azure
     - Extract company/group metadata
     - Upload to Supabase Storage: 1/2025-12-10/schedule.json
     - Update schedule_data metadata

  5. Log results to sync_jobs table
```

---

## Security Considerations

1. **Azure SAS Token**: Store in Supabase Secrets, not env vars
2. **Token Rotation**: SAS tokens should have expiry, rotate before expiry
3. **RLS**: Existing policies ensure users only see their company data
4. **User Deletion**: Users removed from Azure are hard deleted (not soft deactivate)

---

## Rollback Plan

If issues arise:
1. Disable pg_cron job: `SELECT cron.unschedule('azure-sync-15min')`
2. Data in Supabase Storage remains intact
3. Can re-enable original MaidCentral API sync if needed

---

## Design Decisions

1. ✅ Azure file naming: `{servicecompanyid}_schedules.json` (per company) and `users.json` (single file for all)
2. ✅ Single file per company containing 7 days of jobs
3. ✅ Built from scratch on both ends
4. ✅ User data also from Azure blob files
5. ✅ Hard delete users when removed from Azure (not soft deactivate)
6. ✅ Auto-bootstrap: Create groups/companies on first sync if tables empty

---

---

# Part 2: MaidCentral V2 Server - Azure Blob Export Prompt

## Implementation Prompt

Use the following prompt to implement the V2 server-side Azure Blob export:

---

**PROMPT:**

Create a background job that exports schedule and user data to Azure Blob Storage every 15 minutes. This data will be consumed by a Supabase backup portal.

### Requirements

**Schedule Export** - One file per ServiceCompany:
- File name: `{ServiceCompanyId}_schedules.json`
- Contains all jobs for a 7-day rolling window (today + 6 days)
- Reuse existing `/api/dr-schedule` endpoint logic for fetching jobs
- Include company's FeatureToggles in the export
- Include ServiceCompanyGroupId and ServiceCompanyGroupName for group association

**User Export** - Single file for ALL users:
- File name: `users.json`
- Contains all users across ALL active ServiceCompanyGroups
- Reuse existing `/api/dr-schedule/users` endpoint logic
- Nested structure: ServiceCompanyGroups → ServiceCompanies → Users

### File Formats

**Schedule file** (`1_schedules.json`):
```json
{
  "ServiceCompanyId": 1,
  "ServiceCompanyGroupId": 1,
  "ServiceCompanyGroupName": "Castle Keepers",
  "Name": "Charleston",
  "IsActive": true,
  "TimeZoneInfoId": "Eastern Standard Time",
  "GeneratedAt": "2025-12-10T21:00:53Z",
  "DateRangeStart": "2025-12-10",
  "DateRangeEnd": "2025-12-16",
  "FeatureToggles": {
    "TechDashboard_DisplayBillRate": true,
    "TechDashboard_DisplayCustomerPhoneNumbers": false,
    ...
  },
  "Jobs": [ /* Format A job structure */ ]
}
```

**User file** (`users.json`):
```json
{
  "GeneratedAt": "2025-12-09T06:00:00Z",
  "ServiceCompanyGroups": [
    {
      "ServiceCompanyGroupId": 32,
      "ServiceCompanyGroupName": "Company Name",
      "IsActive": true,
      "ServiceCompanies": [
        {
          "ServiceCompanyId": 59,
          "Name": "Company Name",
          "ServiceCompanyGroupId": 32,
          "IsActive": true,
          "Users": [
            {
              "UserId": "guid",
              "Email": "user@example.com",
              "EmployeeInformationId": 3013,
              "FirstName": "John",
              "LastName": "Doe",
              "FullName": "John Doe",
              "Roles": ["Administrator", "Employee"],
              "ServiceCompanyId": 59
            }
          ]
        }
      ]
    }
  ]
}
```

### Technical Requirements

1. Use Hangfire (or similar) for 15-minute recurring job
2. Use `Azure.Storage.Blobs` SDK for uploads
3. Store Azure connection string and container name in configuration
4. **Optimization (optional)**: Track content hash to skip unchanged exports

### Configuration Needed

```json
{
  "AzureBlob": {
    "ConnectionString": "...",
    "ContainerName": "mc-backup-data"
  },
  "BackupExport": {
    "Enabled": true,
    "IntervalMinutes": 15,
    "RollingWindowDays": 7
  }
}
```

---

## Implementation Checklist

### Supabase Side
- [ ] Add Azure SAS URL to Supabase secrets
- [ ] Create `azure-sync` Edge Function
- [ ] Add database migration for blob tracking columns
- [ ] Set up pg_cron job (15-minute schedule)
- [ ] Test with sample Azure blob data
- [ ] Monitor first few syncs

### V2 Server Side
- [ ] Add `Azure.Storage.Blobs` NuGet package
- [ ] Create `AzureBlobExportService`
- [ ] Add export DTOs
- [ ] Configure Hangfire job
- [ ] Add appsettings configuration
- [ ] Test export to Azure
- [ ] Monitor first few exports
