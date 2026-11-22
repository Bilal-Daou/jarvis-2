# Turn on "Keep my data safe and synced" (one-time, about 10 minutes, free)

**What this does:** your notes, money, food, habits etc. are saved online in a small private database.
Every copy of Jarvis (the Action Button one in Safari, the home-screen icon, an iPad or computer) signs in
with the same email and shows the same data. A full copy is also saved every day for 30 days.

**What it costs:** nothing, on Supabase's free plan. Free-plan limits (check https://supabase.com/pricing,
they change): 0.5 GB of data per project (Jarvis uses well under 1 MB for a year of normal use),
2 free projects, and a free project is **paused after 1 week with nobody using it**. Daily use keeps it
awake. If it ever pauses, log in to supabase.com and tap "Restore project" (your data is kept).
No card is needed. Never click "Upgrade" without deciding to pay.

Words: a **project** is your own little database on Supabase. A **key** is a long password-like text that
lets the app talk to it. The two values below (URL and anon key) are *meant* to be public; the security
rules in step 3 are what keep each person's data private.

## Steps

1. **Create the account.** Go to https://supabase.com → **Start your project** → sign up (GitHub sign-in is easiest).
2. **Create the project.** **New project** → Name: `jarvis` → set a database password (save it in your
   password manager; Jarvis never needs it) → Region: the one closest to you (e.g. *Central EU (Frankfurt)*)
   → Plan **Free** → **Create new project**. Wait ~2 minutes.
3. **Create the tables and security rules.** Left menu → **SQL Editor** → **New query**. Open
   `docs/sync-supabase.sql` from the repo, copy all of it, paste, tap **Run**. It should say *Success*.
4. **Send a code instead of a link** (a link would open Safari instead of the home-screen app):
   Left menu → **Authentication** → **Emails** (or *Email Templates*). In **Magic Link** *and* in
   **Confirm signup**, replace the body with:
   ```
   <h2>Your Jarvis code</h2><p>Enter this code in Jarvis: <b>{{ .Token }}</b></p>
   ```
   and **Save**.
5. **Copy the two values.** Left menu → **Project Settings** → **API** (or *Data API* / *API Keys*):
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (or **publishable** key, starts with `sb_publishable_` or `eyJ`). **Not** the
     `service_role` / secret key: never share that one.
6. **Give them to Claude** (paste both in the chat). Claude puts them in the marked box at the top of
   `features/sync.js` and publishes. (Or: in Jarvis, Settings → Sync & online backup → **Server details**,
   paste both → Save. That only sets up that one device.)
7. **Turn it on, on every copy of Jarvis:** Settings → **Sync & online backup** → **Turn on** → your email →
   **Send code** → copy the code from the email (iPhone usually offers it above the keyboard) → **Turn on sync**.
   Do this in the Action Button version **and** in the home-screen app. The first sign-in on each one
   *combines* what's there with the online copy, so nothing is lost.

## Good to know
- **Email limit:** Supabase's built-in email sender is for testing: it sends only a few emails per hour and
  may only deliver to your own (team member) address. Fine for you alone. Before selling, connect a free
  email service (e.g. Resend free tier) under Authentication → SMTP Settings.
- You stay signed in; you only need a new code if you sign out or don't open Jarvis for a long time.
- **Erase everything** on one device signs that device out of sync and does *not* erase the online copy.
- **Restore a day:** Settings → Sync & online backup → **Online backups** → pick a day.
- The Gemini (Google AI) key is never uploaded. Each device keeps its own voice choice.
- For a buyer: they make their own free project the same way and use their own two values. Each person who
  signs in gets their own private data.
