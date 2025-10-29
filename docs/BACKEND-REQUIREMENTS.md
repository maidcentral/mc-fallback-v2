# MaidCentral Backup Application - Simplified Backend Requirements

## Overview

**Goal:** Deploy a hosted backup application with automated hourly data sync, 7-day rolling data window, and magic link authentication.

**Current State:**
- Manual JSON file upload
- LocalStorage (single device)
- No user authentication

**Future State:**
- **Hosted React app** on custom domain (e.g., backup.maidcentral.com)
- **Hourly sync job** pulls next 7 days of schedule data from MaidCentral API
- **Auto-cleanup** deletes data older than current date
- **Magic link authentication** (no passwords)
- **Supabase backend** for storage and auth
- Host/Admin can manually send magic link emails to team members

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              MaidCentral API                            │
│         (Source of Schedule Data)                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 1. Fetch next 7 days of data
                     │    Runs every hour (via cron)
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Supabase Edge Function / Cron Job             │
│          (Hourly Sync + Cleanup)                        │
│                                                         │
│  • Fetch from MaidCentral API                          │
│  • Filter: today + next 7 days                         │
│  • Upload to Supabase Storage                          │
│  • Delete old files (older than today)                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 2. Data stored
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Storage Bucket                    │
│       (Rolling 7-day data window)                       │
│                                                         │
│  • latest.json (current 7-day snapshot)                │
│  • Auto-expires old data                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 3. User accesses app
                     ▼
┌─────────────────────────────────────────────────────────┐
│         React App (Hosted on Vercel/Netlify)           │
│         Custom Domain: backup.maidcentral.com           │
│                                                         │
│  • Magic link authentication                           │
│  • Fetch latest.json from Supabase Storage            │
│  • Display calendars (7-day view)                      │
│  • Admin: Send magic links to team                     │
└─────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Supabase Setup (Simple)

#### 1.1 Storage Bucket

Create a storage bucket to store the nightly JSON file:

```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('schedule-data', 'schedule-data', false);

-- Set access policy (authenticated users can read)
CREATE POLICY "Authenticated users can read schedule data"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'schedule-data' AND
  auth.role() = 'authenticated'
);
```

**File Structure:**
```
schedule-data/
  └── latest.json          # Most recent schedule data
  └── archive/
      ├── 2025-10-22.json  # Optional: daily archives
      ├── 2025-10-21.json
      └── ...
```

#### 1.2 Authentication (Magic Links Only)

Enable magic link authentication in Supabase:

1. Go to **Authentication → Providers**
2. Enable **Email** provider
3. Disable **Password** authentication (magic links only)
4. Configure **Email Templates** for magic link emails

**User Table (Simple):**
```sql
-- Minimal user profile (optional, extends Supabase auth)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, is_admin)
  VALUES (NEW.id, NEW.email, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();
```

---

### 2. Hourly Sync Job with 7-Day Window

#### 2.1 Supabase Edge Function (Recommended)

Use Supabase Edge Functions with built-in cron scheduling:

```typescript
// supabase/functions/hourly-sync/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const maidcentralApiUrl = Deno.env.get('MAIDCENTRAL_API_URL')!
const maidcentralApiKey = Deno.env.get('MAIDCENTRAL_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    console.log('[Sync] Starting hourly sync...', new Date().toISOString())

    // Step 1: Calculate date range (today + next 7 days)
    const today = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 7)

    const startDateStr = today.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    console.log(`[Sync] Fetching data for ${startDateStr} to ${endDateStr}`)

    // Step 2: Fetch from MaidCentral API with date filter
    const apiUrl = `${maidcentralApiUrl}?startDate=${startDateStr}&endDate=${endDateStr}`
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${maidcentralApiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`API failed: ${response.status}`)
    }

    const jsonData = await response.json()

    // Filter jobs to only include 7-day window
    const filteredData = {
      ...jsonData,
      Result: jsonData.Result?.filter((job: any) => {
        const jobDate = new Date(job.JobDate)
        return jobDate >= today && jobDate <= endDate
      })
    }

    console.log(`[Sync] Filtered to ${filteredData.Result?.length || 0} jobs`)

    // Step 3: Upload to Supabase Storage
    const fileName = 'latest.json'
    const fileContent = JSON.stringify(filteredData, null, 2)

    const { error: uploadError } = await supabase.storage
      .from('schedule-data')
      .upload(fileName, fileContent, {
        contentType: 'application/json',
        upsert: true // Overwrite existing
      })

    if (uploadError) {
      throw uploadError
    }

    // Step 4: Cleanup old archived files (optional)
    // List all files in archive folder
    const { data: files } = await supabase.storage
      .from('schedule-data')
      .list('archive')

    if (files) {
      const oldFiles = files.filter(file => {
        // Delete files older than today
        const fileDate = file.name.replace('.json', '')
        return new Date(fileDate) < today
      })

      for (const file of oldFiles) {
        await supabase.storage
          .from('schedule-data')
          .remove([`archive/${file.name}`])
      }

      console.log(`[Sync] Cleaned up ${oldFiles.length} old files`)
    }

    console.log('[Sync] Hourly sync completed successfully')

    return new Response(
      JSON.stringify({
        success: true,
        jobs: filteredData.Result?.length,
        dateRange: { startDateStr, endDateStr }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Sync] Failed:', error.message)

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

#### 2.2 Environment Variables

```env
# .env (sync job)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

MAIDCENTRAL_API_URL=https://api.maidcentral.com/api/jobs/getall
MAIDCENTRAL_API_KEY=your-api-key
```

#### 2.3 Set Up Hourly Cron in Supabase

1. Deploy the Edge Function:
```bash
supabase functions deploy hourly-sync
```

2. Set environment variables in Supabase Dashboard:
   - Go to **Edge Functions → hourly-sync → Settings**
   - Add secrets: `MAIDCENTRAL_API_URL`, `MAIDCENTRAL_API_KEY`

3. Schedule with `pg_cron` (built into Supabase):

```sql
-- Run hourly sync every hour at :00
SELECT cron.schedule(
  'hourly-schedule-sync',
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

**Alternative: GitHub Actions (if you prefer)**
```yaml
# .github/workflows/hourly-sync.yml
name: Hourly Schedule Sync
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:      # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Supabase Edge Function
        run: |
          curl -X POST \
            https://your-project.supabase.co/functions/v1/hourly-sync \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

### 3. Frontend Changes

#### 3.1 Install Supabase Client

```bash
npm install @supabase/supabase-js
```

#### 3.2 Supabase Client Setup

```javascript
// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

```env
# .env (frontend)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

#### 3.3 Authentication Hook

```javascript
// src/hooks/useAuth.js
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
```

#### 3.4 Load JSON from Supabase Storage

```javascript
// src/utils/dataLoader.js
import { supabase } from './supabaseClient'
import { transformFormatA } from './dataTransform'

export async function loadScheduleData() {
  try {
    // Download JSON file from storage
    const { data, error } = await supabase.storage
      .from('schedule-data')
      .download('latest.json')

    if (error) {
      throw error
    }

    // Parse JSON
    const text = await data.text()
    const jsonData = JSON.parse(text)

    // Transform to internal format (reuse existing logic)
    const transformed = transformFormatA(jsonData)

    return transformed
  } catch (error) {
    console.error('Error loading schedule data:', error)
    return null
  }
}
```

#### 3.5 Updated Data Hook

```javascript
// src/hooks/usePersistedData.js
import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { loadScheduleData } from '../utils/dataLoader'

export function usePersistedData() {
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (user) {
      // User is authenticated, load data from Supabase
      loadData()
    } else {
      // Not authenticated, no data
      setData(null)
      setLoading(false)
    }
  }, [user, authLoading])

  async function loadData() {
    setLoading(true)
    const scheduleData = await loadScheduleData()
    setData(scheduleData)
    setLoading(false)
  }

  return {
    data,
    loading: authLoading || loading,
    refetch: loadData
  }
}
```

#### 3.6 Protected Routes

```javascript
// src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return children
}
```

```javascript
// src/App.jsx (updated routes)
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/jobs" element={<ProtectedRoute><JobCalendar /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute><EmployeeCalendar /></ProtectedRoute>} />
        <Route path="/export" element={<ProtectedRoute><ExportSchedule /></ProtectedRoute>} />

        {/* Admin only */}
        <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
      </Routes>
      <Footer />
    </Router>
  )
}
```

---

### 4. Login Flow (Magic Links)

#### 4.1 Login Page

```javascript
// src/components/Login.jsx
import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { Alert, Button, TextField, Paper, Typography } from '@mui/material'

