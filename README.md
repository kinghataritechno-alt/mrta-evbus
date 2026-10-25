# Smart Shuttle Bus EV (MRTA Shuttle EV)

Mobile web app for SMART TERMINAL CORPORATION CO., LTD. — MRTA Shuttle Bus fleet STC-01–STC-04.

- `index.html` — login (username + password via Supabase Edge Function `username-login`)
- `app.html` — app shell: home, schedule, inspection, charging, maintenance/accidents, vehicle data, charging report (managers), account
- Backend: Supabase project `gxgiefixfpfbwiaftkdb` (RLS on every table). Only the publishable key is in client code.
- Static site: no build step. Deploy on Vercel as "Other" framework, root directory `/`.

Spec: MRTA-SYS-WF-001-V2.0
