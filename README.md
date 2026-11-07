# Pērc vai pārdod

Latvian classifieds (LV/RU). Vite + React + TypeScript on the front end, Supabase (Postgres, auth, storage) behind it.
Without Supabase settings the site runs as a clearly labelled local demo, with data kept only in the visitor's browser.

## Develop

    npm install
    npm run dev
    npm run test:db    # schema and security rules, in-process Postgres
    npm run build

## Connect a real backend

1. Create a Supabase project in an EU region.
2. Run `supabase/schema.sql`, then `supabase/002_bot.sql`, in the SQL editor.
3. In Authentication > URL Configuration, add the site URL as an allowed redirect.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Cloudflare Pages project (build command `npm run build`, output `dist`, `NODE_VERSION=24`), and `SUPABASE_URL` / `SUPABASE_ANON_KEY` as repository variables for the CI check. The anon key is public by design; never use the service key here.
5. Sign in once, then make yourself admin in the SQL editor:
   `update profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_EMAIL');`
6. Schedule `select expire_ads();` daily with pg_cron.

## Before charging money

Promotion is free while `BETA` is true in `src/core.ts`. Taking payments needs: a registered business, own hosting, a payment provider webhook that replaces the zero charge in `apply_boost`, invoices, and lawyer-reviewed terms.

© 2026 Livonian Labs, Riga, Latvia
