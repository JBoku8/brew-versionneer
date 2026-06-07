# Brew Versionneer — Project Knowledge Base

## What this is

A **Tauri 2 + React 19 + TypeScript** macOS desktop app that lets you browse, search, and compare locally-installed vs. latest Homebrew packages. Packages are loaded fast (< 500 ms), outdated ones are highlighted, remote catalogs are cached to disk, and an AI assistant (OpenAI-compatible) can answer questions about any package.

---

## Tech stack

| Layer         | Tech                                                                  |
| ------------- | --------------------------------------------------------------------- |
| Desktop shell | Tauri 2 (Rust)                                                        |
| Frontend      | React 19 + TypeScript + Vite 7                                        |
| Styling       | Plain CSS (no framework, no CSS variables — hardcoded hex throughout) |
| IPC           | `@tauri-apps/api` `invoke()`                                          |
| Remote data   | `reqwest` → `formulae.brew.sh` API                                    |
| Keychain      | `keyring` crate (`features = ["apple-native"]`)                       |

---

## Module map

```
src-tauri/src/
  brew.rs        — All Homebrew CLI calls (detect_brew, list --versions, outdated, info)
  remote.rs      — Fetch + 24h disk-cache for formulae/casks catalogs from formulae.brew.sh
  config.rs      — AppConfig struct; read/write config.json; keychain_read/write/delete via keyring
  commands.rs    — Tauri #[tauri::command] wrappers (IPC surface)
  lib.rs         — Registers all commands in invoke_handler![]

src/
  api/tauri.ts         — TypeScript IPC wrappers + shared types + helper functions
  api/config.ts        — Config IPC wrappers (readConfig, writeConfig, keychain helpers)
                         + KEYCHAIN_SERVICE / KEYCHAIN_ACCOUNT constants
  api/llm.ts           — OpenAI-compatible fetch client; askAboutPackage() builds minimal package context
  hooks/useBrew.ts     — Returns {status, checking, error, refresh}
                         Calls detectBrew() (fast) then getBrewVersion() (slow) in sequence
  components/
    AppShell.tsx/.css  — Root shell: owns sidebarCollapsed (localStorage), activeView, activeTab,
                         llmConfig, apiKey; switches tab "formulae"→"installed" once brew confirmed
    Sidebar.tsx/.css   — Collapsible nav (200px expanded / 48px icon-only); brewPending tooltip handling
    AppLayout.tsx/.css — Data-fetching only (installedVersions, outdatedResult); receives activeTab as prop;
                         no header or nav rendered here
    PackageList.tsx/.css — Package list, search, pagination, badge annotations
    PackageDetail.tsx/.css — Right-panel detail view + AISection at bottom
    SettingsView.tsx/.css  — LLM config (endpoint/model/key) + cache TTL; "Test connection" via fetch
    AISection.tsx/.css     — Chat UI; 4 states: unconfigured/idle/loading/answered; resets on pkg change
    SplashScreen.tsx/.css  — Loading splash
    InstallBrew.tsx/.css   — Shown when Homebrew is missing
```

---

## IPC command registry

Every Rust function in `commands.rs` must be registered in `lib.rs` `invoke_handler![]`.

| Tauri command                 | Rust fn                             | Description                                                       |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `check_brew`                  | `brew::check_brew`                  | Detect brew path + version (combined, slower)                     |
| `detect_brew`                 | `brew::detect_brew`                 | Fast filesystem-only detection, ~1ms                              |
| `get_brew_version`            | `brew::brew_version`                | Runs `brew --version`; called after detect                        |
| `get_installed_versions`      | `brew::get_installed_versions_json` | `{name: version}` map, ~100ms                                     |
| `get_outdated_formulae`       | `brew::get_outdated_json`           | `brew outdated --json=v1`, ~300ms                                 |
| `get_installed_formulae`      | `brew::get_installed_formulae_json` | Full `brew info --json=v2 --installed` (slow fallback, ~3-10s)    |
| `get_installed_formula_names` | `brew::get_installed_formula_names` | Plain name list                                                   |
| `fetch_formulae_catalog`      | `remote::fetch_catalog(Formulae)`   | All formulae; 24h disk cache                                      |
| `fetch_casks_catalog`         | `remote::fetch_catalog(Casks)`      | All casks; 24h disk cache                                         |
| `fetch_formula_detail`        | `remote::fetch_formula_detail`      | Single formula detail (on-demand)                                 |
| `read_config`                 | `config::read_config`               | Read Application Support config.json; returns defaults if missing |
| `write_config`                | `config::write_config`              | Write config.json (API key excluded — use keychain)               |
| `read_keychain`               | `config::keychain_read`             | Read secret from macOS Keychain; returns null if absent           |
| `write_keychain`              | `config::keychain_write`            | Store secret in macOS Keychain                                    |
| `delete_keychain`             | `config::keychain_delete`           | Remove keychain entry (NoEntry is treated as success)             |

