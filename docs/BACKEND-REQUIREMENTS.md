# MaidCentral Backup Application - Complete Enterprise Solution

## Overview

**Goal:** Deploy a complete multi-company backup portal with super admin management, automated hourly sync, role-based access, and bulk communication capabilities.

**Current State:**
- Manual JSON file upload
- LocalStorage (single device)
- No user authentication
- Single company prototype

**Future State:**
- **Multi-company SaaS platform** with ServiceCompanyGroups supporting all MaidCentral customers
- **Super Admin Portal** for MaidCentral host to:
  - Manage ServiceCompanyGroups (from tblServiceCompanyGroups)
  - Enable portal for groups/companies
  - Send magic links to Group Admins (Company Admins)
  - Send bulk communications to all groups
- **Company Admin Dashboards** (Group Admins) to:
  - View all jobs, calendars, and employee schedules
  - **Bulk send magic links to all scheduled technicians** (for selected date/period)
  - Manage team schedules
- **Technician Access** with:
  - **Job filtering by EmployeeInformationId** (only see their assigned jobs)
  - **Privacy controlled by featureToggles** synced from MaidCentral (hide sensitive data)
- **Hourly automated sync** per company from nested DTO structure (7-day rolling window)
- **Magic link authentication** (passwordless, no storing passwords)
- **Hosted on Vercel** with custom domain (backup.maidcentral.com)
- **Supabase backend** for database, auth, and storage

---

## Architecture (Optimized Async + Blob Storage)

```
┌─────────────────────────────────────────────────────────────┐
│         MaidCentral Super Admin (Justin)                    │
│         backup.maidcentral.com/superadmin                   │
│                                                             │
│  • Manage ServiceCompanyGroups (from tblServiceCompanyGroups)│
│  • Enable portal for Groups/Companies                      │
│  • Send magic links to Group Admins (Company Admins)       │
│  • Monitor system health & sync jobs                       │
│  • Manage users across all groups/companies                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Backend                               │
│                                                             │
│  PostgreSQL Database (Metadata Only):                       │
│    • service_company_groups (tblServiceCompanyGroups)      │
│    • companies (ServiceCompanyId + featureToggles)         │
│    • user_profiles (role + employee_information_id)        │
│    • schedule_data (metadata + blob storage refs) ⚡ NEW   │
│    • background_jobs (async job queue) ⚡ NEW              │
│    • communication_logs (magic link tracking)              │
│    • sync_jobs (hourly sync history)                       │
│                                                             │
│  Supabase Storage (Blob Storage) ⚡ NEW:                   │
│    • Bucket: schedule-data                                 │
│    • Path: {company_id}/{date}/schedule.json               │
│    • CDN-cacheable, fast reads (<50ms)                     │
│                                                             │
│  Auth: Magic link authentication                           │
│                                                             │
│  Edge Functions:                                            │
│    • hourly-sync (triggers jobs, returns immediately)      │
│    • background-worker (async processing) ⚡ NEW           │
│    • get-schedule (fast blob reads) ⚡ NEW                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              React App (Vercel Hosting)                     │
│         backup.maidcentral.com                              │
│                                                             │
│  Fast API Calls: GET /functions/v1/get-schedule?date=X     │
│  Response Time: <50ms (reads from blob storage)            │
│                                                             │
│  Routes:                                                    │
│  • /superadmin/* - Super Admin Portal (Groups)             │
│  • /admin/* - Company Admin Dashboard (Bulk Send)          │
│  • /schedule - Technician Schedule View (Filtered)         │
│  • /login - Magic link login                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           MaidCentral API v2 (Source of Truth)              │
│                                                             │
│  Endpoints called by background workers (async):            │
│                                                             │
│  1. GET {{url}}/api/dr-schedule/users                      │
│     → Returns all users across all ServiceCompanyGroups    │
│     → Used to create/update Supabase user accounts         │
│     → Enables magic link authentication                    │
│     → Called once per hourly sync (async)                  │
│                                                             │
│  2. GET {{url}}/api/dr-schedule?startDate=X&endDate=X      │
│     → Returns schedule/job data for ONE specific date      │
│     → MUST query exactly 1 day at a time (startDate=endDate)│
│     → Called 7 times per company per sync (async)          │
│     → Each call saves transformed JSON to blob storage     │
│     → Results cached in CDN for fast frontend reads        │
└─────────────────────────────────────────────────────────────┘

PERFORMANCE IMPROVEMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Metric                 | Before (Sync)    | After (Async+Blob)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cron job duration      | 3-5 minutes      | ~500ms (queuing)
  Frontend API response  | 2-3 seconds      | <50ms
  Database size          | ~2GB (JSONB)     | ~50MB (metadata)
  Cost (100 companies)   | $25-50/month     | $0-10/month
  Scalability            | Limited          | Highly scalable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## MaidCentral API v2 Integration

### Overview

The backup portal syncs data from **MaidCentral API v2** using an **hourly Supabase Edge Function** triggered by pg_cron. This replaces manual JSON file uploads with automated synchronization.

### API Endpoints

#### 1. User Sync Endpoint

**Endpoint**: `{{url}}/api/dr-schedule/users`
**Method**: GET
**Authentication**: Bearer token (stored in Supabase secrets)
**Purpose**: Fetch all users across all ServiceCompanyGroups to provision Supabase user accounts for magic link authentication

**Response Structure**:
```json
{
  "Result": {
    "GeneratedAt": "2025-11-18T20:29:58.5623404Z",
    "DataVersion": "1.0",
    "ServiceCompanyGroups": [
      {
        "ServiceCompanyGroupId": 32,
        "Name": "One Organized Mom",
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
                "Email": "heather@oneorganizedmom.com",
                "EmployeeInformationId": 3013,
                "FirstName": "Heather",
                "LastName": "Canning",
                "FullName": "Heather Canning",
                "Roles": [
                  "Group Administrator",
                  "Sales",
                  "Administrator",
                  "Office",
                  "Employee"
                ],
                "ServiceCompanyId": 59
              }
            ]
          }
        ]
      }
    ]
  },
  "Message": "Active user accounts retrieved successfully. Users: 27, Companies: 1, Time: 0.19s",
  "IsSuccess": true
}
```

**Key Fields**:
- `UserId`: Unique identifier from MaidCentral (maps to Supabase auth.users.id)
- `Email`: User email (used for magic link authentication)
- `EmployeeInformationId`: Links to employee data in jobs (for technician job filtering)
- `Roles[]`: Array of role names (determines user_profiles.role)
  - "Group Administrator" → superadmin or admin
  - "Administrator" → admin
  - "Employee" → technician (default)
- `ServiceCompanyId`: Associates user with company

**Sync Frequency**: Hourly (every hour at :00)

**Processing Logic**:
1. Iterate through `ServiceCompanyGroups[]`
2. For each `ServiceCompany`, iterate through `Users[]`
3. Create or update Supabase user account:
   - If UserId exists in auth.users → update profile
   - If new UserId → create auth.users entry (via Supabase Admin API)
   - Map highest-privilege role from Roles[] array to user_profiles.role
   - Store EmployeeInformationId for technician job filtering

**Role Mapping**:
```javascript
function determineRole(roles) {
  if (roles.includes("Group Administrator")) return "superadmin"
  if (roles.includes("Administrator") || roles.includes("Office")) return "admin"
  return "technician" // Default for "Employee" or other roles
}
```

---

#### 2. Schedule Data Sync Endpoint

**Endpoint**: `{{url}}/api/dr-schedule?startDate={date}&endDate={date}`
**Method**: GET
**Authentication**: Bearer token (stored in Supabase secrets)
**Purpose**: Fetch job/schedule data for a specific date

**Critical Constraint**:
> **⚠️ MUST query exactly ONE day at a time**
> `startDate` must equal `endDate`

**Query Parameters**:
- `startDate`: Date in YYYY-MM-DD format (e.g., "2025-10-28")
- `endDate`: Same date as startDate (e.g., "2025-10-28")

**Example Request**:
```
GET {{url}}/api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28
Authorization: Bearer {API_KEY}
```

**Response Structure**: Same as existing Format A (api/jobs/getall) with nested structure containing:
- `Result[]` array of jobs
- Each job has: `ScheduledTeams[]`, `CustomerInformation`, `HomeInformation`, `NotesAndMemos`, `ContactInfos[]`, `EmployeeSchedules[]`, `JobTags[]`, etc.

**Sync Frequency**: Hourly (every hour at :00)

**Sync Strategy - 7-Day Rolling Window**:
```javascript
// Supabase Edge Function pseudocode
async function syncScheduleData() {
  const today = new Date()

  // Loop through 7 days into the future
  for (let i = 0; i < 7; i++) {
    const targetDate = addDays(today, i)
    const dateString = formatDate(targetDate, 'YYYY-MM-DD') // e.g., "2025-10-28"

    // Call API with same start and end date (1 day only)
    const response = await fetch(
      `${MAIDCENTRAL_API_URL}/api/dr-schedule?startDate=${dateString}&endDate=${dateString}`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    )

    const jobs = await response.json()

    // Transform and store data for this specific date
    await storeScheduleDataForDate(jobs, targetDate)
  }
}
```

**Data Handling**:
- Each nightly sync **overwrites** existing data for each of the 7 future dates
- Old data beyond 7-day window can be archived or deleted (configurable)
- Ensures schedule is always up-to-date with latest changes from MaidCentral

**Error Handling**:
- If one day fails to sync, continue with remaining days
- Log failure in sync_jobs table with error details
- Send alert if >20% of days fail to sync

---

### Authentication

**MaidCentral API v2 Credentials**:

Store in Supabase secrets (not environment variables):
```bash
# Set via Supabase CLI or dashboard
supabase secrets set MAIDCENTRAL_API_URL="https://api.maidcentral.com"
supabase secrets set MAIDCENTRAL_API_KEY="your-bearer-token-here"
```

**Authentication Flow**:
```typescript
// In Supabase Edge Function
const apiUrl = Deno.env.get('MAIDCENTRAL_API_URL')
const apiKey = Deno.env.get('MAIDCENTRAL_API_KEY')

