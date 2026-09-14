# Release runbook

A safe production rollout for the schema, API, synchronization, and clients — backend (SQLite + sync to Postgres), the admin web app, the mobile member app, and its cloud API.

This runbook assumes you're deploying the state of `develop` (or a release branch cut from it) that has already merged issues #40–#52. It doesn't cover initial/first-time setup of a brand-new environment — see `backend/README.md` and `mobile/cloud-api/README.md` for that.

## Before you start

- [ ] You have a maintenance window, or the confidence that this deploy is backward-compatible enough not to need one (check the migration files under `backend/src/db/migrations/` for anything destructive — the schema here has been additive-only so far).
- [ ] You have `DATABASE_URL` for the target Supabase/Postgres instance and can reach it from where you'll run the migration.
- [ ] You have the current `local.db` (or wherever `LOCAL_DB_PATH` points in production) accessible for backup.
- [ ] `backend/.env` and `mobile/cloud-api/.env` are filled in on the target host(s) — see `backend/.env.example` and `mobile/cloud-api/.env.example`.

## Release order

### 1. Back up both databases

```bash
cd backend
npm run db:backup                 # writes backend/backups/local-<timestamp>.db
```

For Postgres, take a Supabase point-in-time snapshot (or `pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).sql` if you're not on Supabase). Store both somewhere outside the deploy host.

### 2. Run the #40 dry-run report

```bash
npm run migrate:local -- --dry-run   # (add --dry-run support if not already wired — see note below)
npm run migrate:remote -- --dry-run
```

> `migrate-local.js`/`migrate-remote.js` already implement `--dry-run`: on a **fresh** database they short-circuit straight to a clean install (nothing to report), but on an **existing** database with legacy pre-role/pre-workflow data, `--dry-run` prints administrators missing a role mapping, legacy `pending` loans, duplicate live borrower/guarantor loans, and orphaned loan/transaction references, then exits non-zero if anything blocks the migration. If your target database was created after #40 landed, this step will simply report "no new migrations" — that's expected, not a skip.

Also run the broader release-health checks (not migration-specific, covers the tables added since #40):

```bash
npm run db:verify              # local.db: orphaned FKs, duplicate live loans, invalid roles,
                                # loans missing a schedule, duplicate installment/penalty keys,
                                # invalid notification types, sync backlog
npm run db:compare-schemas     # static diff of migrations/sqlite vs migrations/postgres
```

`db:compare-schemas` currently reports two known, pre-existing gaps — `dividend_history` and `member_exits` are missing a `created_at` column on the SQLite side that Postgres has. Neither blocks a release (both tables already have `updated_at`/`date_calculated`/`exit_date` to sort and audit by), but it should be fixed in a future migration rather than carried forward indefinitely.

### 3. Review administrator role assignments and legacy pending-loan mappings

If the dry-run reported unmapped administrators or legacy loans, supply the mapping via env vars before re-running (see `migrate-local.js`'s `ADMIN_ROLE_MAP` / `LEGACY_LOAN_STAGE_MAP` handling):

```bash
ADMIN_ROLE_MAP='{"<admin-id>":"cashier"}' \
LEGACY_LOAN_STAGE_MAP='{"<loan-id>":"awaiting_recommendation"}' \
npm run migrate:local -- --dry-run
```

Re-run until the dry-run reports zero blocking issues.

### 4. Apply database migrations to both databases

```bash
npm run migrate:local     # SQLite — safe to re-run, tracks applied files in schema_migrations
npm run migrate:remote    # Postgres — same tracking, same ADMIN_ROLE_MAP/LEGACY_LOAN_STAGE_MAP env vars if needed
```

Both scripts run the pending migration(s) inside a transaction per file — a failure rolls back that file's changes, it does not leave the schema half-applied.

### 5. Update seed administrator data

If this is a new environment, or a new administrator needs to exist before anyone can sign in:

```bash
npm run seed:admin -- "Full Name" username temporary-password
```

`seed:admin` is idempotent for the one designated seed administrator id — re-running it after the account already exists is a no-op, not an error.

### 6. Deploy backend and sync changes

Deploy `backend/` (the admin API) and `mobile/cloud-api/` (the member API) to their hosts. Both read `DATABASE_URL`/`JWT_SECRET`/`MEMBER_JWT_SECRET` from the environment — confirm those are set on the target host before starting the process, not just locally.

### 7. Verify push/pull health and unresolved sync failures

```bash
curl -H "Authorization: Bearer <admin token>" https://<backend-host>/api/sync/status
```

Confirm `ok: true` and that `pending_rows` is either 0 or explainable (e.g. rows created during this deploy window). If it isn't, trigger a sync and re-check:

```bash
curl -X POST -H "Authorization: Bearer <admin token>" https://<backend-host>/api/sync
```

Read the response's `details[].failed` array for any table — a non-empty array means specific rows are failing to push and need investigation before you consider sync "healthy," even if `ok: true` for everything else.

### 8. Deploy web and mobile clients

Deploy `admin/admin-web/` (the admin React app) and publish the `mobile/frontend/` Expo build. Confirm `VITE_API_URL` (web) and `EXPO_PUBLIC_API_URL` (mobile) point at the newly-deployed backend/cloud-api hosts, not a stale environment.

### 9. Run smoke tests

Minimum smoke-test pass before calling the release done — do this against the real deployed environment, not localhost:

- [ ] **Login** — admin web, as at least two different roles; mobile app, as a member.
- [ ] **Role access** — a non-chair role cannot create an administrator (403); a non-cashier role cannot disburse or record a payment (403); each role's nav/action visibility matches `frontend/src/lib/loan-workflow.js`.
- [ ] **Loan creation** — submit a regular (guarantor) and a self-secured application from the admin web; submit one from the mobile app.
- [ ] **Guarantor response** — approve one request and decline another, from the mobile app; confirm the borrower's admin-web loan detail page and the guarantor's own loan list both reflect it.
- [ ] **Workflow actions** — recommend → committee-approve a loan through to `approved`; separately, decline-recommendation and committee-reject each reach their terminal status.
- [ ] **Disbursement** — disburse an approved loan; confirm exactly one installment schedule is created (not duplicated) and its total principal equals the loan's principal.
- [ ] **Schedule generation** — confirm the schedule is visible on both admin web (loan detail) and mobile (loan detail) with matching figures.
- [ ] **Payment** — record a payment that spans multiple buckets (an overdue loan with a collection expense, if you have test data for it); confirm the allocation breakdown and the loan's `outstanding_balance` agree between admin web and mobile.
- [ ] Attempt an overpayment — confirm it's rejected with 409 and nothing was written (check `loan_payments` count before/after).

### 10. Record rollback steps and known token-expiry behavior

See below — fill in the actual smoke-test results and any deferred items in your release notes before closing out the release.

## Rollback

There is no automated rollback script — the migrations here are additive (new tables/columns), so the practical rollback path is:

1. **Stop writes.** Take the backend and mobile cloud-api offline (or put them in maintenance mode) so nothing writes to either database during rollback.
2. **Restore from the step-1 backup.** For SQLite, replace `local.db` with the backed-up file. For Postgres, restore the snapshot/dump taken in step 1.
3. **Redeploy the previous release's backend/cloud-api/web/mobile builds.**
4. **Re-run `db:verify`** against the restored SQLite database to confirm it's in the expected pre-release state before bringing traffic back.

Because migrations are additive, restoring the *data* backup is normally sufficient — you don't need to also "un-migrate" the schema; the previous release's code simply won't reference the newer tables/columns.

## Known token-expiry behavior

Both admin and member JWTs expire (`backend/src/routes/auth.js`: 1 hour for admins; check `mobile/cloud-api/src/routes/auth.js` for the member token lifetime). There is no refresh-token flow — an expired token requires a fresh login. This is expected, not a bug: don't spend a smoke-test cycle chasing a 401 that's just a token that outlived the test session. If a smoke test spans more than the token lifetime, log in again partway through rather than assuming something broke.

## Verification checks reference

| Check | How |
|---|---|
| Orphaned foreign keys | `npm run db:verify` (backend) — also runs `PRAGMA foreign_key_check` directly |
| Duplicate borrower/guarantor live loans | `npm run db:verify`, or `migrate-local.js --dry-run`'s legacy report |
| Administrators without a valid role | `npm run db:verify`, or `migrate-local.js --dry-run`'s legacy report |
| Legacy pending loans still unmapped | `npm run db:verify`, or `migrate-local.js --dry-run`'s legacy report |
| Loans missing a schedule after disbursement | `npm run db:verify` |
| Duplicate installment/penalty/payment keys | `npm run db:verify` |
| Unsynced rows and failed sync batches | `npm run db:verify` (local backlog by table) + `GET /api/sync/status` (remote health + per-table failures) |
| Invalid notification types | `npm run db:verify` |
| Inconsistent SQLite/Postgres schema definitions | `npm run db:compare-schemas` |

## Deferred / known work

- `dividend_history` and `member_exits` are missing a `created_at` column on SQLite that Postgres already has (found by `db:compare-schemas` while writing this runbook). Non-blocking; worth a small follow-up migration.
- The payment endpoint (`POST /api/loans/:id/payments`, #49) has no server-side idempotency key — two distinct rapid requests with identical amount/date aren't deduplicated server-side, only via the UI disabling its button while a request is in flight. See the #48–#51 PR description for detail.
- `PushToRemote.js`/`PullFromRemote.js` have no automated integration test coverage — both hard-import the Postgres pool rather than accepting one as a parameter. `npm run db:verify`'s sync-backlog check and `GET /api/sync/status` are the manual substitute until that's addressed.
- Links: #40, #41, #42, #43, #44, #45, #46, #47, #48, #49, #50, #51, #52.