---

## Data flow

### Shell state (AppShell)

```
AppShell owns: activeTab, activeView ("packages"|"settings"), sidebarCollapsed, llmConfig, apiKey
- sidebarCollapsed persisted to localStorage
- Switches activeTab "formulae" → "installed" once brewInstalled && !brewPending
- Loads llmConfig + apiKey from config file + Keychain on mount
- Passes llmConfig + apiKey + onOpenSettings down to AppLayout → PackageList → PackageDetail
```

### Installed tab (fast path)

```
AppLayout mounts
  → loadVersions() + loadOutdated() fire in parallel (not allSettled; separate try/catch each)
      loadVersions: getInstalledVersions() ~100ms  OR fallback: getInstalledFormulae() ~3-10s
      loadOutdated: getOutdatedFormulae() ~300ms
  → setInstalledVersions({name: version, ...})
  → setOutdatedResult({formulae: [...OutdatedEntry], casks: [...]})
  → setInstalledReady(true) via loadGeneration guard

PackageList (installed tab):
  Builds PackageRecord[] synchronously from installedVersions + outdatedResult props
  → No IPC call; renders immediately
```

### Formulae / Casks tabs (cached path)

```
Tab switch
  → PackageList checks dataCache.current[activeTab]
      HIT  → setPackages(cached); instant render
      MISS → fetchFormulaeCatalog() / fetchCasksCatalog()
               → Rust: reads disk cache if < 24h old, else HTTP fetch
  → useMemo annotated: cross-references installedVersions + outdatedResult props
      isInstalled, installedVersion, isOutdated, latestVersion applied without touching raw cache
```

### Fallback (if fast commands unavailable)

```
getInstalledVersions() rejects → fall back to getInstalledFormulae()
  → parse PackageRecord[] → {name: version} map → same UI, just slower
```

---

## Key patterns

### brewPending pattern

`const brewPending = brewChecking && brewStatus === null` — true only during initial detection before
any result arrives. Use this (not just `brewChecking`) to gate UI elements that require brew presence.
The Installed sidebar item is disabled while `brewPending` is true.

### loadGeneration ref (race condition guard)

```typescript
const loadGeneration = useRef(0);
const generation = ++loadGeneration.current;
// later, before applying result:
if (generation !== loadGeneration.current) return;
```

Prevents stale async results from being applied when a newer load has started.

### Two-phase loading

- **AppLayout** owns all installed/outdated state. Fetches once on mount.
- **PackageList** receives `installedVersions`, `outdatedResult`, `installedReady` as props.
- Installed tab builds its list from props → no IPC, instant.
- Remote tabs get annotations injected via `useMemo` (no cache invalidation needed).

### In-memory catalog cache

`const dataCache = useRef<Partial<Record<TabId, PackageRecord[]>>>({})` in PackageList.
Populated on first successful remote fetch. Cleared only on "Refresh catalog" button.

### Annotation via useMemo

Raw catalog data cached in `dataCache.current`. Annotations (isInstalled, isOutdated etc.)
live in `useMemo(annotated)` which re-derives on every `installedVersions` prop change.
This means: install something → hit Refresh on installed tab → annotations update across
all tabs without re-fetching the catalog.

### height: 100% vs 100vh in nested flex

Components rendered inside a `flex: 1` parent must use `height: 100%` (not `height: 100vh`) in
their root CSS rule, otherwise they overflow the viewport. `AppLayout.css` uses `height: 100%`.

### Filtering "unknown" packages

`packageName(pkg)` returns `"unknown"` when a catalog entry has neither a `name` nor `token` field.
First guard in `filtered` useMemo: `if (packageName(pkg) === "unknown") return false`.

---

## PackageRecord shape

