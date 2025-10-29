# MaidCentral Backup Application - Complete Enterprise Solution

## Overview

**Goal:** Deploy a complete multi-company backup portal with super admin management, automated hourly sync, role-based access, and bulk communication capabilities.

**Current State:**
- Manual JSON file upload
- LocalStorage (single device)
- No user authentication
- Single company prototype

**Future State:**
- **Multi-company SaaS platform** supporting all MaidCentral customers
- **Super Admin Portal** for MaidCentral host to enable companies and send bulk communications
- **Company Admin Dashboards** to manage team schedules and send magic links to technicians
- **Technician Access** with role-based data visibility (hide sensitive information)
- **Hourly automated sync** per company (7-day rolling window)
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
│  • Enable portal for ServiceCompanies                      │
│  • Send bulk magic links to all companies                  │
│  • Monitor system health & sync jobs                       │
│  • Manage users across all companies                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Backend                               │
│                                                             │
│  PostgreSQL Database:                                       │
│    • companies (ServiceCompanyId mappings)                 │
│    • users (role: superadmin/admin/technician)             │
│    • schedule_data (per company JSONB)                     │
│    • magic_links (tokens with expiry)                      │
│                                                             │
│  Auth: Magic link authentication                           │
│  Storage: JSON backups (optional)                          │
│  Edge Functions: Hourly sync per company                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              React App (Vercel Hosting)                     │
│         backup.maidcentral.com                              │
│                                                             │
│  Routes:                                                    │
│  • /superadmin/* - Super Admin Portal                      │
│  • /admin/* - Company Admin Dashboard                      │
│  • /schedule - Technician Schedule View                    │
│  • /login - Magic link login                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           MaidCentral API (per company)                     │
│                                                             │
│  Hourly sync fetches next 7 days per ServiceCompanyId     │
└─────────────────────────────────────────────────────────────┘
```

---

## User Roles & Permissions

### 1. Super Admin (MaidCentral Host - You)

**Permissions:**
- ✅ View all companies and users
- ✅ Enable/disable portal for any company
- ✅ Send bulk communications to all companies
- ✅ Monitor system health and sync jobs
- ✅ Manage users across all companies
- ✅ Access all features

**Use Cases:**
- Onboard new customer companies
- Send emergency broadcast when MaidCentral is down
- Announce system updates/new features
- Troubleshoot issues for any company

### 2. Company Admin (Office Manager/Admin)

**Permissions:**
- ✅ View their company's schedule data
- ✅ Send magic links to technicians in their company
- ✅ Export PDFs with full data
- ✅ Manage which technicians have access
- ❌ Cannot see other companies' data

**Use Cases:**
- Daily schedule management
- Send schedule links to field technicians
- Export and email/text schedules

### 3. Technician (Field Staff)

**Permissions:**
- ✅ View their company's schedule (read-only)
- ✅ Export PDFs with **sensitive data hidden**
- ❌ Cannot send magic links
- ❌ Cannot see other companies' data

**Use Cases:**
- Check daily schedule
- View job details (customer, address, instructions)
- Cannot see billing rates or internal memos

---

## Database Schema

### Tables

#### 1. companies

Stores each ServiceCompany from MaidCentral.

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_company_id TEXT UNIQUE NOT NULL, -- From MaidCentral API
  name TEXT NOT NULL,

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
CREATE INDEX idx_companies_portal_enabled ON companies(portal_enabled);
```

#### 2. user_profiles

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

#### 3. schedule_data

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

#### 4. communication_logs

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

#### 5. sync_jobs

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
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
```

### Super Admin - Full Access

```sql
-- Super admins see everything
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

### 2. Company Management

**URL:** `/superadmin/companies`

**Features:**
- List all ServiceCompanies
- Search/filter (enabled/disabled, search by name)
- Enable portal for new company
- Disable portal (with confirmation)
- View company details (users, sync status)
- Import companies from MaidCentral API

**Actions per Company:**
- ✅ Enable Portal → Prompts for admin emails, sends welcome
- ⏸ Disable Portal → Stops sync, marks disabled
- 📧 Send Setup Email → Resend welcome with magic links
- 👥 Manage Users → View/add/remove users for this company
- 📊 View Sync Logs → Show recent sync job history
- 🗑️ Delete Company → Remove all data (requires confirmation)

**Enable Portal Flow:**
```
1. Click "Enable Portal" for Company X
2. Modal appears:
   ┌────────────────────────────────────────────┐
   │ Enable Portal for Charleston Home Services │
   ├────────────────────────────────────────────┤
   │ Primary Admin Email:                       │
   │ [admin@charlestonhomesvc.com]              │
   │                                            │
   │ Additional Admins (optional):              │
   │ [office@chs.com]                           │
   │ [+ Add another]                            │
   │                                            │
   │ ☑ Send welcome email with magic link      │
   │ ☑ Enable hourly sync                       │
   │                                            │
   │ [Cancel]  [Enable Portal]                  │
   └────────────────────────────────────────────┘
3. System creates company, users, sends emails
4. Starts hourly sync for this company
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
- View company's 7-day schedule
- Calendar view (FullCalendar)
- Filter by team
- Export PDF with all data visible

#### 2. Team Management
- List technicians in company
- Send magic link to technician
- View who has accessed recently
- Disable technician access

#### 3. Send Schedule Links

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
- **Hidden fields:** billRate, internalMemo, contactInfo
- Export PDF (with sensitive data excluded)
- Cannot send magic links
- Cannot see other users

---

## Hourly Sync Process

### Supabase Edge Function

**File:** `supabase/functions/hourly-sync/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const maidcentralApiUrl = Deno.env.get('MAIDCENTRAL_API_URL')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    console.log('[Sync] Starting hourly sync for all companies...')

    // Get all companies with sync enabled
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .eq('portal_enabled', true)
      .eq('sync_enabled', true)

    if (error) throw error

    console.log(`[Sync] Found ${companies.length} companies to sync`)

    const results = []

    // Sync each company
    for (const company of companies) {
      const result = await syncCompany(company)
      results.push(result)
    }

    const successful = results.filter(r => r.status === 'success').length
    const failed = results.filter(r => r.status === 'failed').length

    return new Response(
      JSON.stringify({
        success: true,
        totalCompanies: companies.length,
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

async function syncCompany(company: any) {
  const startTime = Date.now()
  const syncJobId = crypto.randomUUID()

  try {
    console.log(`[Sync] Syncing company: ${company.name}`)

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

    // Fetch from MaidCentral API for this company
    const apiUrl = `${maidcentralApiUrl}?serviceCompanyId=${company.service_company_id}&startDate=${startDateStr}&endDate=${endDateStr}`

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('MAIDCENTRAL_API_KEY')}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`MaidCentral API failed: ${response.status}`)
    }

    const jsonData = await response.json()

    // Filter to 7-day window (in case API returns more)
    const filteredData = {
      ...jsonData,
      Result: jsonData.Result?.filter((job: any) => {
        const jobDate = new Date(job.JobDate)
        return jobDate >= today && jobDate <= endDate
      })
    }

    console.log(`[Sync] Fetched ${filteredData.Result?.length || 0} jobs`)

    // Transform data (reuse existing transformation logic)
    const transformed = transformFormatA(filteredData)

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
        jobs_fetched: filteredData.Result?.length || 0,
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
    console.error(`[Sync] Company ${company.name} failed:`, error)

    // Update sync job as failed
    await supabase
      .from('sync_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      })
      .eq('id', syncJobId)

    // Update company sync status
    await supabase
      .from('companies')
      .update({ sync_status: 'failed' })
      .eq('id', company.id)

    return {
      companyId: company.id,
      companyName: company.name,
      status: 'failed',
      error: error.message
    }
  }
}

// Reuse existing transformation logic
function transformFormatA(data: any) {
  // ... existing transformation from dataTransform.js
  return {
    metadata: { /* ... */ },
    teams: [ /* ... */ ],
    jobs: [ /* ... */ ],
    employees: [ /* ... */ ]
  }
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
   - companies
   - user_profiles
   - schedule_data
   - communication_logs
   - sync_jobs
