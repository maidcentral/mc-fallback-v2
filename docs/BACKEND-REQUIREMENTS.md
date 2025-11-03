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

## Architecture

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
│  PostgreSQL Database:                                       │
│    • service_company_groups (tblServiceCompanyGroups)      │
│    • companies (ServiceCompanyId + featureToggles)         │
│    • user_profiles (role + employee_information_id)        │
│    • schedule_data (per company JSONB)                     │
│    • communication_logs (magic link tracking)              │
│    • sync_jobs (hourly sync history)                       │
│                                                             │
│  Auth: Magic link authentication                           │
│  Storage: JSON backups (optional)                          │
│  Edge Functions: Hourly sync (nested DTO structure)        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              React App (Vercel Hosting)                     │
│         backup.maidcentral.com                              │
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
│           MaidCentral API (Nested DTO Structure)            │
│                                                             │
│  List<ParentDto>                                           │
│    └─ List<ServiceCompanyGroupDto>                         │
│         └─ List<ServiceCompanyDto>                         │
│              ├─ featureToggles (privacy settings)          │
│              └─ List<JobDto>                               │
│                   └─ EmployeeSchedules[]                   │
│                        └─ EmployeeInformationId            │
│                                                             │
│  Hourly sync fetches next 7 days per ServiceCompany       │
└─────────────────────────────────────────────────────────────┘
```

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

#### 4. schedule_data

Stores transformed schedule data per company (JSONB for flexibility).

```sql
CREATE TABLE schedule_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Transformed data from MaidCentral
  data JSONB NOT NULL, -- { metadata, teams, jobs, employees }

  -- Date range covered
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id) -- One active schedule per company
);

CREATE INDEX idx_schedule_data_company ON schedule_data(company_id);
CREATE INDEX idx_schedule_data_dates ON schedule_data(company_id, start_date, end_date);
CREATE INDEX idx_schedule_data_jsonb ON schedule_data USING GIN (data);
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

#### 6. sync_jobs

Track hourly sync job history per company.

```sql
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Sync details
  status TEXT NOT NULL, -- 'success', 'failed', 'partial'
  jobs_fetched INTEGER DEFAULT 0,
  jobs_stored INTEGER DEFAULT 0,

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

## Hourly Sync Process

### Supabase Edge Function

**File:** `supabase/functions/hourly-sync/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const maidcentralApiUrl = Deno.env.get('MAIDCENTRAL_API_URL')! // Returns nested DTO structure

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    console.log('[Sync] Starting hourly sync for all groups and companies...')

    // Fetch nested DTO structure from MaidCentral API
    // Expected structure: List<ParentDto> → List<ServiceCompanyGroupDto> → List<ServiceCompanyDto> → List<JobDto>
    const response = await fetch(maidcentralApiUrl, {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('MAIDCENTRAL_API_KEY')}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`MaidCentral API failed: ${response.status}`)
    }

    const nestedData = await response.json() // List<ParentDto>

    console.log(`[Sync] Fetched nested DTO structure from MaidCentral`)

    const results = []

    // Process each ServiceCompanyGroup
    for (const parentDto of nestedData) {
      for (const groupDto of parentDto.serviceCompanyGroups || []) {
        // Upsert group
        await upsertGroup(groupDto)

        // Process each ServiceCompany within the group
        for (const companyDto of groupDto.serviceCompanies || []) {
          const result = await syncCompany(groupDto, companyDto)
          results.push(result)
        }
      }
    }

    const successful = results.filter(r => r.status === 'success').length
    const failed = results.filter(r => r.status === 'failed').length

    return new Response(
      JSON.stringify({
        success: true,
        totalCompanies: results.length,
        successful,
        failed,
        results
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Sync] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function upsertGroup(groupDto: any) {
  // Upsert ServiceCompanyGroup
  const { error } = await supabase
    .from('service_company_groups')
    .upsert({
      group_id: groupDto.groupId,
      group_name: groupDto.groupName,
      portal_enabled: groupDto.portalEnabled || false,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'group_id'
    })

  if (error) {
    console.error(`[Sync] Failed to upsert group ${groupDto.groupName}:`, error)
  } else {
    console.log(`[Sync] Upserted group: ${groupDto.groupName}`)
  }
}

async function syncCompany(groupDto: any, companyDto: any) {
  const startTime = Date.now()
  const syncJobId = crypto.randomUUID()

  try {
    console.log(`[Sync] Syncing company: ${companyDto.name}`)

    // Get group from database
    const { data: group } = await supabase
      .from('service_company_groups')
      .select('id')
      .eq('group_id', groupDto.groupId)
      .single()

    if (!group) {
      throw new Error(`Group ${groupDto.groupId} not found`)
    }

    // Upsert company with featureToggles
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .upsert({
        service_company_id: companyDto.serviceCompanyId,
        name: companyDto.name,
        group_id: group.id,
        feature_toggles: companyDto.featureToggles || {}, // Privacy settings from MaidCentral
        portal_enabled: companyDto.portalEnabled || false,
        sync_enabled: companyDto.syncEnabled || true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'service_company_id',
        returning: 'representation'
      })
      .select()
      .single()

    if (companyError) throw companyError

    // Log sync job start
    await supabase.from('sync_jobs').insert({
      id: syncJobId,
      company_id: company.id,
      status: 'pending',
      started_at: new Date().toISOString()
    })

    // Calculate 7-day window
    const today = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 7)

    const startDateStr = today.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Filter jobs to 7-day window
    const filteredJobs = (companyDto.jobs || []).filter((job: any) => {
      const jobDate = new Date(job.jobDate)
      return jobDate >= today && jobDate <= endDate
    })

    console.log(`[Sync] Filtered ${filteredJobs.length} jobs for 7-day window`)

    // Transform data (reuse existing transformation logic)
    const transformed = transformJobData(filteredJobs)

    // Upsert schedule data
    const { error: upsertError } = await supabase
      .from('schedule_data')
      .upsert({
        company_id: company.id,
        data: transformed,
        start_date: startDateStr,
        end_date: endDateStr,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id'
      })

    if (upsertError) throw upsertError

    // Update company last_sync_at
    await supabase
      .from('companies')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: 'success'
      })
      .eq('id', company.id)

    // Update sync job as success
    const duration = Date.now() - startTime
    await supabase
      .from('sync_jobs')
      .update({
        status: 'success',
        jobs_fetched: filteredJobs.length,
        jobs_stored: transformed.jobs?.length || 0,
        completed_at: new Date().toISOString(),
        duration_ms: duration
      })
      .eq('id', syncJobId)

    console.log(`[Sync] Company ${company.name} synced successfully (${duration}ms)`)

    return {
      companyId: company.id,
      companyName: company.name,
      status: 'success',
      jobsSynced: transformed.jobs?.length || 0,
      duration
    }

  } catch (error) {
    console.error(`[Sync] Company ${companyDto.name} failed:`, error)

    // Update sync job as failed (if company exists)
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('service_company_id', companyDto.serviceCompanyId)
      .single()

    if (existingCompany) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime
        })
        .eq('id', syncJobId)

      await supabase
        .from('companies')
        .update({ sync_status: 'failed' })
        .eq('id', existingCompany.id)
    }

    return {
      companyId: companyDto.serviceCompanyId,
      companyName: companyDto.name,
      status: 'failed',
      error: error.message
    }
  }
}

