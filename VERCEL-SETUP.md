# Vercel Deployment Setup via GitHub Actions

## Step 1: Install Vercel CLI (on your machine)

```bash
npm install -g vercel
```

## Step 2: Login to Vercel

```bash
vercel login
```

This will open a browser to authenticate.

## Step 3: Link Your Project to Vercel

In your project directory, run:

```bash
vercel link
```

Follow the prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → Select your account/organization
- **Link to existing project?** → No (create new)
- **What's your project's name?** → `mc-fallback-v2` (or your preferred name)
- **In which directory is your code located?** → `./` (press Enter)

This creates a `.vercel` folder with project configuration.

## Step 4: Get Vercel Token

1. Go to [https://vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Name it: `GitHub Actions Deploy`
4. Set scope: **Full Account** (or specific to your project)
5. Click **Create**
6. **Copy the token** (you won't see it again!)

## Step 5: Get Project IDs

After running `vercel link`, you can find your IDs:

```bash
cat .vercel/project.json
```

You'll see something like:
```json
{
  "orgId": "team_xxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxx"
}
```

## Step 6: Add GitHub Secrets

1. Go to your GitHub repo: `https://github.com/maidcentral/mc-fallback-v2`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add these three secrets:

   **Secret 1:**
   - Name: `VERCEL_TOKEN`
   - Value: [Paste the token from Step 4]

   **Secret 2:**
   - Name: `VERCEL_ORG_ID`
   - Value: [The `orgId` from `.vercel/project.json`]

   **Secret 3:**
   - Name: `VERCEL_PROJECT_ID`
   - Value: [The `projectId` from `.vercel/project.json`]

## Step 7: Trigger Deployment

Once secrets are added, push any commit to `main` branch:

```bash
git add .
git commit -m "feat: Add GitHub Actions deployment workflow"
git push
```

GitHub Actions will automatically:
1. Install dependencies
2. Build the project
3. Deploy to Vercel

## Step 8: View Deployment

- Check GitHub Actions: `https://github.com/maidcentral/mc-fallback-v2/actions`
- Once complete, your app will be live at: `https://mc-fallback-v2.vercel.app`
- You can also see deployments in your Vercel dashboard

## Optional: Add Custom Domain

In Vercel dashboard:
1. Go to your project
2. Click **Settings** → **Domains**
3. Add `backup.maidcentral.com`
4. Update your DNS with Vercel's CNAME record

---

## How It Works

- **Push to `main`** → Production deployment
- **Open Pull Request** → Preview deployment (with unique URL)
- Every deployment is automatic via GitHub Actions

## Troubleshooting

**If deployment fails:**
1. Check GitHub Actions logs
2. Verify all three secrets are set correctly
3. Make sure `.vercel/project.json` has correct IDs
4. Ensure `vercel link` was run successfully

**Common Issues:**
- Token expired → Create new token
- Wrong org/project ID → Run `vercel link` again
- Build fails → Test `npm run build` locally first