`PackageRecord = Record<string, unknown>` — intentionally loose to handle both catalog
entries (from brew API JSON) and synthetic installed entries.

Common fields:

- `name` / `token` — package identifier
- `desc` / `description` — one-line description
- `versions.stable` — latest stable version (formulae)
- `installed[0].version` — installed version from full brew info
- `installedVersion` — injected by annotation step or synthetic installed tab entry
- `latestVersion` — injected; equals `current_version` from outdated entry, or installedVersion
- `isInstalled: boolean` — injected by annotation
- `isOutdated: boolean` — injected by annotation

Helper functions in `src/api/tauri.ts`:

- `packageName(pkg)` — returns `name ?? token ?? "unknown"`
- `packageDescription(pkg)` — returns `desc ?? description ?? ""`
- `packageHomepage(pkg)` — returns `homepage` string or null
- `packageVersion(pkg)` — prefers `versions.stable`, falls back to installed[0].version, then `installedVersion`

---

## Config + credential storage

**Non-sensitive config** (endpoint, model, cache TTL):
`~/Library/Application Support/com.versionneer.brew/config.json`

```json
{ "llm": { "endpoint": "...", "model": "..." }, "cache": { "ttl_hours": 24 } }
```

**API key** — macOS Keychain only, never on disk:

- Service: `com.versionneer.brew` · Account: `llm-api-key`
- Constants: `KEYCHAIN_SERVICE`, `KEYCHAIN_ACCOUNT` in `src/api/config.ts`

---

## How to add a new Tauri command

1. **`src-tauri/src/brew.rs`** (or `remote.rs` / `config.rs`) — implement the Rust function
2. **`src-tauri/src/commands.rs`** — add `#[tauri::command] pub fn my_command() -> Result<Value, String> { brew::my_fn() }`
   - Use `AppHandle` + `app_data_dir()`/`app_cache_dir()` only if the command needs app paths
3. **`src-tauri/src/lib.rs`** — add `commands::my_command` to `invoke_handler![]`
4. **`src/api/tauri.ts`** (or `config.ts`) — add `export function myCommand(): Promise<...> { return invoke("my_command"); }`
5. Rebuild: `cd src-tauri && cargo build` then re-run `npm run tauri dev`

---

## Dev commands

```bash
# Start full dev mode (hot reload frontend, auto-recompile Rust on change)
npm run tauri dev

# Type-check TypeScript only (fast — run after every edit)
npx tsc --noEmit

# Build Rust only (check for compile errors)
cd src-tauri && cargo build

# Production build
npm run tauri build
```

---

## Disk cache location

Catalogs: `~/Library/Caches/com.versionneer.brew/brew-catalog/{formula,cask}.json`
TTL: 24 hours (configurable in Settings). Force-refresh via "Refresh catalog" button in the UI.

---

## Gotchas

- **Brew path**: On Apple Silicon the brew binary lives at `/opt/homebrew/bin/brew`. Intel Macs use `/usr/local/bin/brew`. `brew.rs::resolve_brew_path()` checks all candidates.
- **Session summaries can drift**: Always re-read key files before editing — actual code may differ from conversation summaries (e.g. `useBrew` returns `checking` not `loading`; `AppLayout` accepts `brewStatus: BrewStatus | null`).
- **CSS class collision**: `.app-shell` existed in `App.css` for the "no brew" wrapper; renamed to `.no-brew-shell` when `AppShell` was added. Don't reuse `.app-shell`.
- **height: 100% not 100vh**: Any component nested inside a `flex: 1` container must use `height: 100%` in its root CSS rule or it will overflow.
- **keyring crate**: Requires `features = ["apple-native"]` in `Cargo.toml` for macOS Keychain access.
- **Empty installed list**: Use separate `try/catch` blocks (not `Promise.all`) for loadVersions and loadOutdated so one failure doesn't block the other.
- **Badge "undefined"**: Always guard `typeof pkg.installedVersion === "string"` before rendering a version badge.
- **Casks don't support formula detail fetch**: `handleSelect` in PackageList early-returns for `activeTab === "casks"` before calling `fetchFormulaDetail`.
- **Tab descriptions removed**: Nav moved to Sidebar; `AppLayout` no longer renders `<nav>` or tab description bar.
- **No CSS variables**: All colors are hardcoded hex. New components follow the same pattern — add `@media (prefers-color-scheme: dark)` overrides in each component's CSS file.
