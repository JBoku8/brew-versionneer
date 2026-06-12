# Brew Versionneer — Project Knowledge Base

## What this is

A **Tauri 2 + React 19 + TypeScript** macOS desktop app that lets you browse, search, compare,
and **upgrade** locally-installed vs. latest Homebrew packages. Packages load fast (< 500 ms),
outdated ones are highlighted, remote catalogs are cached to disk, a menu-bar tray shows the
outdated count, and an AI assistant (OpenAI-compatible, streaming) can answer questions about
any package or the whole setup.

---

## Tech stack

| Layer         | Tech                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Desktop shell | Tauri 2 (Rust), `tray-icon` feature enabled                                 |
| Frontend      | React 19 + TypeScript + Vite 7                                              |
| Styling       | Plain CSS with **theme variables** (`App.css` tokens) + ThemeContext        |
| IPC           | `@tauri-apps/api` `invoke()` + `Channel` for streamed upgrade output        |
| Remote data   | `reqwest` → `formulae.brew.sh` API (shared client, 30 s timeout)            |
| Keychain      | `keyring` crate (`features = ["apple-native"]`)                             |

---

## Module map

```
src-tauri/src/
  brew.rs        — Homebrew CLI calls (detect_brew, list --versions, outdated, info,
                   upgrade_packages w/ line streaming, export_brewfile)
  remote.rs      — Fetch + disk-cache for catalogs; CATALOG_FIELDS slim projection;
                   shared reqwest client; stale-cache fallback; formula/cask detail fetch
  config.rs      — AppConfig struct; read/write config.json; keychain_read/write/delete
  commands.rs    — Tauri #[tauri::command] wrappers; brew commands are async + spawn_blocking
  lib.rs         — Registers all commands in invoke_handler![]; tray setup (id "main")

src/
  api/tauri.ts         — IPC wrappers + shared types + PackageRecord helper functions
  api/config.ts        — Config IPC wrappers + KEYCHAIN_SERVICE / KEYCHAIN_ACCOUNT constants
  api/llm.ts           — Streaming OpenAI-compatible client (chatCompletion + readSseStream);
                         askAboutPackage (per-package), askAboutSetup (whole installation)
  lib/                 — Pure helpers: package.ts (annotate/filter/deprecation), brew.ts,
                         llm.ts (URL building + test connection), config.ts, errors.ts,
                         storage.ts, theme.ts, platform.ts
  hooks/useBrew.ts     — {status, checking, error, refresh}; detectBrew (fast) then getBrewVersion
  hooks/useAppConfig.ts — Loads llmConfig + apiKey from config file + Keychain on mount
  hooks/usePanelResize.ts — Drag-resize for list/detail split
  contexts/ThemeContext.tsx — light/dark/system theme preference
  models/ui.ts         — AppView ("packages"|"assistant"|"settings"), shared prop interfaces
  constants/           — tabs, settings presets, layout, storage keys, brew constants
  components/
    layout/AppShell.tsx   — Root shell: owns activeView, activeTab, refreshToken, sidebar state,
                            llmConfig/apiKey; keeps AppLayout MOUNTED while Settings is open
    layout/Sidebar.tsx    — Collapsible nav + AI Assistant view + "Refresh data" button
    layout/AppLayout.tsx  — Owns installed/outdated data, upgrade state (UpgradePanel),
                            tray-count sync; keeps PackageList AND SetupAssistant mounted
    packages/PackageList.tsx    — List, search (useDeferredValue), pagination, badges,
                                  Upgrade all / Export Brewfile buttons
    packages/PackageDetail.tsx  — Detail panel + Upgrade button + deprecation warning + AISection
    packages/AISection.tsx      — Per-package streaming chat + quick-prompt chips
    packages/SetupAssistant.tsx — Whole-setup AI chat (installed+outdated sent as context)
    packages/UpgradePanel.tsx   — Bottom panel with live `brew upgrade` output
    settings/SettingsView.tsx   — Theme picker, LLM config (endpoint/model/key), cache TTL
    brew/SplashScreen.tsx, brew/InstallBrew.tsx
```

---

## IPC command registry

Every Rust function in `commands.rs` must be registered in `lib.rs` `invoke_handler![]`.
All brew subprocess commands are **async** and run via `spawn_blocking` (the `blocking()` helper)
so they never block the main thread.