export function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({
        type: 'success',
        text: 'Check your email for the magic link!'
      })
    }

    setLoading(false)
  }

  return (
    <Paper sx={{ maxWidth: 400, margin: '100px auto', padding: 4 }}>
      <Typography variant="h5" gutterBottom>
        Login to MaidCentral Backup
      </Typography>

      <form onSubmit={handleLogin}>
        <TextField
          fullWidth
          type="email"
          label="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          margin="normal"
        />

        <Button
          fullWidth
          type="submit"
          variant="contained"
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </Button>
      </form>

      {message && (
        <Alert severity={message.type} sx={{ mt: 2 }}>
          {message.text}
        </Alert>
      )}
    </Paper>
  )
}
```

#### 4.2 Magic Link Email Template

Configure in Supabase Dashboard → Authentication → Email Templates:

```html
<!-- Confirm signup / Magic Link template -->
<h2>MaidCentral Backup Access</h2>

<p>Click the link below to access the backup schedule application:</p>

<p><a href="{{ .ConfirmationURL }}">Access Backup Schedules</a></p>

<p>This link expires in 24 hours.</p>

<p>If you didn't request this, you can safely ignore this email.</p>
```

---

### 5. Admin Panel (Send Magic Links)

#### 5.1 Admin Component

```javascript
// src/components/AdminPanel.jsx
import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  Box
} from '@mui/material'

