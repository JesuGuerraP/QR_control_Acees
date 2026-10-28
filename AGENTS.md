## Architecture rules
- Supabase is the shared source of truth; each device keeps a Dexie copy (`src/lib/db.ts`) synced by `src/lib/sync.ts`, so scanning still works offline and queues ingresos in an outbox.
- Cloud tables have no public policies; all access goes through PIN-checked server functions in `src/lib/sync.functions.ts` because the app has no user accounts.
- The app is a single route `/` with in-page tabs, so the offline service worker only has to cache one page.
- Service worker registers only via `src/lib/pwa.ts` (guarded: never in dev/preview) using vite-plugin-pwa generateSW.
- Institutional images live in `src/assets` and are imported directly by the interface and ticket renderer, with production service-worker caching so previously loaded branding remains available offline.
- Database schema lives in `supabase/schema.sql`.
