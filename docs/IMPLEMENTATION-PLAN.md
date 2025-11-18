# MaidCentral Backup Application - Implementation Plan

**Version:** 1.0 (Simplified DR Strategy)
**Last Updated:** 2025-01-18
**Status:** Ready to Implement

---

## Executive Summary

**Goal:** Deploy a simple, read-only disaster recovery system that allows 5,000 users across 500 companies to access their schedules when the main MaidCentral system is down.

**Key Characteristics:**
- ✅ **Read-only** - No data entry, view schedules only
- ✅ **24-48 hour coverage** - Short-term DR, not long-term backup
- ✅ **Simple architecture** - Minimal complexity, maximum reliability
- ✅ **5,000 users** - Realistic scale for initial deployment
- ✅ **Dual authentication** - Email + SMS magic links (SMS optional)
- ✅ **Multi-provider hosting** - Vercel (primary) + Netlify (failover)

**Total Cost:** $76-86/month + $40 per emergency SMS broadcast

**Implementation Time:** 4 weeks

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  backup.maidcentral.com                         │
│  Cloudflare DNS + Load Balancing (FREE)         │
│  - Health checks every 60 seconds               │
│  - Auto-failover to Netlify if Vercel fails     │
└────────────────┬────────────────────────────────┘
                 │
         ┌───────┴────────┐
         ▼                ▼
┌──────────────┐    ┌──────────────┐
│ Vercel       │    │ Netlify      │
│ (Primary)    │    │ (Failover)   │
│ $0-20/mo     │    │ FREE         │
└──────┬───────┘    └──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│  Supabase Pro ($25/mo)                          │
│  ├─ PostgreSQL (schedule data + user profiles)  │
│  ├─ Auth (magic links via email)                │
│  └─ Edge Functions (hourly sync, send links)    │
└────────────────┬────────────────────────────────┘
                 │
         ┌───────┴──────────┐
         ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│ Twilio SMS       │  │ MaidCentral API  │
│ (~$31/mo)        │  │ (hourly sync)    │
│ Magic links via  │  │                  │
│ SMS (optional)   │  │ When API down →  │
└──────────────────┘  │ use last sync    │
                      └──────────────────┘

Monitoring: UptimeRobot (FREE)
- Checks every 5 minutes
- Email + SMS alerts

