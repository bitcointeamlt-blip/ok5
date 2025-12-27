### Local Supabase setup (for Leaderboard)

Create a file named `.env.local` in the project root and add:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY"
```

Then restart the frontend dev server.

### Notes
- Use the **anon/public** key (not service role).
- On Netlify, set the same keys in **Site settings → Environment variables**.