3. Set up RLS policies
4. Create indexes
5. Test with sample data

### Phase 2: Hourly Sync Job (3 hours)

1. Create Supabase Edge Function `hourly-sync`
2. Implement per-company sync logic
3. Add error handling and logging
4. Test locally with sample MaidCentral data
5. Deploy function
6. Set up pg_cron schedule
7. Monitor first few syncs

### Phase 3: Authentication & Magic Links (2 hours)

1. Configure Supabase Auth (enable email magic links)
2. Customize email templates
3. Create login page
4. Create auth callback handler
5. Implement `useAuth` hook
6. Test magic link flow

### Phase 4: Super Admin Portal (4 hours)

1. Create `/superadmin` route structure
2. Implement dashboard (metrics, sync status)
3. Build company management page
   - List companies
   - Enable/disable portal
   - Send welcome emails
4. Build user management page
5. Build bulk communication tools
   - Bulk magic link sender
   - Emergency broadcast
   - Communication history
6. Add sync job monitoring

### Phase 5: Company Admin Dashboard (3 hours)

1. Create `/admin` route structure
2. Build schedule view (FullCalendar integration)
3. Build team management page
4. Build "Send Links" feature
5. Add export functionality

### Phase 6: Technician View (2 hours)

1. Create `/schedule` route
2. Build read-only calendar view
3. Hide sensitive data (billRate, internalMemo, contactInfo)
4. Add export with hidden data
5. Test with technician role

