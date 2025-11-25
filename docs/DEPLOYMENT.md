# Deployment Guide - Vercel with GitHub Integration

## Quick Setup (5 minutes)

### Step 1: Go to Vercel
Visit [vercel.com](https://vercel.com) and sign in with your **personal GitHub account** (not the organization account)

### Step 2: Import Project
1. Click **"Add New Project"**
2. You'll see "Import Git Repository"
3. Click **"Adjust GitHub App Permissions"** or **"Add GitHub Account"**
4. In the GitHub permissions dialog:
   - Select **"Only select repositories"**
   - Choose: `maidcentral/mc-fallback-v2`
   - Click **"Save"**
5. The repo should now appear in Vercel's import list
6. Click **"Import"** next to `mc-fallback-v2`

### Step 3: Configure Project (Auto-Detected)
Vercel will automatically detect:
- ✅ **Framework Preset:** Vite
- ✅ **Root Directory:** `./`
- ✅ **Build Command:** `npm run build`
- ✅ **Output Directory:** `dist`
- ✅ **Install Command:** `npm install`

**No changes needed** - just click **"Deploy"**

### Step 4: Deploy
- First deployment takes ~2-3 minutes
- Once complete, you'll get a URL like: `https://mc-fallback-v2.vercel.app`

### Step 5: Automatic Deployments (Already Set Up!)
From now on:
- **Push to `main`** → Automatic production deployment
- **Open PR** → Automatic preview deployment with unique URL
- No manual steps needed!

---

## Optional: Custom Domain

### Add `backup.maidcentral.com`

1. In Vercel dashboard → Your project → **Settings** → **Domains**
2. Click **"Add"**
3. Enter: `backup.maidcentral.com`
4. Vercel will give you a CNAME record to add to your DNS:
   ```
   Type: CNAME
   Name: backup
   Value: cname.vercel-dns.com
   ```
5. Add this CNAME record in your DNS provider (where maidcentral.com is registered)
6. Wait for DNS propagation (5-30 minutes)
7. Your app will be live at `https://backup.maidcentral.com`

---

## What's Already Configured

✅ [vercel.json](vercel.json) - SPA routing configuration (handles client-side routing)
✅ [.gitignore](.gitignore) - Ignores build artifacts (`/dist`, `.vercel`)
✅ Repository pushed to GitHub

---

## Troubleshooting

### "This action must be performed by an organization owner"
**Solution:** Sign in to Vercel with your **personal GitHub account**, not the organization account. When granting permissions, select only the specific `maidcentral/mc-fallback-v2` repository.

### Build Fails
1. Check build logs in Vercel dashboard
2. Verify `npm run build` works locally
3. Check for missing dependencies

### 404 on Page Refresh
This is already handled by [vercel.json](vercel.json) - all routes redirect to `/index.html` for client-side routing.

---

## Deployment URL

After deployment, your app will be accessible at:
- Production: `https://mc-fallback-v2.vercel.app`
- Custom domain (if configured): `https://backup.maidcentral.com`

Every PR will get its own preview URL like:
- `https://mc-fallback-v2-git-feature-branch.vercel.app`

---

**Ready to deploy!** Go to [vercel.com](https://vercel.com) now and import your repo.
