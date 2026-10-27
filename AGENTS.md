<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All event data lives in on-device IndexedDB (Dexie, `src/lib/db.ts`); validation never touches the network so the scanner works offline.
- The app is a single route `/` with in-page tabs, so the offline service worker only has to cache one page.
- Service worker registers only via `src/lib/pwa.ts` (guarded: never in dev/preview) using vite-plugin-pwa generateSW.
- Institutional images use Lovable Assets pointers shared by the interface and ticket renderer, with production service-worker caching so previously loaded branding remains available offline.