Testing: Automated Monthly Drill (FREE)
- pg_cron scheduled function
- Tests all critical paths
```

---

## Core Components

### 1. Database (Supabase PostgreSQL)

**Tables:**
- `service_company_groups` - ServiceCompanyGroups from MaidCentral
- `companies` - ServiceCompanies with feature_toggles
- `user_profiles` - Users with email + phone (optional)
- `schedule_data` - JSONB schedule data per company (7 days)
- `communication_logs` - Track magic link sends
- `sync_jobs` - Hourly sync history

**Key Features:**
- Row-Level Security (RLS) for data isolation
- JSONB for flexible schedule storage
- Indexes on critical fields
- 7-day rolling window (sufficient for DR)

### 2. Authentication (Magic Links)

**Email Magic Links:**
- Primary authentication method
- All users have email (required)
- Sent via Supabase Auth (built-in SMTP)
- Expires in 1 hour (7 days in Emergency Mode)

**SMS Magic Links:**
- Optional/secondary authentication
- Only for users with phone numbers synced from MaidCentral
- Sent via Twilio
- Faster delivery than email
- Cost: $0.0079/SMS

**Emergency Mode:**
- Super Admin can enable globally
- Extends magic link expiry to 7 days
- Extends session duration to 48 hours
- Bulk send to all companies with one click

### 3. Frontend (React)

**Pages:**
- `/login` - Email input, choose email/SMS/both
- `/auth/callback` - Handle magic link, redirect by role
- `/superadmin/*` - Super Admin Portal (manage groups, bulk send)
- `/admin/*` - Company Admin Dashboard (bulk send to scheduled techs)
- `/schedule` - Technician View (read-only, filtered by EmployeeInformationId)

**Framework:**
- React 18
- Material-UI (MUI) for components
- React Router for routing
- Supabase JS client for API calls

### 4. Deployment

**Primary: Vercel**
- Automatic deployments from GitHub main branch
- Edge network (global CDN)
- Serverless functions
- Free tier: 100GB bandwidth (likely sufficient with caching)
- Pro tier: $20/mo (1TB bandwidth - recommended)

**Failover: Netlify**
- Same codebase, deployed via GitHub Actions
- Accessible at backup2.maidcentral.com
- Free tier: 100GB bandwidth
- Only used if Vercel fails health check

**DNS: Cloudflare**
- Load balancing with health checks
- Primary: Vercel origin
- Secondary: Netlify origin
- Auto-failover in ~60 seconds
- Free tier includes 2 origins

### 5. Monitoring & Testing

**UptimeRobot (FREE):**
- Monitor 1: backup.maidcentral.com (every 5 min)
- Monitor 2: /api/health endpoint (every 5 min)
- Monitor 3: backup2.maidcentral.com (every 5 min)
- Alerts: Email + SMS

**Automated Monthly Drills:**
- Supabase Edge Function triggered by pg_cron
- Tests: DB connectivity, auth, sync freshness, basic load
- Email report to admin
- Runs first Monday of every month at 9 AM

---

## Database Schema

### user_profiles (Updated with Phone)

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT, -- E.164 format: +12345678900 (optional, synced from MaidCentral)
  full_name TEXT,

  -- Company association
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Role: 'superadmin', 'admin', 'technician'
  role TEXT NOT NULL DEFAULT 'technician',

  -- Employee linkage (for technicians)
  employee_information_id TEXT, -- Links to EmployeeInformationId from MaidCentral

  -- Communication preferences
  prefer_sms BOOLEAN DEFAULT FALSE, -- If true and phone exists, prefer SMS over email

  -- Activity tracking
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_company ON user_profiles(company_id);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_phone ON user_profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_user_profiles_employee ON user_profiles(employee_information_id);
```

### communication_logs (Updated for SMS)

```sql
CREATE TABLE communication_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who sent it
  sent_by UUID REFERENCES user_profiles(id),

  -- What was sent
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  communication_type TEXT, -- 'magic_link_email', 'magic_link_sms', 'announcement', 'emergency'

  -- Method
  method TEXT, -- 'email', 'sms', 'both'

  -- Recipients
  recipient_type TEXT, -- 'all_admins', 'all_users', 'selected_companies', 'scheduled_technicians'
  company_ids UUID[], -- If selected_companies
  recipient_count INTEGER,

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'partial'
  sent_at TIMESTAMPTZ,

  -- SMS specific
  sms_count INTEGER DEFAULT 0,
  sms_cost DECIMAL(10,4), -- Cost in USD

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_communication_logs_sent_by ON communication_logs(sent_by);
CREATE INDEX idx_communication_logs_created_at ON communication_logs(created_at DESC);
CREATE INDEX idx_communication_logs_type ON communication_logs(communication_type);
```

**All other tables remain the same as in BACKEND-REQUIREMENTS.md:**
- service_company_groups
- companies
- schedule_data
- sync_jobs

---

## Authentication Implementation

### 1. Login Page (Email + SMS Option)

```jsx
// src/pages/Login.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Alert, TextField, Button, Box, Typography,
  ToggleButtonGroup, ToggleButton, Paper
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';

export default function Login() {
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState('email'); // 'email', 'sms', 'both'
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [hasPhone, setHasPhone] = useState(false);

  // Check if user has phone number when email is entered
  async function checkUserPhone(email) {
    if (!email || !email.includes('@')) return;

    try {
      const { data, error } = await supabase.functions.invoke('check-user-phone', {
        body: { email }
      });

      if (!error && data?.hasPhone) {
        setHasPhone(true);
      } else {
        setHasPhone(false);
        setMethod('email'); // Reset to email only
      }
    } catch (e) {
      console.error('Error checking phone:', e);
      setHasPhone(false);
    }
  }

  async function handleSendMagicLink() {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-magic-link', {
        body: { email, method }
      });

      if (error) throw error;

      setSent(true);
    } catch (e) {
      setError(e.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100'
      }}
    >
      <Paper sx={{ maxWidth: 450, p: 4, width: '100%', mx: 2 }}>
        <Typography variant="h4" gutterBottom align="center">
          MaidCentral Backup Portal
        </Typography>

        {!sent ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }} align="center">
              Enter your email to receive a login link
            </Typography>

            <TextField
              fullWidth
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => checkUserPhone(e.target.value)}
              disabled={loading}
              sx={{ mb: 2 }}
              autoFocus
            />

            {hasPhone && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  How would you like to receive your login link?
                </Typography>
                <ToggleButtonGroup
                  value={method}
                  exclusive
                  onChange={(e, value) => value && setMethod(value)}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="email">
                    <EmailIcon sx={{ mr: 1, fontSize: 18 }} /> Email
                  </ToggleButton>
                  <ToggleButton value="sms">
                    <SmsIcon sx={{ mr: 1, fontSize: 18 }} /> SMS
                  </ToggleButton>
                  <ToggleButton value="both">
                    Both
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleSendMagicLink}
              disabled={loading || !email || !email.includes('@')}
            >
              {loading ? 'Sending...' : 'Send Magic Link'}
            </Button>
          </>
        ) : (
          <Alert severity="success">
            <Typography variant="body1" gutterBottom>
              Check your {method === 'email' ? 'email' : method === 'sms' ? 'phone' : 'email and phone'}!
            </Typography>
            <Typography variant="body2">
              We sent a magic link to <strong>{email}</strong>.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Click the link to log in. It expires in 1 hour.
            </Typography>
            <Button
              size="small"
              onClick={() => { setSent(false); setError(null); }}
              sx={{ mt: 2 }}
            >
              Didn't receive it? Try again
            </Button>
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }} align="center">
          This is a backup system for when MaidCentral is unavailable.
          <br />
          For normal access, use the main MaidCentral application.
        </Typography>
      </Paper>
    </Box>
  );
}
```

### 2. Check User Phone Edge Function

```typescript
// supabase/functions/check-user-phone/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if user exists and has phone number
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('phone')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return new Response(
      JSON.stringify({
        hasPhone: !!profile?.phone,
        exists: !!profile
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking user phone:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### 3. Send Magic Link Edge Function

```typescript
// supabase/functions/send-magic-link/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;
const appUrl = Deno.env.get('APP_URL')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    const { email, method = 'email' } = await req.json(); // 'email', 'sms', or 'both'

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, phone, full_name, prefer_sms')
      .eq('email', email)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: 'User not found. Contact your administrator.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results: any = {};
    let smsCount = 0;
    let smsCost = 0;

    // Determine which method(s) to use
    const shouldSendEmail = method === 'email' || method === 'both' || !profile.phone;
    const shouldSendSMS = (method === 'sms' || method === 'both') && profile.phone;

    // Generate magic link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${appUrl}/auth/callback`
      }
    });

    if (linkError) throw linkError;

    const magicLink = linkData.properties.action_link;

    // Send via Email
    if (shouldSendEmail) {
      try {
        const { error: emailError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${appUrl}/auth/callback`
          }
        });

        results.email = emailError
          ? { success: false, error: emailError.message }
          : { success: true };
      } catch (e) {
        results.email = { success: false, error: e.message };
      }
    }

    // Send via SMS (Twilio)
    if (shouldSendSMS) {
      try {
        const smsBody = `Your MaidCentral Backup login link:\n\n${magicLink}\n\nThis link expires in 1 hour.`;

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              To: profile.phone,
              From: twilioPhoneNumber,
              Body: smsBody
            }).toString()
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to send SMS');
        }

        results.sms = { success: true };
        smsCount = 1;
        smsCost = 0.0079; // US SMS cost

      } catch (e) {
        console.error('SMS send error:', e);
        results.sms = { success: false, error: e.message };
      }
    }

    // Log communication
    await supabase.from('communication_logs').insert({
      subject: 'Magic Link',
      message: `Sent to ${email} via ${method}`,
      communication_type: shouldSendSMS ? 'magic_link_sms' : 'magic_link_email',
      method,
      recipient_count: 1,
      status: 'sent',
      sent_at: new Date().toISOString(),
      sms_count: smsCount,
      sms_cost: smsCost
    });

    const successMethods = Object.entries(results)
      .filter(([_, result]: any) => result.success)
      .map(([method]) => method);

    return new Response(
      JSON.stringify({
        success: successMethods.length > 0,
        results,
        message: `Magic link sent via ${successMethods.join(' and ')}`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending magic link:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send magic link' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### 4. Auth Callback Handler

```jsx
// src/pages/AuthCallback.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Box, CircularProgress, Typography } from '@mui/material';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    handleAuthCallback();
  }, []);

  async function handleAuthCallback() {
    try {
      // Get session from URL hash
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (session) {
        // Update last_login_at
        await supabase
          .from('user_profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', session.user.id);

        // Get user profile to determine role
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        // Redirect based on role
        if (profile?.role === 'superadmin') {
          navigate('/superadmin');
        } else if (profile?.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/schedule');
        }
      } else {
        throw new Error('No session found');
      }
    } catch (err) {
      console.error('Auth callback error:', err);
      setError(err.message);
      setTimeout(() => navigate('/login'), 3000);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {error ? (
        <>
          <Typography color="error" gutterBottom>
            Authentication failed: {error}
          </Typography>
          <Typography variant="body2">
            Redirecting to login...
          </Typography>
        </>
      ) : (
        <>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography>
            Logging you in...
          </Typography>
        </>
      )}
    </Box>
  );
}
```

---

## Bulk Send Implementation (Company Admin)

```jsx
// src/pages/admin/BulkSendLinks.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Box, Typography, Button, Alert, Table, TableBody, TableCell,
  TableHead, TableRow, ToggleButtonGroup, ToggleButton, Chip, Paper
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';

export default function BulkSendLinks() {
  const [dateRange, setDateRange] = useState('today');
  const [method, setMethod] = useState('email');
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && dateRange) {
      fetchScheduledTechnicians();
    }
  }, [dateRange, currentUser]);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();
      setCurrentUser({ ...user, company_id: profile?.company_id });
    }
  }

  async function fetchScheduledTechnicians() {
    setLoading(true);

    try {
      // Get date range
      const { start, end } = getDateRange(dateRange);

      // Call RPC to get scheduled technicians
      const { data, error } = await supabase.rpc('get_scheduled_technicians', {
        p_company_id: currentUser.company_id,
        p_start_date: start,
        p_end_date: end
      });

      if (error) throw error;

      setTechnicians(data || []);
    } catch (err) {
      console.error('Error fetching technicians:', err);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange(range) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case 'today':
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
      case 'thisWeek':
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
        return {
          start: today.toISOString(),
          end: endOfWeek.toISOString()
        };
      default:
        return { start: today.toISOString(), end: today.toISOString() };
    }
  }

  async function handleBulkSend() {
    setLoading(true);
    setSent(false);

    try {
      const { data, error } = await supabase.functions.invoke('bulk-send-magic-links', {
        body: {
          user_ids: technicians.map(t => t.id),
          method,
          message: `Your schedule for ${dateRange} is ready to view.`,
          date_range: dateRange
        }
      });

      if (error) throw error;

      setSent(true);
      alert(`Successfully sent ${data.sent} magic links via ${method}!`);
    } catch (err) {
      console.error('Bulk send error:', err);
      alert(`Failed to send magic links: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const techsWithPhone = technicians.filter(t => t.phone).length;
  const techsWithoutPhone = technicians.length - techsWithPhone;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Send Schedule Links to Technicians
      </Typography>

      {/* Date Range Selector */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" gutterBottom>
          Select date range:
        </Typography>
        <ToggleButtonGroup
          value={dateRange}
          exclusive
          onChange={(e, v) => v && setDateRange(v)}
        >
          <ToggleButton value="today">Today</ToggleButton>
          <ToggleButton value="thisWeek">This Week</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Technician Preview */}
      {loading && <Typography>Loading technicians...</Typography>}

      {!loading && technicians.length > 0 && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Found <strong>{technicians.length}</strong> technician(s) scheduled for {dateRange}
            {techsWithPhone > 0 && ` (${techsWithPhone} with phone numbers)`}
          </Alert>

          <Paper sx={{ mb: 3, maxHeight: 400, overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {technicians.map(tech => (
                  <TableRow key={tech.id}>
                    <TableCell>{tech.full_name}</TableCell>
                    <TableCell>{tech.email}</TableCell>
                    <TableCell>
                      {tech.phone || <Chip label="No phone" size="small" color="default" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {/* Send Method */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" gutterBottom>
              How do you want to send the links?
            </Typography>
            <ToggleButtonGroup
              value={method}
              exclusive
              onChange={(e, v) => v && setMethod(v)}
            >
              <ToggleButton value="email">
                <EmailIcon sx={{ mr: 1, fontSize: 18 }} /> Email Only
              </ToggleButton>
              <ToggleButton value="sms" disabled={techsWithPhone === 0}>
                <SmsIcon sx={{ mr: 1, fontSize: 18 }} /> SMS Only
              </ToggleButton>
              <ToggleButton value="both" disabled={techsWithPhone === 0}>
                Both
              </ToggleButton>
            </ToggleButtonGroup>

            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              {method === 'sms' && techsWithoutPhone > 0 &&
                `${techsWithoutPhone} technician(s) without phone will receive email instead`}
              {method === 'both' &&
                `All technicians will receive email. ${techsWithPhone} will also receive SMS.`}
              {method === 'sms' && techsWithPhone > 0 &&
                ` (~$${(techsWithPhone * 0.0079).toFixed(2)} SMS cost)`}
              {method === 'both' && techsWithPhone > 0 &&
                ` (~$${(techsWithPhone * 0.0079).toFixed(2)} SMS cost)`}
            </Typography>
          </Box>

          <Button
            variant="contained"
            size="large"
            onClick={handleBulkSend}
            disabled={loading || technicians.length === 0}
          >
            {loading ? 'Sending...' : `Send to ${technicians.length} Technician(s)`}
          </Button>
        </>
      )}

      {!loading && technicians.length === 0 && (
        <Alert severity="info">
          No technicians scheduled for {dateRange}
        </Alert>
      )}
    </Box>
  );
}
```

### Bulk Send Edge Function

```typescript
// supabase/functions/bulk-send-magic-links/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    const { user_ids, method = 'email', message, date_range } = await req.json();

    if (!user_ids || user_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'user_ids is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, email, phone, full_name')
      .in('id', user_ids);

    if (profilesError) throw profilesError;

    const results = [];
    let totalSent = 0;
    let totalSmsCost = 0;

    // Send to each user
    for (const profile of profiles) {
      try {
        const { data, error } = await supabase.functions.invoke('send-magic-link', {
          body: {
            email: profile.email,
            method: !profile.phone && method === 'sms' ? 'email' : method
          }
        });

        if (!error && data.success) {
          totalSent++;
          if (data.results?.sms?.success) {
            totalSmsCost += 0.0079;
          }
          results.push({ email: profile.email, success: true });
        } else {
          results.push({ email: profile.email, success: false, error: error?.message });
        }
      } catch (e) {
        results.push({ email: profile.email, success: false, error: e.message });
      }
    }

    // Log bulk communication
    await supabase.from('communication_logs').insert({
      subject: 'Bulk Magic Links',
      message: message || `Scheduled technicians for ${date_range}`,
      communication_type: 'magic_link_bulk',
      method,
      recipient_type: 'scheduled_technicians',
      recipient_count: profiles.length,
      status: totalSent > 0 ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
      sms_count: Math.floor(totalSmsCost / 0.0079),
      sms_cost: totalSmsCost
    });

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        failed: profiles.length - totalSent,
        sms_cost: totalSmsCost,
        results
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Bulk send error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### Get Scheduled Technicians RPC Function

```sql
-- Create RPC function to get technicians scheduled for date range
CREATE OR REPLACE FUNCTION get_scheduled_technicians(
  p_company_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  phone TEXT,
  full_name TEXT,
  employee_information_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    up.id,
    up.email,
    up.phone,
    up.full_name,
    up.employee_information_id
  FROM user_profiles up
  INNER JOIN schedule_data sd ON sd.company_id = up.company_id
  WHERE
    up.company_id = p_company_id
    AND up.role = 'technician'
    AND up.employee_information_id IS NOT NULL
    -- Check if employee has jobs in date range (JSONB query)
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(sd.data->'jobs') AS job
      WHERE
        (job->>'jobDate')::timestamptz >= p_start_date
        AND (job->>'jobDate')::timestamptz <= p_end_date
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(job->'employeeSchedules') AS emp
          WHERE emp->>'employeeInformationId' = up.employee_information_id
        )
    )
  ORDER BY up.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Deployment Setup

### 1. GitHub Actions Workflow (Auto-deploy to Vercel + Netlify)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel and Netlify

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy-vercel:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'

  deploy-netlify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
        with:
          args: deploy --prod --dir=dist
```

### 2. Health Check Endpoint

```javascript
// src/api/health.js (Vercel) or netlify/functions/health.js (Netlify)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const startTime = Date.now();

    // Quick database check
    const { data, error } = await supabase
      .from('companies')
      .select('count')
      .limit(1)
      .single();

    if (error) throw error;

    const duration = Date.now() - startTime;

    res.status(200).json({
      healthy: true,
      timestamp: new Date().toISOString(),
      database: 'connected',
      latency: `${duration}ms`,
      provider: process.env.VERCEL ? 'vercel' : 'netlify'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
```

### 3. Cloudflare Load Balancing Setup

**Step 1: Add Origins**
```
Cloudflare Dashboard → Traffic → Load Balancing → Create Load Balancer

Origin Pool 1 (Primary - Vercel):
- Name: vercel-primary
- Origin Address: your-app.vercel.app
- Weight: 1

Origin Pool 2 (Fallback - Netlify):
- Name: netlify-fallback
- Origin Address: your-app.netlify.app
- Weight: 1
```

**Step 2: Create Health Check**
```
Path: /api/health
Interval: 60 seconds
Timeout: 5 seconds
Retries: 2
Expected Code: 200
Expected Body: "healthy":true
```

**Step 3: Create Load Balancer**
```
Hostname: backup.maidcentral.com
TTL: Auto
Pools:
  1. vercel-primary (primary)
  2. netlify-fallback (fallback)
Fallback Pool: netlify-fallback
Steering Policy: Off (manual failover)
Session Affinity: None
```

---

## Monitoring Setup

### UptimeRobot Configuration

**Monitor 1: Primary Site**
```
Type: HTTP(s)
URL: https://backup.maidcentral.com
Friendly Name: Backup Portal - Primary
Monitoring Interval: 5 minutes
Alert Contacts:
  - Email: justin@maidcentral.com
  - SMS: +1234567890
```

**Monitor 2: Health Endpoint**
```
Type: Keyword
URL: https://backup.maidcentral.com/api/health
Friendly Name: Backup Portal - Health Check
Keyword: "healthy":true
Monitoring Interval: 5 minutes
Alert Contacts:
  - Email: justin@maidcentral.com
```

**Monitor 3: Failover Site**
```
Type: HTTP(s)
URL: https://backup2.maidcentral.com
Friendly Name: Backup Portal - Netlify Failover
Monitoring Interval: 5 minutes
Alert Contacts:
  - Email: justin@maidcentral.com
```

### Automated Monthly Drill

```sql
-- Schedule monthly drill (first Monday of each month at 9 AM)
SELECT cron.schedule(
  'monthly-backup-drill',
  '0 9 1-7 * 1', -- 9 AM on days 1-7 of month, only on Monday
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/monthly-drill',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    )
  ) as request_id;
  $$
);
```

```typescript
// supabase/functions/monthly-drill/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const drillReport = {
    timestamp: new Date().toISOString(),
    tests: [] as any[]
  };

  // Test 1: Database Connectivity
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('count')
      .limit(1);

    drillReport.tests.push({
      name: 'Database Connectivity',
      status: error ? 'FAIL' : 'PASS',
      error: error?.message
    });
  } catch (e) {
    drillReport.tests.push({
      name: 'Database Connectivity',
      status: 'FAIL',
      error: e.message
    });
  }

  // Test 2: Auth Service (Magic Link Generation)
  try {
    const { error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: 'drill-test@maidcentral.com'
    });

    drillReport.tests.push({
      name: 'Magic Link Generation',
      status: error ? 'FAIL' : 'PASS',
      error: error?.message
    });
  } catch (e) {
    drillReport.tests.push({
      name: 'Magic Link Generation',
      status: 'FAIL',
      error: e.message
    });
  }

  // Test 3: Sync Freshness
  const { data: companies } = await supabase
    .from('companies')
    .select('name, last_sync_at')
    .order('last_sync_at', { ascending: true })
    .limit(5);

  const staleCompanies = companies?.filter(c => {
    if (!c.last_sync_at) return true;
    const hoursSinceSync = (Date.now() - new Date(c.last_sync_at).getTime()) / 3600000;
    return hoursSinceSync > 2;
  }) || [];

  drillReport.tests.push({
    name: 'Sync Freshness',
    status: staleCompanies.length > 0 ? 'WARN' : 'PASS',
    staleCompanies: staleCompanies.map(c => c.name)
  });

  // Test 4: Frontend Accessibility
  try {
    const response = await fetch(`${appUrl}/api/health`);
    drillReport.tests.push({
      name: 'Frontend Health',
      status: response.ok ? 'PASS' : 'FAIL',
      statusCode: response.status
    });
  } catch (e) {
    drillReport.tests.push({
      name: 'Frontend Health',
      status: 'FAIL',
      error: e.message
    });
  }

  // Test 5: Concurrent Requests (Load Test)
  const start = Date.now();
  try {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`${appUrl}/api/health`)
      )
    );
    const duration = Date.now() - start;

    drillReport.tests.push({
      name: 'Concurrent Requests (10)',
      status: duration < 5000 ? 'PASS' : 'WARN',
      duration: `${duration}ms`
    });
  } catch (e) {
    drillReport.tests.push({
      name: 'Concurrent Requests (10)',
      status: 'FAIL',
      error: e.message
    });
  }

  // Send email report
  await sendDrillReport(drillReport);

  return new Response(
    JSON.stringify(drillReport),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

async function sendDrillReport(report: any) {
  const failed = report.tests.filter((t: any) => t.status === 'FAIL');
  const warnings = report.tests.filter((t: any) => t.status === 'WARN');

  const subject = failed.length > 0
    ? '⚠️ Monthly DR Drill - Issues Found'
    : warnings.length > 0
    ? '⚠️ Monthly DR Drill - Warnings'
    : '✅ Monthly DR Drill - All Systems Healthy';

  const html = `
    <h2>MaidCentral Backup System - Monthly Health Check</h2>
    <p><strong>Date:</strong> ${new Date(report.timestamp).toLocaleString()}</p>

    <h3>Summary</h3>
    <ul>
      <li>Passed: ${report.tests.filter((t: any) => t.status === 'PASS').length}</li>
      <li>Warnings: ${warnings.length}</li>
      <li>Failed: ${failed.length}</li>
    </ul>

    <h3>Test Results</h3>
    <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th>Test</th>
          <th>Status</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${report.tests.map((t: any) => `
          <tr>
            <td>${t.name}</td>
            <td style="color: ${t.status === 'PASS' ? 'green' : t.status === 'WARN' ? 'orange' : 'red'}; font-weight: bold;">
              ${t.status}
            </td>
            <td>${t.error || t.duration || t.staleCompanies?.join(', ') || 'OK'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <p style="margin-top: 20px; font-size: 12px; color: #666;">
      This is an automated monthly drill.
      ${failed.length > 0 ? '<strong>Action required: Investigate failures immediately.</strong>' : ''}
    </p>
  `;

  // Send via Supabase (or your email service)
  // Implementation depends on your email provider
  console.log('Drill report:', subject);
}
```

---

## Emergency Mode Implementation

```jsx
// src/pages/superadmin/EmergencyMode.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Box, Card, CardContent, Typography, Switch, FormControlLabel,
  Button, Alert, ToggleButtonGroup, ToggleButton, Dialog,
  DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';
import WarningIcon from '@mui/icons-material/Warning';

export default function EmergencyMode() {
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [method, setMethod] = useState('both');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  useEffect(() => {
    checkEmergencyMode();
  }, []);

  async function checkEmergencyMode() {
    // Check if emergency mode is active
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'emergency_mode')
      .single();

    setEmergencyMode(data?.value === 'true');
  }

  async function toggleEmergencyMode() {
    if (!emergencyMode) {
      // Enabling - show confirmation
      setConfirmDialog(true);
    } else {
      // Disabling
      await disableEmergencyMode();
    }
  }

  async function enableEmergencyMode() {
    setLoading(true);
    setConfirmDialog(false);

    try {
      // Set emergency mode in database
      await supabase
        .from('system_settings')
        .upsert({
          key: 'emergency_mode',
          value: 'true',
          updated_at: new Date().toISOString()
        });

      setEmergencyMode(true);

      // Optionally send bulk magic links
      await sendEmergencyBroadcast();

      alert('Emergency Mode enabled successfully!');
    } catch (err) {
      console.error('Error enabling emergency mode:', err);
      alert(`Failed to enable emergency mode: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function disableEmergencyMode() {
    setLoading(true);

    try {
      await supabase
        .from('system_settings')
        .upsert({
          key: 'emergency_mode',
          value: 'false',
          updated_at: new Date().toISOString()
        });

      setEmergencyMode(false);
      alert('Emergency Mode disabled');
    } catch (err) {
      console.error('Error disabling emergency mode:', err);
      alert(`Failed to disable emergency mode: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function sendEmergencyBroadcast() {
    try {
      const { data, error } = await supabase.functions.invoke('emergency-broadcast', {
        body: {
          method,
          subject: 'MaidCentral Backup System Access',
          message: 'MaidCentral is experiencing issues. You can access your schedules via the backup portal.'
        }
      });

      if (error) throw error;

      alert(`Emergency broadcast sent to ${data.sent} users via ${method}`);
    } catch (err) {
      console.error('Broadcast error:', err);
      alert(`Failed to send broadcast: ${err.message}`);
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h4" gutterBottom>
        Emergency Mode
      </Typography>

      <Card>
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={emergencyMode}
                onChange={toggleEmergencyMode}
                color="error"
                disabled={loading}
              />
            }
            label={
              <Typography variant="h6">
                {emergencyMode ? 'Emergency Mode Active' : 'Emergency Mode Inactive'}
              </Typography>
            }
          />

          {!emergencyMode && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Enable Emergency Mode when MaidCentral is experiencing an outage.
              This will:
              <ul>
                <li>Extend magic link expiry to 7 days (normally 1 hour)</li>
                <li>Extend session duration to 48 hours (normally 1 hour)</li>
                <li>Optionally send access links to all companies</li>
              </ul>
            </Alert>
          )}

          {emergencyMode && (
            <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Emergency Mode is Active
              </Typography>
              <ul style={{ margin: 0 }}>
                <li>Magic links valid for 7 days</li>
                <li>Sessions last 48 hours</li>
                <li>Activated at: {new Date().toLocaleString()}</li>
              </ul>

              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Send emergency access to all companies:
                </Typography>
                <ToggleButtonGroup
                  value={method}
                  exclusive
                  onChange={(e, v) => v && setMethod(v)}
                  size="small"
                >
                  <ToggleButton value="email">
                    <EmailIcon sx={{ mr: 1, fontSize: 16 }} /> Email
                  </ToggleButton>
                  <ToggleButton value="sms">
                    <SmsIcon sx={{ mr: 1, fontSize: 16 }} /> SMS
                  </ToggleButton>
                  <ToggleButton value="both">
                    Both
                  </ToggleButton>
                </ToggleButtonGroup>
                <Button
                  sx={{ ml: 2 }}
                  variant="contained"
                  color="error"
                  onClick={sendEmergencyBroadcast}
                  disabled={loading}
                >
                  Send Now
                </Button>
              </Box>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Enable Emergency Mode?</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This will activate emergency settings for the backup system:
          </Typography>
          <ul>
            <li>Magic links will be valid for 7 days</li>
            <li>User sessions will last 48 hours</li>
          </ul>
          <Typography sx={{ mt: 2 }}>
            Do you also want to send emergency access links to all companies?
          </Typography>
          <ToggleButtonGroup
            value={method}
            exclusive
            onChange={(e, v) => v && setMethod(v)}
            fullWidth
            sx={{ mt: 2 }}
          >
            <ToggleButton value="email">Email Only</ToggleButton>
            <ToggleButton value="sms">SMS Only</ToggleButton>
            <ToggleButton value="both">Both</ToggleButton>
          </ToggleButtonGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button onClick={enableEmergencyMode} variant="contained" color="error">
            Enable Emergency Mode
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

### System Settings Table

```sql
-- Create system_settings table for emergency mode flag
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default
INSERT INTO system_settings (key, value) VALUES ('emergency_mode', 'false');

-- RLS policy (only superadmins can modify)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage system settings"
  ON system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );
```

---

## Cost Breakdown

### Monthly Recurring Costs

| Service | Tier | Cost | What It Includes |
|---------|------|------|------------------|
| **Supabase** | Pro | $25/mo | 8GB database, 50GB bandwidth, 2M Edge Function invocations, 100K MAU |
| **Vercel** | Pro | $20/mo | 1TB bandwidth, 100GB-hours compute, Analytics (or $0 on free tier if usage is low) |
| **Netlify** | Free | $0/mo | 100GB bandwidth (failover only, low usage) |
| **Cloudflare** | Free | $0/mo | DNS + Load Balancing (2 origins) |
| **UptimeRobot** | Free | $0/mo | 50 monitors, 5-min intervals, email+SMS alerts |
| **Twilio** | Pay-as-you-go | $1.15/mo | Phone number rental |
| **Twilio SMS** | Usage-based | ~$30-40/mo | Estimated for 1,000 users preferring SMS, ~4K messages/month |
| **TOTAL** | | **$76-86/mo** | |

### Usage-Based Costs

| Scenario | Cost | Details |
|----------|------|---------|
| **Emergency SMS Broadcast** | ~$40 | Send to all 5,000 users (5,000 × $0.0079) |
| **Weekly Bulk Send (100 techs)** | $0.79 | 100 scheduled technicians via SMS |
| **Daily SMS Magic Links** | ~$1/day | ~130 SMS/day if 20% of users prefer SMS |

### Cost Comparison

**Current Plan (Simplified):** $76-86/mo
**Original Complex Plan:** $120-150/mo
**Savings:** ~$40-65/mo by removing unnecessary complexity

---

## 4-Week Implementation Checklist

### Week 1: Core Backend Setup
- [ ] **Day 1-2: Supabase Setup**
  - [ ] Create Supabase Pro project
  - [ ] Run all SQL migrations (tables, RLS, indexes)
  - [ ] Create system_settings table for emergency mode
  - [ ] Test RLS policies with different user roles

- [ ] **Day 3-4: Edge Functions**
  - [ ] Deploy check-user-phone function
  - [ ] Deploy send-magic-link function (email + SMS via Twilio)
  - [ ] Deploy bulk-send-magic-links function
  - [ ] Deploy monthly-drill function
  - [ ] Test all functions locally with Supabase CLI

- [ ] **Day 5: Hourly Sync**
  - [ ] Implement hourly-sync Edge Function
  - [ ] Include phone number sync from MaidCentral
  - [ ] Set up pg_cron schedule
  - [ ] Test with sample data

**Deliverable:** Working Supabase backend with all functions deployed

---

### Week 2: Authentication & Frontend Core
- [ ] **Day 1-2: Authentication**
  - [ ] Set up Twilio account, get phone number
  - [ ] Configure Supabase Auth settings
  - [ ] Implement Login page (email + SMS toggle)
  - [ ] Implement AuthCallback handler
  - [ ] Test magic link flow (email and SMS)

- [ ] **Day 3-4: Frontend Structure**
  - [ ] Set up React Router
  - [ ] Create useAuth hook
  - [ ] Create protected route wrapper
  - [ ] Build basic layouts (Header, Footer, Navigation)
  - [ ] Implement role-based routing

- [ ] **Day 5: User Profiles**
  - [ ] Build user profile page
  - [ ] Allow users to set phone number
  - [ ] Allow users to set SMS preference
  - [ ] Test profile updates

**Deliverable:** Working login flow and basic app structure

---

### Week 3: Admin Features & Deployment
- [ ] **Day 1-2: Company Admin Dashboard**
  - [ ] Build schedule view (read-only)
  - [ ] Implement job filtering by EmployeeInformationId
  - [ ] Build BulkSendLinks page
  - [ ] Implement get_scheduled_technicians RPC
  - [ ] Test bulk send with sample technicians

- [ ] **Day 3: Super Admin Portal**
  - [ ] Build group/company management page
  - [ ] Implement Emergency Mode UI
  - [ ] Build communication logs view
  - [ ] Test emergency mode activation

- [ ] **Day 4-5: Deployment**
  - [ ] Set up GitHub Actions workflow
  - [ ] Deploy to Vercel (connect GitHub repo)
  - [ ] Deploy to Netlify (via GitHub Actions)
  - [ ] Configure custom domain (backup.maidcentral.com)
  - [ ] Configure Cloudflare load balancing
  - [ ] Test automatic failover (disable Vercel, verify Netlify takeover)

**Deliverable:** Fully deployed system with multi-provider hosting

---

### Week 4: Monitoring, Testing & Documentation
- [ ] **Day 1: Monitoring**
  - [ ] Set up UptimeRobot monitors (3 monitors)
  - [ ] Configure email + SMS alerts
  - [ ] Test alert flow (intentionally break health check)
  - [ ] Set up Cloudflare health checks

- [ ] **Day 2: Automated Testing**
  - [ ] Schedule monthly drill with pg_cron
  - [ ] Test drill execution manually
  - [ ] Verify drill email report
  - [ ] Document drill results

- [ ] **Day 3: Load Testing**
  - [ ] Use k6 or Artillery to simulate 1,000 concurrent users
  - [ ] Monitor Supabase metrics during load test
  - [ ] Monitor Vercel metrics
  - [ ] Identify any bottlenecks

- [ ] **Day 4: Documentation & Training**
  - [ ] Create DR runbook (see below)
  - [ ] Document emergency procedures
  - [ ] Create admin user guide
  - [ ] Train team on DR activation

- [ ] **Day 5: Final Drill**
  - [ ] Run full disaster recovery drill
  - [ ] Simulate MaidCentral outage
  - [ ] Activate emergency mode
  - [ ] Send bulk magic links
  - [ ] Verify user access
  - [ ] Document lessons learned

**Deliverable:** Production-ready backup system with monitoring and documentation

---

## Disaster Recovery Runbook

### When MaidCentral is Down

#### Phase 1: Detection & Verification (0-5 minutes)
1. **Verify Outage**
   - Check main MaidCentral app (maidcentral.com)
   - Verify Azure status page
   - Confirm with team: Is this a real outage?

2. **Check Backup System Health**
   - Visit backup.maidcentral.com
   - Verify site loads
   - Check "Last Sync" timestamp in UI
   - If site down, try backup2.maidcentral.com (Netlify)

3. **Assess Data Freshness**
   - How old is last sync? (Acceptable: < 2 hours)
   - Do users have today's schedules? (Critical)

#### Phase 2: Activation (5-15 minutes)
1. **Enable Emergency Mode**
   - Log in as Super Admin
   - Navigate to Emergency Mode page
   - Toggle Emergency Mode ON
   - Extends magic link expiry to 7 days
   - Extends sessions to 48 hours

2. **Send Emergency Broadcast**
   - Choose method: Email, SMS, or Both
   - Email: $0 (via Supabase Auth)
   - SMS: ~$40 for 5,000 users
   - Message template:
     ```
     MaidCentral is currently experiencing technical issues.

     Access your backup schedules here:
     backup.maidcentral.com

     This link is valid for 7 days.
     ```
   - Click "Send Now"

3. **Verify Broadcast Delivery**
   - Check Communication Logs in admin panel
   - Confirm sent count matches expected
   - Monitor for bounce/failure emails

#### Phase 3: Support & Monitoring (15 min - recovery)
1. **Monitor Backup System**
   - Check UptimeRobot dashboard (all green?)
   - Monitor Supabase dashboard for load spikes
   - Watch Vercel analytics for traffic
   - Check Slack #backup-alerts for issues

2. **Support Users**
   - Monitor support email/tickets
   - Common issues:
     - "Didn't receive magic link" → Resend via admin panel
     - "Link expired" → Emergency mode should prevent this
     - "Can't see my schedule" → Verify last sync, check RLS policies

3. **Company Admins: Bulk Send to Scheduled Technicians**
   - Company admins log in
   - Go to "Send Schedule Links"
   - Select date range (Today or This Week)
   - Choose method: Email/SMS/Both
   - Send to scheduled technicians only

4. **Status Updates**
   - Update status page every 30 minutes
   - Keep customers informed via email/social media
   - Estimated time to recovery?

#### Phase 4: Recovery & Transition Back
1. **MaidCentral Restored**
   - Verify main app is accessible
   - Test core functionality (login, schedules, etc.)
   - Run manual sync to get latest data

2. **Verify Data Sync**
   - Check last_sync_at timestamps
   - Confirm all companies synced successfully
   - Review sync_jobs table for errors

3. **Disable Emergency Mode**
   - Turn off Emergency Mode in admin panel
   - Sessions return to 1 hour
   - Magic links return to 1 hour expiry

4. **Send All-Clear Message**
   - Email all companies: "MaidCentral is back online"
   - Encourage users to return to main app
   - Thank them for patience

5. **Post-Mortem (within 24 hours)**
   - What caused the outage?
   - How long did it last?
   - How many users accessed backup system?
   - What went well?
   - What needs improvement?
   - Update runbook with lessons learned

---

## Account Setup Checklist

### Before You Start
- [ ] GitHub account (for deployments)
- [ ] Domain access (backup.maidcentral.com)
- [ ] Credit card for paid services

### 1. Supabase Setup
- [ ] Create account at supabase.com
- [ ] Create new project (choose region closest to users)
- [ ] Upgrade to Pro tier ($25/mo)
- [ ] Note down:
  - Project URL (SUPABASE_URL)
  - Anon/Public key (SUPABASE_ANON_KEY)
  - Service role key (SUPABASE_SERVICE_ROLE_KEY)
- [ ] Run SQL migrations in SQL Editor
- [ ] Enable pg_cron extension
- [ ] Configure auth settings (magic link expiry, etc.)

### 2. Twilio Setup
- [ ] Create account at twilio.com
- [ ] Verify your phone number
- [ ] Purchase phone number ($1.15/mo)
- [ ] Note down:
  - Account SID (TWILIO_ACCOUNT_SID)
  - Auth Token (TWILIO_AUTH_TOKEN)
  - Phone Number (TWILIO_PHONE_NUMBER)
- [ ] Add billing payment method

### 3. Vercel Setup
- [ ] Create account at vercel.com
- [ ] Connect GitHub account
- [ ] Create new project from GitHub repo
- [ ] Configure environment variables:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
- [ ] Note down:
  - Project ID (VERCEL_PROJECT_ID)
  - Org ID (VERCEL_ORG_ID)
  - Deploy token (VERCEL_TOKEN)
- [ ] Configure custom domain: backup.maidcentral.com

### 4. Netlify Setup
- [ ] Create account at netlify.com
- [ ] Create new site (manual deployment initially)
- [ ] Note down:
  - Site ID (NETLIFY_SITE_ID)
  - Auth token (NETLIFY_AUTH_TOKEN)
- [ ] Configure environment variables (same as Vercel)
- [ ] Configure custom domain: backup2.maidcentral.com

### 5. Cloudflare Setup
- [ ] Log in to Cloudflare dashboard
- [ ] Go to Traffic → Load Balancing
- [ ] Create health check (/api/health)
- [ ] Add origin pools:
  - Vercel: your-app.vercel.app
  - Netlify: your-app.netlify.app
- [ ] Create load balancer for backup.maidcentral.com
- [ ] Update DNS records:
  - backup.maidcentral.com → Load Balancer
  - backup2.maidcentral.com → Netlify CNAME

### 6. UptimeRobot Setup
- [ ] Create account at uptimerobot.com
- [ ] Add 3 monitors (see Monitoring Setup section)
- [ ] Configure alert contacts:
  - Email: your-email@maidcentral.com
  - SMS: your-phone-number
- [ ] Test alerts (pause a monitor, verify you get alert)

### 7. GitHub Secrets
- [ ] Go to repo Settings → Secrets and variables → Actions
- [ ] Add secrets:
  - SUPABASE_URL
  - SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - VERCEL_TOKEN
  - VERCEL_ORG_ID
  - VERCEL_PROJECT_ID
  - NETLIFY_AUTH_TOKEN
  - NETLIFY_SITE_ID
  - TWILIO_ACCOUNT_SID
  - TWILIO_AUTH_TOKEN
  - TWILIO_PHONE_NUMBER

---

## Next Steps

1. **Review this plan** with your team
2. **Set up accounts** (Supabase, Vercel, Netlify, Twilio, etc.)
3. **Start Week 1** - Backend setup
4. **Schedule weekly check-ins** to track progress
5. **Plan first DR drill** for end of Week 4

---

## Support & Resources

- **Supabase Docs:** https://supabase.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **Netlify Docs:** https://docs.netlify.com
- **Twilio Docs:** https://www.twilio.com/docs
- **Cloudflare Docs:** https://developers.cloudflare.com
- **React Router:** https://reactrouter.com
- **Material-UI:** https://mui.com

---

**Questions or need help?** Reference the BACKEND-REQUIREMENTS.md for detailed schema and feature specifications.

**Ready to build!** 🚀
