# MaidCentral Backup Application - Simplified Backend Requirements

## Overview

**Goal:** Enable automated nightly data sync and magic link email access for team members.

**Current State:**
- Manual JSON file upload
- LocalStorage (single device)
- No user authentication

**Future State:**
- Automated nightly JSON file push to Supabase Storage
- Magic link authentication (no passwords)
- JSON auto-loads when user accesses app via magic link
- Host/Admin can manually trigger backup emails with magic links

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           MaidCentral API / Export Process              │
│                 (Nightly Job)                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 1. Export JSON (Format A)
                     │    Runs nightly (e.g., 2am)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Storage Bucket                    │
│          (stores latest JSON file)                      │
│                                                         │
│  • schedule-data.json (latest data)                    │
│  • Accessible via signed URLs                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 2. User clicks magic link in email
                     │    (sent manually by host/admin)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Auth (Magic Link)                 │
│                                                         │
│  • Passwordless authentication                         │
│  • User clicks link → auto-login                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 3. App loads, fetches JSON
                     ▼
┌─────────────────────────────────────────────────────────┐
│               React Frontend (Browser)                  │
│                                                         │
│  • Verify auth on load                                 │
│  • Fetch JSON from Supabase Storage                    │
│  • Transform and display in calendars                  │
│  • Admin panel to send magic link emails              │
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

### 2. Nightly Sync Job

#### 2.1 Simple Node.js Script

Create a simple script that runs nightly (via cron, GitHub Actions, or scheduler):

```javascript
// sync-job.js
const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')
const fs = require('fs')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function syncScheduleData() {
  console.log('[Sync] Starting nightly sync...', new Date().toISOString())

  try {
    // Step 1: Fetch JSON from MaidCentral API
    console.log('[Sync] Fetching from MaidCentral API...')
    const response = await fetch(process.env.MAIDCENTRAL_API_URL, {
      headers: {
        'Authorization': `Bearer ${process.env.MAIDCENTRAL_API_KEY}`
      }
    })

    if (!response.ok) {
      throw new Error(`API failed: ${response.status}`)
    }

    const jsonData = await response.json()
    console.log(`[Sync] Fetched ${jsonData.Result?.length || 0} jobs`)

    // Step 2: Upload to Supabase Storage
    const fileName = 'latest.json'
    const fileBuffer = Buffer.from(JSON.stringify(jsonData, null, 2))

    const { data, error } = await supabase.storage
      .from('schedule-data')
      .upload(fileName, fileBuffer, {
        contentType: 'application/json',
        upsert: true // Overwrite existing file
      })

    if (error) {
      throw error
    }

    console.log('[Sync] Upload successful:', data.path)

    // Optional: Archive daily snapshot
    const archiveName = `archive/${new Date().toISOString().split('T')[0]}.json`
    await supabase.storage
      .from('schedule-data')
      .upload(archiveName, fileBuffer, {
        contentType: 'application/json',
        upsert: false
      })

    console.log('[Sync] Nightly sync completed successfully')

  } catch (error) {
    console.error('[Sync] Failed:', error.message)

    // Optional: Send alert email
    // await sendAlertEmail(error.message)
  }
}

// Run sync
syncScheduleData()
```

#### 2.2 Environment Variables

```env
# .env (sync job)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

MAIDCENTRAL_API_URL=https://api.maidcentral.com/api/jobs/getall
MAIDCENTRAL_API_KEY=your-api-key
```

#### 2.3 Scheduling Options

**Option A: Cron Job (Linux/Mac)**
```bash
# Run at 2am daily
0 2 * * * cd /path/to/sync-job && node sync-job.js >> /var/log/sync.log 2>&1
```

**Option B: GitHub Actions (Free)**
```yaml
# .github/workflows/sync.yml
name: Nightly Sync
on:
  schedule:
    - cron: '0 2 * * *'  # 2am UTC daily
  workflow_dispatch:      # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: node sync-job.js
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          MAIDCENTRAL_API_URL: ${{ secrets.MAIDCENTRAL_API_URL }}
          MAIDCENTRAL_API_KEY: ${{ secrets.MAIDCENTRAL_API_KEY }}
```

**Option C: Heroku Scheduler (Simple)**
```bash
# Install Heroku Scheduler addon
heroku addons:create scheduler:standard

# Add job via dashboard:
# Command: node sync-job.js
# Frequency: Daily at 2am
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

### Step 2: Nightly Sync Job (1 hour)

1. Create `sync-job.js` script
2. Add environment variables
3. Test locally:
   ```bash
   node sync-job.js
   ```
4. Choose scheduling option (GitHub Actions recommended)
5. Deploy and test

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

### Step 5: Testing (1 hour)

1. Test nightly sync job
2. Test magic link login
3. Test data loading after login
4. Test admin panel
5. Test calendar views with loaded data

**Total Time: 5-6 hours**

---

## Cost

- **Supabase Free Tier:** $0/month (sufficient for this use case)
- **GitHub Actions:** Free (2000 minutes/month)
- **Total: $0/month**

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

1. Create Supabase project
2. Run through Step 1-5 above
3. Test with a few users
4. Deploy to production

**Much simpler!** 🎉
