# Changelog

## 1.2.0 — 2026-11-13

Desktop app extras. The website is unchanged; nothing to migrate.

- **Releases with a normal download link.** Pushing a version tag (`v1.2.0`) runs
  `.github/workflows/release.yml`, which builds the Windows installers and publishes them on
  GitHub Releases, with this changelog section as the notes. The README links to the latest
  release.
- **Code signing, ready for SignPath.** Once SignPath Foundation approves the project and its
  secrets are added, releases are signed automatically. `allkeebs.exe` is signed first, then the
  installers are built around it and signed too, so Smart App Control and SmartScreen can trust
  both. Until then, releases are unsigned and say so. Setup steps are in `.signpath/README.md`,
  and the README has the code signing policy SignPath asks for.
- **Start with Windows** (Preferences, desktop app only; off by default). allkeebs then starts
  in the tray without opening its window, so hotkey macros work right after you log in.

## 1.1.1 — 2026-11-13

- The blue ASCII texture in the top-right corner now only fills the empty space beside a page's
  heading and intro, and hides when there's no room, instead of running behind the text in
  narrower windows (such as the desktop app's default size).
- The desktop app no longer talks about "this browser tab", Chrome's device list or WebHID on the
  Keyboards, About and Preferences pages. The website's wording is unchanged.

## 1.1.0 — 2026-11-12

A desktop app for Windows. The website is unchanged; nothing to migrate.

- **Desktop app** (`src-tauri/`, Tauri 2): the same interface and drivers as the website. Desktop
  webviews have no WebHID, so USB goes through hidapi in Rust (`src-tauri/src/hid.rs`), reached
  over Tauri IPC by a new transport (`src/hid/tauri.js`). Device report layouts come from each
  device's HID descriptor (`src/hid/descriptor.js`), so drivers see what Chrome would show them.
- **Connecting** works like the browser: you pick keyboards once in a chooser, and allkeebs
  remembers them. Allowed keyboards reconnect on their own when plugged back in.
- **Hotkey macros**, desktop only: in the Macros tab, put a macro on a shortcut and it types the
  macro on this computer, even with the window closed. allkeebs then stays in the tray, where
  hotkeys can be paused. Off until you set a hotkey; nothing is sent to the keyboard.
- **CI** (`.github/workflows/ci.yml`): builds and tests the website and checks that
  `docs/index.html` matches the source; builds the Windows installers (NSIS and MSI) with
  `cargo fmt` and `clippy` checks.
- The installer includes `LICENSE`, `THIRD_PARTY_NOTICES.md` and the licence text of every Rust
  crate in the app (`tools/crate-notices.mjs`).
- The website's macro editor gained an extension point (`src/ui/extensions.js`) that it leaves
  empty, so it behaves exactly as before.

Fixes to 1.0.1 and 1.0.2:

- **Rainy 75 lighting is back.** The 1.0.1 database refresh picked a personal VIA file without
  lighting menus for the Rainy 75 (320F:5055), so its lighting settings disappeared. When several
  GitHub files describe the same board, the database build now keeps one with lighting menus, and
  a regression test checks the Rainy 75.
- **The site is built from LF line endings everywhere.** `.gitattributes` now checks text files out
  with LF on every OS. Pages built on Windows had carriage returns inside the bundle; they worked
  but didn't match the source, which CI now checks.

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
