# Measurement date and server application verification

30 October 2026. Owner requested verification of all server measurements/photos and visible
measurement dates. The date is read from original `created_at`, displayed in Europe/Moscow,
and shown in the main list, preview, editor header, manufacturing list and manufacturing card.
Unknown or invalid creation dates display “Не указана”; `updated_at` is never substituted.
This represents record creation time; the existing schema has no separate field-visit date.

The existing homelab public frontend targets `https://zamery.tekstura.shop`; its nginx proxies
Auth, REST and Storage to `tekstura-zamery-production-gateway`. An existing active measurer's
normal authenticated RLS access returns all 45 measurements: 28 active and 17 soft-deleted,
with client relationships. A short-lived signed user token was used for these read-only checks;
no Auth user, persistent session or grant was created or changed.

All 65 photo rows were checked through this same nginx/API: signing and downloading succeeded
for 64 objects. Their downloaded SHA-256 values matched on Mac, and all 64 decoded successfully.
The sole failure is the previously missing source object for KZN-ZM-2026-148841:
`KZN-ZM-2026-148841_053c2bc7-8775-4cb8-a248-b866684c33c9/1792836023893_1_manual_sketch.jpg`.
The row remains preserved. No database data was changed in this task.

Browser verification through a loopback-only read-only proxy and SSH connection showed 28 work
cards and 17 trash cards. The main preview displayed the original 28.10.2026, 14:35 MSK date and
four decoded photos for KZN-ZM-2026-912576. The manufacturing list/card displayed the same date.
This proxy changes the API origin only within temporary test responses, seeds the expiring user
session, disables its local service worker, and rejects data-changing requests. It first checked
the release candidate, then fetched the already-deployed frontend from the actual server.
Public-domain TLS with the current VPN still times out. VPN/routing was not changed.

Deployment applied only the date-related changes to the exact running server versions of
`app.js`, `production.js`, `index.html` and `production.html`. The server's existing endpoint,
anon key and other settings were preserved. Existing file hashes were checked before replacement;
new hashes were checked afterward. Four originals are retained under
`/home/vladimir/zamery-ui-date-20261030/before-deploy`. No container restart was needed.
The runtime lacks service-worker.js, so this task did not install one or change offline support.
The repository's existing PWA source updates script URLs/cache version and its diagnostics together.

Validation: all 69 existing Node tests PASS (SVG variants, photo ownership/paths, synchronization,
deletion and PWA); syntax checks PASS; Moscow date/year boundary and unknown-date checks PASS;
API/RLS counts and links PASS; 64 downloaded image hashes and decodes PASS; diff whitespace PASS.
Private reports/screenshots/manifests are outside Git under the Mac output directory
`/Users/vladimir/Documents/Codex/outputs/zamery-ui-date-20261030` and the corresponding homelab
operation directory. No credentials, customer payload or private screenshot is committed.
