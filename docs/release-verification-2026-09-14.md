# Release verification — 2026-09-14

This records the verification performed for the `develop` release candidate
after issues 40–53.

## Automated checks

- Backend: `npm test` — all tests passed, including migrations, authorization,
  workflow, penalties, payment waterfall, idempotent payment retry, and sync
  contract checks.
- Web: `npm test -- --run` — all frontend tests passed.
- Mobile: `npx expo export --platform android` — Android bundle exported
  successfully.
- Database: SQLite clean-install and upgrade migration tests passed.

## Final role mapping

The seven administrator roles are:

- `chairperson`
- `vice_chairperson`
- `loan_committee`
- `cashier`
- `accountant`
- `general_manager`
- `control_audit_committee`

The seeded legacy administrator is mapped to `general_manager`; any other
legacy administrator must be supplied through `ADMIN_ROLE_MAP` before upgrade.

## Final loan status mapping

The nine statuses are:

`awaiting_guarantor`, `guarantor_declined`, `awaiting_recommendation`,
`recommendation_declined`, `awaiting_committee_approval`, `rejected`,
`approved`, `active`, and `closed`.

Legacy `pending` rows must be resolved by the migration dry-run mapping before
the upgrade proceeds.

## Deferred operational checks

- Run the release backup, dry-run, schema comparison, sync health, and smoke
  checks against the actual deployment databases during release.
- Run the optional live PostgreSQL compatibility suite with `TEST_DATABASE_URL`.