### Phase 7: Deploy to Vercel (1 hour)

1. Push code to GitHub
2. Connect Vercel to repo
3. Configure environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy
5. Add custom domain: `backup.maidcentral.com`
6. Configure DNS (CNAME record)

### Phase 8: Testing & Polish (3 hours)

1. Test super admin flows
   - Enable company
   - Send bulk magic links
   - Emergency broadcast
2. Test company admin flows
   - View schedule
   - Send technician links
3. Test technician flows
   - Receive magic link
   - View schedule (data hidden)
4. Test hourly sync
5. Verify RLS policies
6. Load testing with multiple companies
7. Fix bugs, polish UI

**Total Implementation Time: 18-22 hours**

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

✅ **Multi-company SaaS platform** (unlimited ServiceCompanies)
✅ **Super Admin Portal** to enable companies & send bulk communications
✅ **Company Admin Dashboards** to manage schedules & send tech links
✅ **Technician View** with role-based data hiding
✅ **Hourly sync** per company (7-day rolling window)
✅ **Magic link authentication** (passwordless, secure)
✅ **Bulk communication tools** (magic links, announcements, emergency)
✅ **Hosted on Vercel** with custom domain
✅ **Supabase backend** with RLS for data isolation
✅ **$0-25/month** cost (free tier sufficient for 50+ companies)

### Key Files to Create

**Backend:**
1. `supabase/functions/hourly-sync/index.ts` - Sync all companies
2. `supabase/migrations/001_initial_schema.sql` - Database schema
3. `supabase/migrations/002_rls_policies.sql` - RLS policies

**Frontend:**
4. `src/hooks/useAuth.js` - Auth hook
5. `src/hooks/usePersistedData.js` - Load schedule data
6. `src/pages/superadmin/*` - Super admin portal pages
7. `src/pages/admin/*` - Company admin pages
8. `src/pages/schedule/*` - Technician view
9. `src/components/Login.jsx` - Login page

### Implementation Time

**Total: 18-22 hours** over 1-2 weeks

---

**This is the complete enterprise solution. Ready to build!** 🚀
