# Tokuma Misomaf SACCO member app

Expo Router member app for viewing savings, shares, loans, dividends, transactions and cooperative notifications.

## Design direction

Trust-first cooperative banking UI: deep forest green as the single accent, mint surfaces for positive context, cool green-grey neutrals, compact labels, and soft 18px cards. The home screen separates balance, shortcuts, loan context, activity, and dividend context into distinct visual groups. Frequent navigation is immediate; press feedback is the only motion used everywhere. Occasional loan and notification state changes can receive short, purpose-driven transitions.

## Backend alignment notes

- Set EXPO_PUBLIC_API_URL to the reachable cloud API host before testing on a physical device. Localhost refers to the device itself. For a local API, use your computer's LAN IP (for example, `http://192.168.1.20:4001`) and make sure the phone and computer are on the same network.
- The local mobile API must be running on port 4001 and must point its `DATABASE_URL` at the same Supabase/Postgres database that the admin backend synchronizes to.
- The current summary endpoint can return an empty response when a member has no transactions. The client intentionally treats this as zero balances.
- The current API has no guarantor search/list endpoint. The initial loan form accepts a guarantor member ID and surfaces the server's validation error; a member picker should be added when that endpoint exists.
- The API's transaction route supports limit and offset; the first history slice loads 30 records. Infinite load more can be added without changing the screen contract.

## Commands

- npm install
- npm run typecheck
- npm start