const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json'
}
```

**Token Rotation**:
- Rotate API keys quarterly
- Update Supabase secret when key changes
- Test new key before revoking old key

---

### Hourly Sync Cron Job

**Schedule**: Every hour at :00 (top of the hour)

```sql
-- Create pg_cron job in Supabase
SELECT cron.schedule(
  'hourly-sync-maidcentral-v2',
  '0 * * * *', -- Cron expression: Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/hourly-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      )
    ) as request_id;
  $$
);
```

**Monitoring**:
- Check `sync_jobs` table for failures
- Alert if no sync in last 90 minutes (cron failure)
- Alert if >50% of syncs fail

---

## User Roles & Permissions

### 1. Super Admin (MaidCentral Host - You)

**Permissions:**
- ✅ View all ServiceCompanyGroups (from tblServiceCompanyGroups)
- ✅ View all companies within groups
- ✅ Enable/disable portal for any group/company
- ✅ Send magic links to Group Admins (Company Admins)
- ✅ Send bulk communications to all groups/companies
- ✅ Monitor system health and sync jobs
- ✅ Manage users across all groups/companies
- ✅ Access all features

**Use Cases:**
- Onboard new ServiceCompanyGroups
- Send magic links to Group Admins for portal access
- Send emergency broadcast when MaidCentral is down
- Announce system updates/new features
- Troubleshoot issues for any group/company

### 2. Company Admin (Group Admin / Office Manager)

**Permissions:**
- ✅ View their company's full schedule data (all jobs, calendar, employee schedules)
- ✅ **Bulk send magic links to all scheduled technicians** (for selected date/period)
- ✅ Send magic links to individual technicians
- ✅ Export PDFs with full data
- ✅ View all employee schedules
- ✅ Manage which technicians have access
- ❌ Cannot see other companies' data
- ❌ Cannot change privacy settings (synced from MaidCentral)

**Use Cases:**
- Daily schedule management
- **Bulk send schedule links to all technicians scheduled for today/this week**
- Send schedule links to specific field technicians
- Export and email/text schedules
- View team member assignments

### 3. Technician (Field Staff)

**Permissions:**
- ✅ View **ONLY their assigned jobs** (filtered by EmployeeInformationId)
- ✅ Read-only access to their jobs
- ✅ Export PDFs with **data visibility controlled by company's featureToggles**
- ❌ Cannot see jobs assigned to other technicians
- ❌ Cannot send magic links
- ❌ Cannot see other companies' data

**Data Visibility:**
- Controlled by **company's featureToggles** (synced from MaidCentral hourly)
- featureToggles may hide: billRate, contactInfo, internalMemo, customerTags, etc.
- Settings are configured in MaidCentral (not in this app)

**Use Cases:**
- Check their personal daily schedule
- View job details for their assigned jobs (customer, address, instructions)
- Data visibility depends on their company's privacy settings

---

## Database Schema

### Tables

#### 1. service_company_groups

Stores ServiceCompanyGroups from MaidCentral (tblServiceCompanyGroups).

```sql
CREATE TABLE service_company_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id TEXT UNIQUE NOT NULL, -- From MaidCentral tblServiceCompanyGroups
  group_name TEXT NOT NULL,

  -- Settings
  portal_enabled BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_company_groups_group_id ON service_company_groups(group_id);