| Tauri command                 | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| `check_brew` / `detect_brew`  | Brew detection (combined / fast filesystem-only ~1ms)              |
| `get_brew_version`            | Runs `brew --version`; called after detect                         |
| `get_installed_versions`      | `{name: version}` map, ~100ms (fast path)                          |
| `get_outdated_formulae`       | `brew outdated --json=v2`, ~300ms                                  |
| `get_installed_formulae`      | Full `brew info --json=v2 --installed` (slow fallback, ~3-10s)     |
| `get_installed_formula_names` | Plain name list                                                    |
| `upgrade_packages`            | `brew upgrade <names…>`; streams output lines via `Channel<String>`|
| `export_brewfile`             | `brew bundle dump --file=-` → Brewfile contents                    |
| `update_tray_count`           | Sets tray title "↑N" + tooltip from outdated count                 |
| `fetch_formulae_catalog`      | All formulae; disk cache, TTL from config; slimmed projection      |
| `fetch_casks_catalog`         | All casks; same caching/projection                                 |
| `fetch_formula_detail`        | Single formula detail (full record, on-demand)                     |
| `fetch_cask_detail`           | Single cask detail (full record, on-demand)                        |
| `read_config` / `write_config`| config.json in Application Support (API key excluded)              |
| `read/write/delete_keychain`  | macOS Keychain secret access                                       |

---

## Data flow

### Shell state (AppShell)

```
AppShell owns: activeTab, activeView ("packages"|"assistant"|"settings"),
               sidebarCollapsed (localStorage), refreshToken, llmConfig, apiKey
- AppLayout stays MOUNTED while Settings is open (.view-host / .view-hidden wrappers)
  → no refetch on Settings round-trips
- refreshToken++ on sidebar "Refresh data" → AppLayout reloads installed+outdated,
  PackageList clears module caches and force-refetches catalogs
- Switches activeTab "formulae" → "installed" once brewInstalled && !brewPending
```

### Installed tab (fast path)

```
AppLayout mounts
  → loadVersions() + loadOutdated() fire in parallel (separate try/catch each)
      loadVersions: getInstalledVersions() ~100ms  OR fallback: getInstalledFormulae() ~3-10s
      loadOutdated: getOutdatedFormulae() ~300ms
  → installedReady=true via loadGeneration guard
  → tray count synced from outdatedResult.formulae.length

PackageList (installed tab): builds rows synchronously from props — no IPC.
```

### Formulae / Casks tabs (cached path)

```
Tab switch → module-level catalogCache hit → instant render (survives remounts)
          → miss → fetch command → Rust disk cache (TTL from Settings) or HTTP
Rust slims each entry to CATALOG_FIELDS before caching/IPC (~90% smaller payload).
Annotations (isInstalled/isOutdated/…) injected via useMemo from installed props.
```

### Upgrade flow

```
"Upgrade" (detail) or "Upgrade all (N)" (toolbar) → AppLayout.startUpgrade(names)
  → upgradePackages IPC with Channel; lines stream into UpgradePanel (bottom log)
  → on settle (success OR failure): loadInstalledData() refreshes installed/outdated/tray
One upgrade at a time; buttons disabled while running.
```

---

## Key patterns

### Generation refs (race-condition guard)

```typescript
const gen = ++generationRef.current;
// after await:
if (gen !== generationRef.current) return;
```

Used in: AppLayout `loadGeneration` (installed loads), PackageList `selectGeneration`
(detail fetch), AISection `askGeneration` (package switch mid-stream).

### Module-level caches (survive remounts)

`catalogCache` (per-tab catalog arrays) and `detailCache` (keyed `formula:`/`cask:` + name)
live at module scope in PackageList.tsx. Cleared by "Refresh data" / "Refresh catalog".

### Keep views mounted, hide with CSS

`.view-host { display: contents }` / `.view-hidden { display: none }` (AppShell.css).
Used for AppLayout (during Settings) and PackageList/SetupAssistant switching —
state and caches survive navigation. Never unmount these to "switch views".

### Streaming LLM client

`api/llm.ts` `chatCompletion()` sends `stream: true`, parses SSE via `readSseStream`,
falls back to plain JSON if the server ignores streaming (checks content-type).
Context goes in the **system message once**, not per turn. `onDelta` receives
accumulated text for live rendering.

### brewPending pattern

`brewChecking && brewStatus === null` — true only during initial detection.
Gates brew-dependent UI (Installed sidebar item).

### Two-phase loading + annotation via useMemo

AppLayout owns installed/outdated state; PackageList receives them as props.
Raw catalogs stay cached; annotations re-derive in `useMemo` on prop change.

### height: 100% vs 100vh in nested flex

Components inside a `flex: 1` parent must use `height: 100%` (not `100vh`) or they overflow.

