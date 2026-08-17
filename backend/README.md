# SACCOS Backend

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` — set `DATABASE_URL` to your Supabase Postgres connection string once you have it.

## Apply the local SQLite schema

```bash
npm run migrate:local
```

This creates `local.db` in the project root and runs everything in
`src/db/migrations/sqlite/` (currently just `001_init.sql`, your full schema).
It tracks what's been applied in a `schema_migrations` table, so re-running
it later is safe — it only applies new migration files.

## Apply the remote Postgres schema

For now, run `src/db/migrations/postgres/001_init.sql` directly against your
Supabase project via the SQL editor (Supabase dashboard → SQL Editor → paste
and run). A scripted runner for this can be added later if you outgrow the
web editor.

## Run the dev server

```bash
npm run dev
```

Server starts on `http://localhost:4000`. Check `GET /health` to confirm it's up.

## Create your first admin + log in

```bash
npm run seed:admin -- "Your Name" admin somepassword123
```

Then log in to get a token:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"somepassword123"}'
```

Copy the `token` from the response and use it on any protected route:

```bash
curl http://localhost:4000/api/administrators \
  -H "Authorization: Bearer PASTE_TOKEN_HERE"
```

Tokens expire after 12 hours — log in again once one expires.

## Try the members endpoint

```bash
curl http://localhost:4000/api/members

curl -X POST http://localhost:4000/api/members \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Member","gender":"male","phone_number":"0911000000"}'
```

## Next up

- `transactions` router (savings deposits, share purchases, loan installments) — protect with `requireAuth`, use `req.admin.id` for `recorded_by`
- `loans` router (application, approval, disbursement)
- sync worker (`WHERE synced_at IS NULL` → push to remote)
