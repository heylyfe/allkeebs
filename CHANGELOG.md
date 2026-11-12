# Changelog

## 1.0.2 — 2026-11-12

Groundwork for a desktop app. The website works exactly as before; nothing to migrate.

- All USB access now goes through one HID transport (`src/hid/transport.js`): checking support,
  the device picker, already-allowed devices, and plug/unplug events. The website's transport is
  WebHID (`src/hid/webhid.js`) and hands the browser's own devices to the drivers, untouched.
- `createHidHandle()` (`src/hid/adapter.js`) turns a plain byte backend (connect, send,
  sendFeature, receiveFeature, disconnect) into a device the drivers accept. The desktop app will
  use it for its Rust HID bridge, since desktop webviews have no WebHID.
- The simulated VIA keyboard test now runs twice, directly and through the adapter, and checks
  that both runs give the same results and send exactly the same reports.

## 1.0.1 — 2026-11-12

Housekeeping: dependency updates and a fresh keyboard database. Nothing changes in how allkeebs
works, and saved profiles and settings load as before. No migration is needed.

### Dependencies

- esbuild 0.24 → 0.28 and Prettier 3.6 → 3.10. No code changes needed.
- Lucide 0.468 → 1.72. Lucide 1.x exports each icon as its list of child elements instead of a
  full `svg` node, which would have left every icon blank. The icon helper now reads both shapes
  and throws if an icon is missing, and a new regression test checks that every UI icon draws
  something.
- Lucide 1.0 removed brand logos, so the "Source on GitHub" link on the About page now uses a
  generic code icon.
- @openmouse/keyboard-protocol stays at 1.6.1, its latest release. Its changelog from 1.0.0 to
  1.6.1 has no breaking changes.
- `THIRD_PARTY_NOTICES.md` carries Lucide 1.x's new licence text, including the MIT notice for
  its Feather-derived icons.

### Keyboard database

- Rebuilt `src/kbdb.json.gz` from current VIA, Vial, QMK, makers' QMK forks, OpenRGB, OpenRazer,
  ckb-next, the Linux kernel and the USB id list: 3,654 boards with layouts (was 3,652), 1,024
  boards known by USB id only and 348 model names. Every USB id from the previous database is
  still present.
- `tools/github-via-sources.txt` is now written by `npm run build:db` and lists only the GitHub
  VIA files that actually end up in the database (184), instead of every file the harvest
  downloaded.

### Tools

- `npm run build:db` works on Windows. `tools/build-db.mjs` matched file paths against `/`, so on
  Windows it silently skipped every QMK tree and built a database missing about 950 boards.
- `tools/harvest-github.sh` accepts `BRANDS="…"` to rerun only some searches, for example after
  GitHub rate-limits or times out a query.
