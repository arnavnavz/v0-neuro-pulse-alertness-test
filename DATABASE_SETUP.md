# Database Setup Guide

This application uses Supabase (PostgreSQL) for storing test results, with localStorage as a fallback.

## Setup Instructions

### 1. Create a Supabase Project

**Option A: Through Vercel (if redirected)**
1. Click "Visit Vercel to create a project" on the Supabase page
2. In Vercel, go to your project dashboard
3. Look for "Integrations" or "Add-ons" in your project settings
4. Add Supabase as an integration/add-on
5. This will automatically create a Supabase project linked to your Vercel project

**Option B: Direct on Supabase**
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. If you see a Vercel integration message, you can:
   - Either use the Vercel integration (Option A above)
   - Or try accessing: [https://supabase.com/dashboard/new](https://supabase.com/dashboard/new) directly
3. Fill in your project details:
   - Project name
   - Database password (save this!)
   - Region
   - Pricing plan
4. Click "Create new project"

### 2. Create the Database Table

1. In your Supabase project, go to the SQL Editor
2. Copy and paste the contents of `supabase-schema.sql`
3. Run the SQL to create the `test_results` table

### 3. Get Your API Keys

1. In your Supabase project, go to Settings → API
2. Copy the following:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys")

### 4. Configure Environment Variables

1. Create a `.env.local` file in the root of your project (if it doesn't exist)
2. Add the following:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

3. Replace `your_project_url_here` and `your_anon_key_here` with the values from step 3

### 5. Install Dependencies

Run:
```bash
pnpm install
```

Or if using npm:
```bash
npm install
```

### 6. Restart Your Development Server

After setting up the environment variables, restart your Next.js development server:

```bash
pnpm dev
```

## How It Works

- The app will **automatically try to save to Supabase** if the environment variables are configured
- If Supabase is not configured or there's an error, it will **fall back to localStorage**
- Data is synced between Supabase and localStorage for redundancy
- All storage functions are now async and will work with both storage methods

## Troubleshooting

- **No data showing up?** Check that your environment variables are set correctly and the table was created
- **Still using localStorage?** Check the browser console for any error messages
- **Database connection issues?** Verify your Supabase project is active and the API keys are correct