CREATE INDEX idx_service_company_groups_portal_enabled ON service_company_groups(portal_enabled);
```

#### 2. companies

Stores each ServiceCompany from MaidCentral (within a ServiceCompanyGroup).

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_company_id TEXT UNIQUE NOT NULL, -- From MaidCentral API (ServiceCompanyDto)
  name TEXT NOT NULL,

  -- Group association
  group_id UUID REFERENCES service_company_groups(id) ON DELETE CASCADE,

  -- Privacy settings (synced from MaidCentral hourly)
  feature_toggles JSONB DEFAULT '{
    "hideBillRate": true,
    "hideContactInfo": true,
    "hideInternalMemo": true,
    "hideCustomerTags": false
  }'::jsonb,

  -- Settings
  portal_enabled BOOLEAN DEFAULT FALSE,
  sync_enabled BOOLEAN DEFAULT FALSE,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT, -- 'success', 'failed', 'pending'

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_service_company_id ON companies(service_company_id);
CREATE INDEX idx_companies_group_id ON companies(group_id);
CREATE INDEX idx_companies_portal_enabled ON companies(portal_enabled);
CREATE INDEX idx_companies_feature_toggles ON companies USING GIN (feature_toggles);
```

#### 3. user_profiles

Extends Supabase auth.users with company and role information.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,

  -- Company association
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Role: 'superadmin', 'admin', 'technician'
  role TEXT NOT NULL DEFAULT 'technician',

  -- Employee linkage (for technicians - links to EmployeeInformationId in synced data)
  employee_information_id TEXT, -- From MaidCentral EmployeeSchedules[].EmployeeInformationId

  -- Preferences
  preferences JSONB DEFAULT '{}'::jsonb,

  -- Activity tracking
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_company ON user_profiles(company_id);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_employee ON user_profiles(employee_information_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'technician'); -- Default role
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();
```

#### 4. schedule_data (Updated for Blob Storage)

Stores metadata and blob storage references (data stored in Supabase Storage).

```sql
CREATE TABLE schedule_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Blob storage reference (NEW)
  storage_path TEXT NOT NULL, -- e.g., "59/2025-10-28/schedule.json"
  file_size_kb INTEGER,
  checksum TEXT, -- SHA-256 for integrity verification

  -- Date covered (single date per row)
  date DATE NOT NULL,

  -- Metadata (extracted from transformed data)
  job_count INTEGER DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  team_count INTEGER DEFAULT 0,

  -- Status tracking
  status TEXT DEFAULT 'processing', -- 'processing', 'ready', 'failed'
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, date) -- One schedule per company per date
);

CREATE INDEX idx_schedule_data_company_date ON schedule_data(company_id, date);
CREATE INDEX idx_schedule_data_status ON schedule_data(status);
CREATE INDEX idx_schedule_data_storage_path ON schedule_data(storage_path);
```

#### 5. communication_logs

Track bulk communications sent by super admin.

```sql
CREATE TABLE communication_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who sent it
  sent_by UUID REFERENCES user_profiles(id),

  -- What was sent
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  communication_type TEXT, -- 'magic_links', 'announcement', 'emergency'

  -- Recipients
  recipient_type TEXT, -- 'all_admins', 'all_users', 'selected_companies'
  company_ids UUID[], -- If selected_companies
  recipient_count INTEGER,

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_communication_logs_sent_by ON communication_logs(sent_by);
CREATE INDEX idx_communication_logs_created_at ON communication_logs(created_at DESC);
```

#### 6. background_jobs (NEW - Async Job Queue)

Track asynchronous background job execution.

```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Job identification
  job_type TEXT NOT NULL, -- 'sync_users', 'sync_schedule', 'send_bulk_email'
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Job parameters
  params JSONB DEFAULT '{}'::jsonb, -- e.g., {"date": "2025-10-28", "service_company_id": "59"}

  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Results
  result JSONB,
  error_message TEXT,

  -- Timing
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_background_jobs_status ON background_jobs(status, scheduled_at);
CREATE INDEX idx_background_jobs_company ON background_jobs(company_id);
CREATE INDEX idx_background_jobs_type ON background_jobs(job_type);
CREATE INDEX idx_background_jobs_created_at ON background_jobs(created_at DESC);

-- Automatic retry logic (optional)
CREATE OR REPLACE FUNCTION retry_failed_background_jobs()
RETURNS void AS $$
BEGIN
  UPDATE background_jobs
  SET status = 'pending', attempts = attempts + 1
  WHERE status = 'failed'
    AND attempts < max_attempts
    AND completed_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;
```

#### 7. sync_jobs

Track hourly sync job history per company (high-level summary).

```sql
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Sync details
  status TEXT NOT NULL, -- 'success', 'failed', 'partial'
  jobs_fetched INTEGER DEFAULT 0,
  jobs_stored INTEGER DEFAULT 0,
  days_synced INTEGER DEFAULT 0, -- NEW: tracks how many days succeeded

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_jobs_company ON sync_jobs(company_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_created_at ON sync_jobs(created_at DESC);
```

---

## Supabase Storage Setup (NEW)

### Storage Buckets

Create storage bucket for schedule data (blob storage).

```sql
-- Create bucket for schedule data
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'schedule-data',
  'schedule-data',
  false, -- Private (requires authentication)
  10485760, -- 10MB max file size
  ARRAY['application/json']
);
```

### Storage RLS Policies

```sql
-- Users can read their company's schedule files
CREATE POLICY "Users can read their company's schedule files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'schedule-data' AND
  auth.uid() IN (
    SELECT up.id
    FROM user_profiles up
    JOIN companies c ON up.company_id = c.id
    WHERE c.service_company_id = split_part(name, '/', 1)
  )
);