---

## PackageRecord shape

`PackageRecord = Record<string, unknown>` — intentionally loose.
Catalog list entries are **slimmed in Rust** to `CATALOG_FIELDS` (remote.rs):
name, token, full_name, tap, desc, description, homepage, version, versions,
license, deprecated, deprecation_reason, disabled, disable_reason, caveats.
Detail fetches return full records.

Helpers in `src/api/tauri.ts`: `packageName`, `packageDescription`, `packageHomepage`,
`packageVersion` (versions.stable → top-level version (casks) → installed[0].version →
installedVersion). Deprecation: `getDeprecationInfo()` in `src/lib/package.ts`.

---

## Config + credential storage

**Non-sensitive config**: `~/Library/Application Support/com.versionneer.brew/config.json`

```json
{ "llm": { "endpoint": "...", "model": "..." }, "cache": { "ttl_hours": 24 } }
```

`ttl_hours` IS wired into the Rust catalog cache (read per fetch in commands.rs).

**API key** — macOS Keychain only, never on disk:
Service `com.versionneer.brew` · Account `llm-api-key`
(constants in `src/api/config.ts`).

---

## How to add a new Tauri command

1. **`src-tauri/src/brew.rs`** (or `remote.rs` / `config.rs`) — implement the Rust function
2. **`src-tauri/src/commands.rs`** — add the `#[tauri::command]` wrapper
   - brew subprocess work → `pub async fn` + the `blocking()` helper
   - needs app paths → take `app: AppHandle` and use `app_data_dir`/`app_cache_dir`
   - streamed output → add an `on_output: Channel<String>` parameter
3. **`src-tauri/src/lib.rs`** — add `commands::my_command` to `invoke_handler![]`
4. **`src/api/tauri.ts`** (or `config.ts`) — add the typed `invoke()` wrapper
5. Rebuild: `cd src-tauri && cargo build` then re-run `npm run tauri dev`

---

## Dev commands

```bash
npm run tauri dev        # full dev mode (hot reload + Rust auto-recompile)
npx tsc --noEmit         # type-check TypeScript (fast — run after every edit)
cd src-tauri && cargo build   # Rust compile check
npm run tauri build      # production build
```

---

## Disk cache location

Catalogs: `~/Library/Caches/com.versionneer.brew/brew-catalog/{formula,cask}.json`
TTL: configurable in Settings (default 24 h). Stored **slimmed**; pre-projection caches
are slimmed on read. If a network fetch fails and any cache file exists, the stale
cache is served instead of an error.

---

## Gotchas

- **Brew path**: Apple Silicon `/opt/homebrew/bin/brew`, Intel `/usr/local/bin/brew`.
  `brew.rs::resolve_brew_path()` checks candidates and caches successful lookups in a
  `OnceLock` (only Some is cached so "check again" after installing brew still works).
- **CATALOG_FIELDS projection**: if the UI starts reading a new catalog field, it MUST be
  added to `CATALOG_FIELDS` in `remote.rs` or it will be stripped before reaching JS.
- **Register commands**: a command missing from `lib.rs` `invoke_handler![]` fails silently
  at runtime.
- **Tray**: requires `tauri = { features = ["tray-icon"] }`; tray id is `"main"`, window
  label is `"main"`. Count updates come from the frontend via `update_tray_count`.
- **Theme variables**: colors use CSS variables defined in `App.css` (light + dark blocks)
  driven by ThemeContext. Do NOT hardcode hex in new component CSS — use the tokens
  (`--warning`, `--accent`, `--bg-badge-*`, `--border`, …).
- **Session summaries can drift**: always re-read key files before editing.
- **CSS class collision**: `.app-shell` is taken; the "no brew" wrapper uses `.no-brew-shell`.
- **height: 100% not 100vh** inside `flex: 1` containers.
- **keyring crate**: needs `features = ["apple-native"]` for macOS Keychain.
- **Separate try/catch** for loadVersions / loadOutdated — one failure must not block the other.
- **Badge "undefined"**: guard `typeof pkg.installedVersion === "string"` before rendering.
- **Casks**: detail fetch exists (`fetch_cask_detail`); cask version is top-level `version`
  (handled by `packageVersion`). Installed/outdated annotations cover formulae only —
  `brew list --versions --formula` is the only installed source today.
- **HOMEBREW env**: `run_brew` sets `HOMEBREW_NO_AUTO_UPDATE=1` / `HOMEBREW_NO_ANALYTICS=1`
  so read-only queries never trigger slow side effects.