export function AdminPanel() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleSendMagicLink(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      // Send magic link via Supabase Auth
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
          // Optional: Add custom data
          data: {
            sent_by: user.email,
            sent_at: new Date().toISOString()
          }
        }
      })

      if (error) throw error

      setMessage({
        type: 'success',
        text: `Magic link sent to ${email}`
      })
      setEmail('')
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSendBulkLinks() {
    // TODO: Implement bulk email sending
    // Read from textarea with multiple emails
    // Send magic link to each
  }

  return (
    <Paper sx={{ maxWidth: 600, margin: '50px auto', padding: 4 }}>
      <Typography variant="h5" gutterBottom>
        Admin Panel
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Logged in as: <Chip label={user?.email} size="small" />
        </Typography>
      </Box>

      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Send Magic Link
      </Typography>

      <form onSubmit={handleSendMagicLink}>
        <TextField
          fullWidth
          type="email"
          label="Recipient Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          margin="normal"
          helperText="User will receive a magic link to access schedules"
        />

        <Button
          fullWidth
          type="submit"
          variant="contained"
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </Button>
      </form>

      {message && (
        <Alert severity={message.type} sx={{ mt: 2 }}>
          {message.text}
        </Alert>
      )}

      {/* Optional: View recent logins, manage users, etc. */}
    </Paper>
  )
}
```

---

## Implementation Steps

### Step 1: Supabase Setup (30 minutes)

1. Create Supabase project at [supabase.com](https://supabase.com)
2. Create storage bucket `schedule-data`
3. Set storage policy for authenticated users
4. Enable Email authentication (magic links)
5. Disable password authentication
6. Customize email template
7. Save credentials (URL, anon key, service role key)

### Step 2: Hourly Sync Job (1-2 hours)

1. Create Supabase Edge Function `hourly-sync`
2. Add environment variables in Supabase Dashboard
3. Test locally:
   ```bash
   supabase functions serve hourly-sync
   ```
4. Deploy function:
   ```bash
   supabase functions deploy hourly-sync
   ```
5. Set up pg_cron schedule (hourly)
6. Test by triggering manually

### Step 3: Frontend Updates (2-3 hours)

1. Install Supabase client
2. Create `supabaseClient.js`
3. Create `useAuth` hook
4. Create `dataLoader.js`
5. Update `usePersistedData` hook
6. Create `Login` component
7. Create `ProtectedRoute` component
8. Update `App.jsx` routes
9. Test login flow

### Step 4: Admin Panel (1 hour)

1. Create `AdminPanel` component
2. Add route in `App.jsx`
3. Test sending magic links

### Step 5: Deploy React App (1 hour)

**Option A: Vercel (Recommended)**

1. Push code to GitHub
2. Connect Vercel to your GitHub repo
3. Configure build settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy
6. Add custom domain:
   - Go to Project Settings → Domains
   - Add `backup.maidcentral.com`
   - Configure DNS records:
     ```
     Type: CNAME
     Name: backup
     Value: cname.vercel-dns.com
     ```

**Option B: Netlify**

1. Push code to GitHub
2. Connect Netlify to repo
3. Configure:
   - Build Command: `npm run build`
   - Publish Directory: `dist`
4. Add environment variables
5. Deploy
6. Add custom domain in Site Settings

**Option C: Cloudflare Pages**

1. Push code to GitHub
2. Connect Cloudflare Pages
3. Configure build
4. Add custom domain (already on Cloudflare DNS)

### Step 6: Testing (1 hour)

1. Test hourly sync job (check Supabase logs)
2. Verify 7-day data window
3. Test magic link login
4. Test data loading after login
5. Test admin panel (send magic links)
6. Test calendar views with loaded data
7. Verify old data gets deleted

**Total Time: 6-8 hours**

---

## Cost

- **Supabase Free Tier:** $0/month
  - Includes Edge Functions (500K invocations/month)
  - Storage: 1GB
  - Auth: Unlimited users
- **Vercel Free Tier:** $0/month
  - 100GB bandwidth/month
  - Automatic HTTPS
  - Custom domain included
- **Domain (if new):** ~$12/year
  - Or use subdomain of existing domain: $0

**Total: $0-1/month** (completely free if using existing domain)

---

## User Flow

### For Regular Users:

1. User receives email: "MaidCentral Backup - Access Your Schedules"
2. Clicks magic link in email
3. Auto-logged in to app
4. Sees latest schedule data (loaded automatically)
5. Can view calendars, export PDFs

### For Host/Admin:

1. Logs in via magic link
2. Goes to `/admin` page
3. Enters team member email
4. Clicks "Send Magic Link"
5. Team member receives email with access link

---

## Security

- ✅ No passwords to manage (magic links only)
- ✅ Links expire in 24 hours
- ✅ Storage files require authentication
- ✅ Simple, secure, easy to use

---

## FAQ

**Q: What if someone forwards the magic link?**
A: Links are one-time use and expire after 24 hours. Once used, they can't be used again.

**Q: How do I revoke access for a user?**
A: Go to Supabase Dashboard → Authentication → Users → Delete user.

**Q: Can I customize the email template?**
A: Yes, in Supabase Dashboard → Authentication → Email Templates.

**Q: What if the nightly sync fails?**
A: Check logs (GitHub Actions logs, Heroku logs, etc.). Users will still see the previous day's data until sync succeeds.

**Q: Can users see old data?**
A: Yes, if you enable archiving (`archive/YYYY-MM-DD.json`), you can add a date picker to let users view historical data.

---

## Next Steps

1. **Create Supabase project** → Set up storage bucket and auth
2. **Build Edge Function** → Hourly sync with 7-day window + cleanup
3. **Update React app** → Magic link auth + data loading
4. **Deploy to Vercel** → Connect custom domain
5. **Test end-to-end** → Verify hourly sync, auth, and 7-day window

---

## Summary

### What You Get:

✅ **Hosted React app** at `backup.maidcentral.com`
✅ **Hourly automated sync** (every hour at :00)
✅ **7-day rolling data window** (today + next 7 days)
✅ **Auto-cleanup** of old data
✅ **Magic link authentication** (no passwords)
✅ **Admin panel** to send access links to team
✅ **$0/month** (using free tiers)

### Key Files to Create:

1. `supabase/functions/hourly-sync/index.ts` - Edge function for sync
2. `src/hooks/useAuth.js` - Magic link authentication
3. `src/utils/dataLoader.js` - Load JSON from Supabase Storage
4. `src/components/Login.jsx` - Login page
5. `src/components/AdminPanel.jsx` - Send magic links

### Implementation Time: 6-8 hours

**Much simpler!** 🎉
