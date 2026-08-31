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

This creates `local.db` in the project root and runs `master.sql` from
`src/db/migrations/sqlite/`. It tracks the applied schema in a
`schema_migrations` table, so re-running it is safe. Since this project uses
a consolidated schema for development, recreate `local.db` after schema
changes before running the seed scripts again.

## Apply the remote Postgres schema

For now, run `src/db/migrations/postgres/master.sql` directly against your
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

Tokens expire after 1 hour — log in again once one expires.

## Try the members endpoint

```bash
curl http://localhost:4000/api/members

curl -X POST http://localhost:4000/api/members \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Member","gender":"male","phone_number":"0911000000"}'

# Set or reset a member password (requires the admin bearer token)
curl -X PATCH http://localhost:4000/api/members/MEMBER_ID/password \
  -H "Authorization: Bearer PASTE_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"new_password":"memberpass123"}'
```

Member passwords are stored as bcrypt hashes. Seeded members with a `NULL`
`password_hash` cannot sign in until an administrator sets a password through
the password endpoint above. The endpoint returns the updated member profile,
but never returns the password or its hash.

## Frontend integration endpoints

All endpoints below require the bearer token returned by login.

- `PATCH /api/auth/password` — change the current admin password with
  `{ "current_password": "...", "new_password": "..." }`.
- `GET /api/transactions?type=loan_installment&date_from=2026-01-01&date_to=2026-01-31` —
  filter transactions by type and/or inclusive date range. `member_id`, `loan_id`,
  `limit`, and `offset` can be combined with these filters.
- `GET /api/member-exits/preview/:memberId?exit_date=2026-01-31` — calculate a
  member's exit payout without writing an exit record, transaction, or member status change.
- `POST /api/notifications/broadcast/preview` — validate a broadcast and return
  the active recipient count without creating notifications. Send the same
  `{ "title": "...", "message": "...", "type": "meeting" }` body to
  `POST /api/notifications/broadcast` after confirmation.

The existing routes also cover members, administrators, loans, expenses,
dividends, notifications, and sync operations. Local SQLite migrations are
applied with `npm run migrate:local`; remote Postgres migrations must be
applied to the remote database separately.
