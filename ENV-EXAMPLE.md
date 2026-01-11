### Local Supabase setup (for Leaderboard)

Create a file named `.env.local` in the project root and add:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY"

# PewPew (Ronke token PvP / craft)
# RONKE token contract (Ronin mainnet)
VITE_RONKE_TOKEN_ADDRESS="0x75ae353997242927c701d4d6c2722ebef43fd2d3"
# Where the 200 RONKE craft fee is sent (system pool address)
VITE_RONKE_POOL_ADDRESS="0xca5822880e797d9167b3b844a2cdf723493281b7"
```

Then restart the frontend dev server.

### Notes
- Use the **anon/public** key (not service role).
- On Netlify, set the same keys in **Site settings → Environment variables**.


