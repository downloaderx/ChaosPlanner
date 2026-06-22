# The One Thing - Supabase version

This is the standalone React/Vite version of the original Claude artifact. It keeps the same idea:

- live thought overflow
- automatic set-aside column after 6 live thoughts
- one active “Right now” item
- completion log
- email/password login through Supabase
- persistent storage in the Supabase `items` table

## 1. Configure environment variables

Create a file named `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Use your Project URL and **publishable key** from Supabase.
Do not use the Secret key in this frontend app.

## 2. Install and run locally

```bash
npm install
npm run dev
```

Vite will show a local URL, usually `http://localhost:5173`.

## 3. Supabase table shape

The app expects this table:

| column name | type |
|---|---|
| id | uuid, default `gen_random_uuid()` |
| user_id | uuid |
| column | text |
| text | text |
| started_at | timestamptz, default `now()` |
| finished_at | timestamptz, nullable |

Allowed `column` values used by the app:

- `thoughts`
- `setaside`
- `focus`
- `log`

The SQL file is in `database/schema-and-policies.sql` if you need to recreate the table.

## 4. Email confirmation note

If sign-up says to check email, confirm the account from the email Supabase sends.
For early local testing, you can also disable email confirmation in Supabase Auth settings, then turn it back on later.

## 5. Deploying to Vercel later

When importing the project to Vercel, add the same environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

After deploy, add your Vercel URL in Supabase Auth URL settings if needed.