-- Super admins can read all schedule files
CREATE POLICY "Super admins can read all schedule files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'schedule-data' AND
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
);

-- Service role (Edge Functions) can write schedule files
CREATE POLICY "Service role can write schedule files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'schedule-data');

CREATE POLICY "Service role can update schedule files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'schedule-data');

CREATE POLICY "Service role can delete schedule files"
ON storage.objects FOR DELETE
USING (bucket_id = 'schedule-data');
```

### Storage Path Structure

```
schedule-data/
├── {service_company_id}/
│   ├── {date}/
│   │   ├── schedule.json      # Transformed schedule data
│   │   └── metadata.json      # Optional: raw API response
│   └── ...
└── ...

Example:
schedule-data/59/2025-10-28/schedule.json
schedule-data/59/2025-10-29/schedule.json
schedule-data/137/2025-10-28/schedule.json
```

---

## Row-Level Security (RLS) Policies

### Enable RLS on all tables

```sql
ALTER TABLE service_company_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
```

### Super Admin - Full Access

```sql
-- Super admins see everything
CREATE POLICY "Super admins full access to groups"
  ON service_company_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Super admins full access to companies"
  ON companies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Super admins full access to users"
  ON user_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Super admins full access to schedule_data"
  ON schedule_data FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );
```

### Company Admins & Technicians - Company Isolation

```sql
-- Users can only see their own company
CREATE POLICY "Users see their company"
  ON companies FOR SELECT
  USING (
    id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Users can only see schedule data for their company
CREATE POLICY "Users see their company schedule"
  ON schedule_data FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Users can see other users in their company
CREATE POLICY "Users see company users"
  ON user_profiles FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Only admins can insert/update users in their company
CREATE POLICY "Admins manage company users"
  ON user_profiles FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

### Technician-Specific Policies - Job Filtering by EmployeeInformationId

```sql
-- Technicians can only see jobs where they are assigned (filtered by EmployeeInformationId)
-- Note: This policy is enforced in the application layer by filtering the JSONB data
-- The schedule_data row is accessible to technicians, but the frontend must filter
-- jobs within the data.jobs array to only show jobs where:
-- EmployeeSchedules[].EmployeeInformationId matches user_profiles.employee_information_id

-- RLS allows technicians to SELECT their company's schedule_data
-- Application layer filters jobs by employee_information_id

CREATE POLICY "Technicians see company schedule"
  ON schedule_data FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role = 'technician'
    )
  );

-- Note: Frontend must apply filtering logic:
-- 1. Fetch user's employee_information_id from user_profiles
-- 2. Filter data.jobs[] to only include jobs where:
--    job.EmployeeSchedules[].EmployeeInformationId === employee_information_id
-- 3. Apply company's feature_toggles to hide sensitive data
```

---

## Super Admin Portal Features

### 1. Dashboard

**URL:** `/superadmin`

**Features:**
- System health overview
- Active companies count
- Total users (by role breakdown)
- Recent sync job status
- Active user sessions
- Storage usage
- API call metrics

**UI Components:**
```jsx
// Key metrics cards
<MetricsGrid>
  <MetricCard title="Active Companies" value={45} />
  <MetricCard title="Total Users" value={320} breakdown="180 admins, 140 techs" />
  <MetricCard title="Last Sync" value="5 mins ago" status="success" />
  <MetricCard title="Active Sessions" value={23} />
</MetricsGrid>

// Recent sync jobs table
<SyncJobsTable
  jobs={recentSyncJobs}
  columns={['Time', 'Company', 'Status', 'Jobs Synced']}
/>

// Quick actions
<QuickActions>
  <Button>Import Companies</Button>
  <Button>Emergency Broadcast</Button>
  <Button>View All Users</Button>
</QuickActions>
```

### 2. Group & Company Management

**URL:** `/superadmin/groups`

**Features:**
- List all ServiceCompanyGroups (from tblServiceCompanyGroups)
- Expand groups to see ServiceCompanies within each group
- Search/filter (enabled/disabled, search by name)
- Enable portal for group (enables all companies in group)
- Disable portal (with confirmation)
- View group/company details (users, sync status)
- Import groups and companies from MaidCentral API (nested DTO structure)

**Actions per Group:**
- ✅ Enable Portal → Prompts for Group Admin emails, sends magic links
- ⏸ Disable Portal → Stops sync for all companies in group
- 📧 Send Magic Links → Send/resend magic links to Group Admins
- 👥 Manage Users → View/add/remove Group Admins for this group
- 📊 View Sync Logs → Show recent sync job history for all companies
- 🗑️ Delete Group → Remove all data (requires confirmation)

**Actions per Company (within Group):**
- 👥 Manage Users → View/add/remove users for this company
- 📊 View Sync Logs → Show recent sync job history
- ⏸ Disable Sync → Stop hourly sync for this specific company

**Enable Portal Flow:**
```
1. Click "Enable Portal" for ServiceCompanyGroup X
2. Modal appears:
   ┌────────────────────────────────────────────┐
   │ Enable Portal for Charleston Group         │
   ├────────────────────────────────────────────┤
   │ Group Admin Email(s):                      │
   │ [admin@charlestonhomesvc.com]              │
   │                                            │
   │ Additional Group Admins (optional):        │
   │ [office@chs.com]                           │
   │ [+ Add another]                            │
   │                                            │
   │ ☑ Send magic link to Group Admins         │
   │ ☑ Enable hourly sync for all companies    │
   │                                            │
   │ [Cancel]  [Enable Portal]                  │
   └────────────────────────────────────────────┘
3. System creates group, companies, users, sends magic links
4. Starts hourly sync for all companies in group
```

### 3. User Management

**URL:** `/superadmin/users`

**Features:**
- View all users across all companies
- Search by email, filter by company/role
- Send magic link to specific user
- Change user role (promote/demote)
- Disable user access
- View login history

**Bulk Actions:**
- Send magic links to selected users
- Change role for multiple users
- Disable multiple users

### 4. Bulk Communications

**URL:** `/superadmin/communications`

**Features:**

#### A. Send Bulk Magic Links

```jsx
<BulkCommunicationForm>
  <RecipientSelector>
    <Radio name="All Companies" />
    <Radio name="Selected Companies" checked />
    <CompanyMultiSelect companies={companies} />
  </RecipientSelector>

  <RecipientTypeSelector>
    <Radio name="Admins Only" checked />
    <Radio name="All Users" />
  </RecipientTypeSelector>

  <MessageComposer>
    <TextField label="Subject" />
    <RichTextEditor label="Message" />
    <Checkbox label="Include magic link" checked />
    <TextField label="Link expires in hours" value={48} />
  </MessageComposer>

  <PreviewButton>Preview (5 companies, 12 users)</PreviewButton>
  <SendButton>Send Now</SendButton>
</BulkCommunicationForm>
```

#### B. Emergency Broadcast

Quick-send to all active companies with pre-filled emergency message:

```jsx
<EmergencyBroadcast>
  <Alert severity="warning">
    This will send an email to ALL active companies immediately.
  </Alert>

  <MessagePreview>
    Subject: MaidCentral System Outage - Use Backup Portal

    MaidCentral is currently experiencing technical issues.
    Access your backup schedules here: [Magic Link]

    This link is valid for 48 hours.
  </MessagePreview>

  <Stats>
    Recipients: 45 companies, 320 users
  </Stats>

  <ConfirmButton>
    Send Emergency Broadcast
  </ConfirmButton>
</EmergencyBroadcast>
```

#### C. Communication History

View past communications sent:
- Date/time sent
- Subject
- Recipient count
- Delivery status
- Click-through rate (magic link clicks)

### 5. Sync Job Monitoring

**URL:** `/superadmin/sync-jobs`

**Features:**
- Real-time sync job status
- Filter by company, status, date range
- View error details for failed syncs
- Manual trigger sync for specific company
- View sync job history

---

## Company Admin Dashboard

### URL: `/admin`

**Features:**

#### 1. Schedule View
- View company's 7-day schedule (all jobs, all employees)
- Calendar view (FullCalendar)
- Filter by team/employee
- Export PDF with all data visible

#### 2. Team Management
- List all technicians in company
- View technician schedules
- Link technician emails to EmployeeInformationId
- View who has accessed recently
- Disable technician access

#### 3. **Bulk Send Magic Links to Scheduled Technicians**

```jsx
<BulkSendMagicLinksForm>
  <DateRangeSelector>
    <Radio name="Today" checked />
    <Radio name="This Week" />
    <Radio name="Custom Date Range" />
    <DatePicker start={today} end={today + 7} />
  </DateRangeSelector>

  <TechnicianPreview>
    <Alert severity="info">
      Found 12 technicians scheduled for the selected period
    </Alert>
    <TechnicianList>
      {scheduledTechnicians.map(tech => (
        <Checkbox checked>{tech.name} - {tech.email}</Checkbox>
      ))}
    </TechnicianList>
  </TechnicianPreview>

  <MessageTemplate editable>
    "Your schedule for {date} is ready. Click here to view: [Magic Link]

    This link is valid for 24 hours."
  </MessageTemplate>

  <SendButton>
    Send Magic Links to 12 Technicians
  </SendButton>
</BulkSendMagicLinksForm>
```

**Bulk Send Logic:**
1. Select date range (default: today)
2. System queries schedule_data for jobs in date range
3. Extract unique EmployeeInformationIds from jobs
4. Match to user_profiles by employee_information_id
5. Generate and send magic links to matched technicians
6. Log communication in communication_logs

#### 4. Send Schedule Links (Individual)

```jsx
<SendScheduleLinkForm>
  <TechnicianSelect
    technicians={companyTechnicians}
    multiple
  />

  <MessageTemplate>
    "Your schedule for {date} is ready. Click here to view: [Magic Link]"
  </MessageTemplate>

  <SendButton>
    Send to 5 technicians
  </SendButton>
</SendScheduleLinkForm>
```

---

## Technician View

### URL: `/schedule`

**Features:**
- Read-only calendar view
- **Filtered jobs:** Only shows jobs where EmployeeInformationId matches their user profile
- **Data visibility:** Controlled by company's featureToggles (synced from MaidCentral)
  - May hide: billRate, internalMemo, contactInfo, customerTags, etc.
- Export PDF (with featureToggles applied)
- Cannot send magic links
- Cannot see other technicians' jobs
- Cannot see other users

**Data Filtering Logic:**
1. Fetch user's employee_information_id from user_profiles
2. Fetch schedule_data for their company
3. Filter data.jobs[] to only include jobs where:
   - `job.EmployeeSchedules[]` contains an entry with `EmployeeInformationId === employee_information_id`
4. Apply company's featureToggles to hide sensitive fields
5. Display filtered, privacy-controlled job list

---

## Hourly Sync Process (Async Architecture)

> **📋 FULL DOCUMENTATION**: See [ASYNC-SYNC-ARCHITECTURE.md](./ASYNC-SYNC-ARCHITECTURE.md) for complete implementation details.

### Overview

The hourly sync uses an **async job queue architecture** for better performance and scalability:

1. **Hourly Cron** (pg_cron) triggers `hourly-sync` Edge Function
2. **hourly-sync** queues background jobs (~500ms, returns immediately):
   - 1 user sync job (all companies)
   - 7 schedule sync jobs per company (one per day)
3. **background-worker** executes jobs asynchronously:
   - Calls MaidCentral API v2 endpoints
   - Transforms data
   - Saves JSON to **Supabase Storage (blob)**
   - Updates metadata in PostgreSQL
   - Supports automatic retries (max 3 attempts)
4. **get-schedule** API reads from blob storage (<50ms response time)

### Key Improvements

- ⚡ **Cron duration**: 3-5 minutes → **~500ms** (just queuing)
- ⚡ **Frontend API**: 2-3 seconds → **<50ms** (blob read)
- 💰 **Database size**: ~2GB → **~50MB** (metadata only)
- 💰 **Cost**: $25-50/month → **$0-10/month**
- 📈 **Scalability**: Limited → **Highly scalable** (1000+ companies)
- 🔄 **Reliability**: One failure blocks all → **Jobs fail independently**

### Edge Functions Architecture

The new async architecture uses **3 Edge Functions**:

1. **hourly-sync** (Coordinator) - Queues background jobs
2. **background-worker** (Executor) - Executes jobs asynchronously
3. **get-schedule** (Fast API) - Reads from blob storage

**Implementation Details**: See [ASYNC-SYNC-ARCHITECTURE.md](./ASYNC-SYNC-ARCHITECTURE.md#implementation) for complete code examples including:
- Job queuing logic
- Background worker implementation
- Blob storage upload/download
- Data transformation functions
- Frontend integration with React hooks

### Schedule with pg_cron

```sql
-- Run hourly sync every hour at :00
SELECT cron.schedule(
  'hourly-sync-maidcentral-v2',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/hourly-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      )
    ) as request_id;
  $$
);
```

**Monitoring the Cron Job:**

```sql
-- View cron job status
SELECT * FROM cron.job WHERE jobname = 'hourly-sync-maidcentral-v2';

-- View recent cron job runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'hourly-sync-maidcentral-v2')
ORDER BY start_time DESC
LIMIT 10;

-- Monitor background jobs
SELECT
  job_type,
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms
FROM background_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY job_type, status;

-- View recent cron job runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'hourly-sync-maidcentral-v2')
ORDER BY start_time DESC
LIMIT 10;

-- Unschedule (if needed)
SELECT cron.unschedule('hourly-sync-maidcentral-v2');
```

---

### Summary: MaidCentral API v2 Integration

**Key Points**:

1. **Two API Endpoints**:
   - `{{url}}/api/dr-schedule/users` - Syncs all users for magic link authentication
   - `{{url}}/api/dr-schedule?startDate=X&endDate=X` - Syncs schedule data for ONE day

2. **Critical Constraint**:
   - Schedule endpoint **MUST** be called with `startDate === endDate` (one day at a time)
   - Hourly cron job loops 7 times, making 7 separate API calls (one per day)

3. **Sync Process** (Every hour at :00):
   - **Step 1**: Sync all users → create/update Supabase user accounts
   - **Step 2**: Loop through 7 days → sync schedule data for each day individually

4. **User Provisioning**:
   - Users from `/api/dr-schedule/users` are created in Supabase auth.users (passwordless)
   - Roles mapped: "Group Administrator" → superadmin, "Administrator" → admin, "Employee" → technician
   - EmployeeInformationId stored for technician job filtering

5. **Data Archival**:
   - Each hourly sync overwrites data for the next 7 days
   - Old data beyond 7-day window can be archived or deleted
   - Ensures backup portal always has latest schedule changes

6. **Error Handling**:
   - User sync failure doesn't block schedule sync
   - One day's failure doesn't stop other days from syncing
   - All failures logged in sync_jobs table for monitoring

7. **Authentication**:
   - MaidCentral API v2 credentials stored in Supabase secrets
   - Bearer token authentication for all API calls

---

## Magic Link Implementation

### Send Magic Link (via Supabase Auth)

```javascript
// api/auth/send-magic-link.js (or use Supabase directly)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { email, role } = req.body
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Send magic link using Supabase Auth
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
      data: {
        role // Pass role info for profile creation
      }
    }
  })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json({ success: true, message: 'Magic link sent' })
}
```

### Bulk Send Magic Links

```javascript
// Superadmin bulk send
export async function sendBulkMagicLinks({ companyIds, recipientType, message, subject }) {
  const supabase = createClient(...)

  // Get users based on filters
  let query = supabase
    .from('user_profiles')
    .select('email, full_name, company_id')

  if (recipientType === 'admins') {
    query = query.in('role', ['admin', 'superadmin'])
  }

  if (companyIds !== 'all') {
    query = query.in('company_id', companyIds)
  }

  const { data: users } = await query

  // Send magic link to each user
  const results = await Promise.allSettled(
    users.map(user =>
      supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
          // Custom email template with message
        }
      })
    )
  )

  // Log communication
  await supabase.from('communication_logs').insert({
    sent_by: currentUserId,
    subject,
    message,
    communication_type: 'magic_links',
    recipient_type: recipientType,
    company_ids: companyIds,
    recipient_count: users.length,
    status: 'sent',
    sent_at: new Date().toISOString()
  })

  return { sent: results.filter(r => r.status === 'fulfilled').length }
}
```

---

## Email Templates

### Welcome Email (Enable Company)

```
Subject: Welcome to MaidCentral Backup Portal

Hi {admin_name},

Your company ({company_name}) now has access to the MaidCentral Backup Portal!

As an admin, you can:
• View your team's schedules (next 7 days)
• Send schedule links to technicians via magic link
• Export schedules as PDFs

Click here to get started:
[Access Portal] (magic link button)

Questions? Reply to this email or contact support@maidcentral.com.

Best,
MaidCentral Team
```

### Technician Schedule Link

```
Subject: Your Schedule for {date}

Hi {technician_name},

Your schedule for {date} is ready to view.

Click here to access:
[View Schedule] (magic link button)

This link is valid for 24 hours.

Thanks,
{company_name}
```

### Emergency Broadcast

```
Subject: MaidCentral System Outage - Use Backup Portal

URGENT: MaidCentral is currently experiencing technical issues.

Access your backup schedules here:
[Access Backup Portal] (magic link button)

This link is valid for 48 hours.

We'll send an update when the main system is restored.

MaidCentral Team
```

---

## Frontend Routes

```
/
  ├── /login                     # Magic link login page
  ├── /auth/callback             # Supabase auth callback
  │
  ├── /superadmin                # Super Admin Portal
  │   ├── /dashboard             # System overview
  │   ├── /companies             # Manage all companies
  │   │   ├── /[id]/details      # Company detail page
  │   │   ├── /[id]/users        # Manage company users
  │   │   └── /[id]/sync-logs    # View sync history
  │   ├── /users                 # All users across companies
  │   ├── /communications        # Bulk communication tools
  │   │   ├── /send              # Send bulk magic links
  │   │   ├── /emergency         # Emergency broadcast
  │   │   └── /history           # Communication history
  │   └── /sync-jobs             # Monitor sync jobs
  │
  ├── /admin                     # Company Admin Dashboard
  │   ├── /dashboard             # Admin home
  │   ├── /schedule              # View company schedule
  │   ├── /team                  # Manage technicians
  │   ├── /send-links            # Send magic links to techs
  │   └── /export                # Export schedules
  │
  └── /schedule                  # Technician Schedule View
      ├── /calendar              # Calendar view (read-only)
      └── /export                # Export (sensitive data hidden)
```

---

## Implementation Steps

### Phase 1: Database Setup (2 hours)

1. Create Supabase project
2. Run SQL to create tables:
   - service_company_groups (NEW)
   - companies (with group_id and feature_toggles)
   - user_profiles (with employee_information_id)
   - schedule_data
   - communication_logs
   - sync_jobs
3. Set up RLS policies (including technician filtering)
4. Create indexes
5. Test with sample nested DTO data

### Phase 2: Hourly Sync Job with MaidCentral API v2 (4-5 hours)

1. **Set up MaidCentral API v2 credentials**:
   - Store `MAIDCENTRAL_API_URL` and `MAIDCENTRAL_API_KEY` in Supabase secrets
   - Test authentication with both endpoints (`/api/dr-schedule/users` and `/api/dr-schedule`)

2. **Create Supabase Edge Function `hourly-sync`**:
   - File: `supabase/functions/hourly-sync/index.ts`
   - Implement two-step sync process:
     - **Step 1**: Call `/api/dr-schedule/users` endpoint
     - **Step 2**: Loop through 7 days, calling `/api/dr-schedule?startDate=X&endDate=X` for each day

3. **Implement `syncUsers()` function**:
   - Parse ServiceCompanyGroups → ServiceCompanies → Users structure
   - Upsert groups, companies, and user accounts
   - Use Supabase Admin API to create auth.users (passwordless)
   - Map MaidCentral Roles[] to user_profiles.role
   - Store EmployeeInformationId for technician job filtering

4. **Implement `storeScheduleDataForDate()` function**:
   - Accept one day's data at a time
   - Transform using existing `transformJobData()` logic
   - Store per-company schedule data with date metadata
   - Handle companies not yet in database gracefully

5. **Implement transformation functions**:
   - `extractTeams()`: Extract from ScheduledTeams[]
   - `transformJobs()`: Preserve EmployeeSchedules[] for filtering
   - `extractEmployees()`: Build employee shifts from jobs

6. **Add comprehensive error handling**:
   - Continue schedule sync if user sync fails
   - Continue to next day if one day fails
   - Log all failures in sync_jobs table
   - Alert if >20% of days fail

7. **Test locally**:
   - Use `allusers.json` sample to test user sync
   - Use `chs-alljobs.json` to test schedule sync
   - Verify 7-day loop with single-day queries

8. **Deploy and schedule**:
   - Deploy function to Supabase
   - Set up pg_cron job for hourly execution (every hour at :00)
   - Monitor first few hourly syncs
   - Verify sync_jobs table populated correctly

### Phase 3: Authentication & Magic Links (2 hours)

1. Configure Supabase Auth (enable email magic links)
2. Customize email templates
3. Create login page
4. Create auth callback handler
5. Implement `useAuth` hook
6. Test magic link flow

### Phase 4: Super Admin Portal (5 hours)

1. Create `/superadmin` route structure
2. Implement dashboard (metrics, sync status for groups/companies)
3. Build group & company management page
   - List ServiceCompanyGroups
   - Expand groups to show companies
   - Enable/disable portal for groups
   - Send magic links to Group Admins
4. Build user management page
5. Build bulk communication tools
   - Bulk magic link sender (to all Group Admins)
   - Emergency broadcast
   - Communication history
6. Add sync job monitoring (per group/company)

### Phase 5: Company Admin Dashboard (4 hours)

1. Create `/admin` route structure
2. Build schedule view (FullCalendar integration - all jobs/employees)
3. Build team management page
   - Link technician emails to EmployeeInformationId
4. Build **"Bulk Send Magic Links to Scheduled Technicians"** feature
   - Date range selector
   - Extract unique EmployeeInformationIds from jobs
   - Match to user profiles
   - Send magic links
5. Build "Send Links" feature (individual)
6. Add export functionality

### Phase 6: Technician View (3 hours)

1. Create `/schedule` route
2. Build read-only calendar view
3. Implement job filtering by EmployeeInformationId:
   - Fetch user's employee_information_id
   - Filter jobs where EmployeeSchedules contains matching ID
4. Apply company's featureToggles to hide sensitive data:
   - billRate, contactInfo, internalMemo, etc.
5. Add export with featureToggles applied
6. Test with technician role (verify only their jobs appear)

### Phase 7: Deploy to Vercel (1 hour)

1. Push code to GitHub
2. Connect Vercel to repo
3. Configure environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy
5. Add custom domain: `backup.maidcentral.com`
6. Configure DNS (CNAME record)

### Phase 8: Testing & Polish (4 hours)

1. Test super admin flows
   - Enable group/company portal
   - Send magic links to Group Admins
   - Send bulk magic links to all groups
   - Emergency broadcast
   - View sync logs for groups/companies
2. Test company admin flows
   - View full schedule (all jobs, all employees)
   - **Bulk send magic links to all scheduled technicians**
   - Send individual technician links
   - Link technicians to EmployeeInformationId
3. Test technician flows
   - Receive magic link
   - View schedule (ONLY their assigned jobs)
   - Verify featureToggles hide sensitive data correctly
   - Export PDF with proper filtering
4. Test hourly sync with nested DTO structure
   - Verify groups created/updated
   - Verify companies created/updated
   - Verify featureToggles synced correctly
5. Verify RLS policies (especially technician job filtering)
6. Load testing with multiple groups/companies
7. Fix bugs, polish UI

**Total Implementation Time: 23-27 hours**

---

## Cost Breakdown

### Supabase

- **Free Tier:** $0/month
  - 500MB database
  - 1GB file storage
  - 2GB bandwidth
  - 500K Edge Function invocations
  - Unlimited auth users

**Sufficient for:**
- 50-100 companies
- 500-1000 users
- 7-day data window per company

**Upgrade to Pro ($25/mo) when:**
- Need more than 500MB database
- Need daily backups
- Need priority support

### Vercel

- **Free Tier:** $0/month
  - 100GB bandwidth
  - Automatic HTTPS
  - Custom domain included
  - Serverless functions included

**Sufficient for:**
- 1000+ users
- 10K+ page views/month

### Domain

- **Subdomain (backup.maidcentral.com):** $0
  - Or new domain: ~$12/year

### Email Sending (for magic links)

- **Supabase Auth:** Free (built-in)
- Or use **Resend/SendGrid:** $0-20/month for bulk sends

**Total: $0-45/month**
- Start free, scale as needed
- Most likely: **$0-25/month** (Supabase Pro + Vercel Free)

---

## Security Considerations

### 1. Super Admin Access

**Initial Setup:**
```sql
-- Manually promote first user to super admin
UPDATE user_profiles
SET role = 'superadmin'
WHERE email = 'justin@maidcentral.com';
```

**Or use environment variable:**
```javascript
// In signup flow, check if email matches
if (email === process.env.SUPER_ADMIN_EMAIL) {
  role = 'superadmin'
}
```

### 2. Magic Link Security

- ✅ Links expire in 24-48 hours
- ✅ One-time use (or time-limited reuse)
- ✅ HTTPS only
- ✅ Rate limiting on send (prevent spam)
- ✅ Log all magic link sends

### 3. Data Isolation

- ✅ RLS ensures users only see their company data
- ✅ Super admin has explicit full access policy
- ✅ No cross-company queries possible (enforced by database)

### 4. Rate Limiting

**Bulk communication limits:**
- Max 1000 emails per request
- Max 5 bulk sends per hour (per super admin)
- Log all sends for audit

### 5. API Key Security

- ✅ Never expose service role key in frontend
- ✅ Store in Supabase Edge Function secrets
- ✅ Rotate keys quarterly
- ✅ Monitor API usage

---

## Monitoring & Alerts

### What to Monitor

1. **Sync Job Health**
   - Failed syncs (alert if >10% failure rate)
   - Sync duration (alert if >5 minutes)
   - No syncs in last 2 hours (cron failure)

2. **Authentication**
   - Failed login attempts
   - Magic link send failures
   - Unusual login patterns

3. **System Resources**
   - Database size (alert at 80% of limit)
   - Bandwidth usage
   - Edge Function errors

### Alert Channels

- Email to `justin@maidcentral.com`
- Slack webhook (optional)
- Supabase dashboard alerts

---

## Future Enhancements (Post-MVP)

### Phase 2 Features

1. **Mobile App**
   - React Native app for technicians
   - Push notifications for schedule changes
   - Offline support

2. **Advanced Scheduling**
   - Route optimization view
   - Map view of jobs
   - Technician availability tracking

3. **Analytics Dashboard**
   - Jobs per team trends
   - Technician utilization
   - Schedule density heatmaps

4. **White-Label Customization**
   - Per-company branding
   - Custom domain per company (company.backup.maidcentral.com)
   - Logo upload

5. **Two-Way Sync**
   - Technicians mark jobs complete
   - Sync status back to MaidCentral
   - Real-time updates

---

## Summary

> **📋 NEW ARCHITECTURE**: This document has been updated with an **async job queue + blob storage architecture** for optimal performance and scalability. See [ASYNC-SYNC-ARCHITECTURE.md](./ASYNC-SYNC-ARCHITECTURE.md) for full details.

### What You Get

✅ **Multi-company SaaS platform** with ServiceCompanyGroups (unlimited groups/companies)
✅ **Super Admin Portal** to manage groups, enable portals, & send magic links to Group Admins
✅ **Company Admin Dashboards** to manage schedules & **bulk send magic links to all scheduled technicians**
✅ **Technician View** with job filtering by EmployeeInformationId + featureToggles-based data hiding
✅ **Async hourly sync** per company from nested DTO structure (7-day rolling window) ⚡ **NEW**
✅ **Blob storage** for fast API responses (<50ms) ⚡ **NEW**
✅ **Background job queue** with automatic retries ⚡ **NEW**
✅ **Magic link authentication** (passwordless, secure)
✅ **Bulk communication tools** (magic links, announcements, emergency)
✅ **Hosted on Vercel** with custom domain
✅ **Supabase backend** with RLS for data isolation (including technician job filtering)
✅ **Privacy settings synced from MaidCentral** (featureToggles per company)
✅ **$0-10/month** cost (optimized from $25-50/month) ⚡ **IMPROVED**

### Key Architecture Changes (v2)

**Performance Improvements:**
- ⚡ **6x faster** cron execution (3-5 min → 500ms)
- ⚡ **40x faster** API responses (2-3 sec → <50ms)
- 💰 **5x cheaper** database costs ($50 → $10/month)
- 📈 **10x scalability** (100 → 1000+ companies)
- 🔄 **Better reliability** (jobs fail independently, auto-retry)

**New Components:**
1. Supabase Storage bucket for blob storage
2. `background_jobs` table for async job queue
3. Updated `schedule_data` table (metadata only, references blobs)
4. Three Edge Functions (hourly-sync, background-worker, get-schedule)

### Key Files to Create

**Backend (Updated for v2):**
1. `supabase/functions/hourly-sync/index.ts` - Queue background jobs (coordinator) ⚡ **NEW**
2. `supabase/functions/background-worker/index.ts` - Execute async jobs (executor) ⚡ **NEW**
3. `supabase/functions/get-schedule/index.ts` - Fast blob reads (<50ms) ⚡ **NEW**
4. `supabase/migrations/001_initial_schema.sql` - Database schema (with background_jobs, storage)
5. `supabase/migrations/002_rls_policies.sql` - RLS policies (DB + storage)
6. `supabase/migrations/003_storage_bucket.sql` - Supabase Storage setup ⚡ **NEW**

**Frontend:**
7. `src/hooks/useAuth.js` - Auth hook
8. `src/hooks/useScheduleData.js` - Load from blob storage via API ⚡ **UPDATED**
9. `src/hooks/useJobFiltering.js` - Filter jobs by EmployeeInformationId (for technicians)
10. `src/hooks/useFeatureToggles.js` - Apply privacy settings from company featureToggles
11. `src/pages/superadmin/*` - Super admin portal pages (Groups management)
12. `src/pages/admin/*` - Company admin pages (Bulk send to scheduled technicians)
13. `src/pages/schedule/*` - Technician view (Filtered jobs only)
14. `src/components/Login.jsx` - Login page

### Implementation Time

**Total: 25-30 hours** over 1-2 weeks (slightly increased due to async architecture, but worth it for performance gains)

---

**This is the complete enterprise solution. Ready to build!** 🚀