// Transform job data from nested DTO structure
function transformJobData(jobs: any[]) {
  // Reuse existing transformation logic from dataTransform.js
  // Input: Array of JobDto objects (from ServiceCompanyDto.jobs[])
  // Output: Internal format with metadata, teams, jobs, employees

  // Note: EmployeeSchedules[] contains EmployeeInformationId for filtering

  return {
    metadata: {
      lastUpdated: new Date().toISOString(),
      dataFormat: 'nested-dto',
      jobCount: jobs.length
    },
    teams: extractTeams(jobs),
    jobs: transformJobs(jobs),
    employees: extractEmployees(jobs)
  }
}

function extractTeams(jobs: any[]) {
  // Extract unique teams from jobs
  // Same logic as existing dataTransform.js
  return []
}

function transformJobs(jobs: any[]) {
  // Transform jobs with EmployeeSchedules
  // Keep EmployeeInformationId for filtering
  return jobs.map(job => ({
    ...job,
    employeeSchedules: job.EmployeeSchedules || []
  }))
}

function extractEmployees(jobs: any[]) {
  // Extract unique employees from EmployeeSchedules
  // Include EmployeeInformationId for linking to user profiles
  return []
}
```

### Schedule with pg_cron

```sql
-- Run hourly sync every hour at :00
SELECT cron.schedule(
  'hourly-schedule-sync-all-companies',
  '0 * * * *', -- Every hour
  $$
  SELECT
    net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/hourly-sync',
      headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

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

### Phase 2: Hourly Sync Job (4 hours)

1. Create Supabase Edge Function `hourly-sync`
2. Implement nested DTO parsing logic:
   - Parse ServiceCompanyGroups
   - Parse ServiceCompanies within groups
   - Extract featureToggles from companies
   - Filter jobs to 7-day window
3. Implement upsertGroup and syncCompany functions
4. Add error handling and logging
5. Test locally with sample nested DTO data from MaidCentral
6. Deploy function
7. Set up pg_cron schedule
8. Monitor first few syncs

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

### What You Get

✅ **Multi-company SaaS platform** with ServiceCompanyGroups (unlimited groups/companies)
✅ **Super Admin Portal** to manage groups, enable portals, & send magic links to Group Admins
✅ **Company Admin Dashboards** to manage schedules & **bulk send magic links to all scheduled technicians**
✅ **Technician View** with job filtering by EmployeeInformationId + featureToggles-based data hiding
✅ **Hourly sync** per company from nested DTO structure (7-day rolling window)
✅ **Magic link authentication** (passwordless, secure)
✅ **Bulk communication tools** (magic links, announcements, emergency)
✅ **Hosted on Vercel** with custom domain
✅ **Supabase backend** with RLS for data isolation (including technician job filtering)
✅ **Privacy settings synced from MaidCentral** (featureToggles per company)
✅ **$0-25/month** cost (free tier sufficient for 50+ companies)

### Key Files to Create

**Backend:**
1. `supabase/functions/hourly-sync/index.ts` - Sync all groups/companies from nested DTO
2. `supabase/migrations/001_initial_schema.sql` - Database schema (with service_company_groups)
3. `supabase/migrations/002_rls_policies.sql` - RLS policies (with technician filtering)

**Frontend:**
4. `src/hooks/useAuth.js` - Auth hook
5. `src/hooks/usePersistedData.js` - Load schedule data
6. `src/hooks/useJobFiltering.js` - Filter jobs by EmployeeInformationId (for technicians)
7. `src/hooks/useFeatureToggles.js` - Apply privacy settings from company featureToggles
8. `src/pages/superadmin/*` - Super admin portal pages (Groups management)
9. `src/pages/admin/*` - Company admin pages (Bulk send to scheduled technicians)
10. `src/pages/schedule/*` - Technician view (Filtered jobs only)
11. `src/components/Login.jsx` - Login page

### Implementation Time

**Total: 23-27 hours** over 1-2 weeks

---

**This is the complete enterprise solution. Ready to build!** 🚀
