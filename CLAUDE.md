# Brew Versionneer — Project Knowledge Base

## What this is
A **Tauri 2 + React 19 + TypeScript** macOS desktop app that lets you browse, search, and compare locally-installed vs. latest Homebrew packages. Packages are loaded fast (< 500 ms), outdated ones are highlighted, and remote catalogs are cached to disk.

---

## Tech stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript + Vite 7 |
| Styling | Plain CSS (no framework) |
| IPC | `@tauri-apps/api` `invoke()` |
| Remote data | `reqwest` → `formulae.brew.sh` API |

---

## Module map

```
src-tauri/src/
  brew.rs        — All Homebrew CLI calls (check_brew, list --versions, outdated, info)
  remote.rs      — Fetch + 24h disk-cache for formulae/casks catalogs from formulae.brew.sh
  commands.rs    — Tauri #[tauri::command] wrappers (IPC surface)
  lib.rs         — Registers all commands in invoke_handler![]

src/
  api/tauri.ts         — TypeScript IPC wrappers + shared types + helper functions
  hooks/useBrew.ts     — Checks brew presence on mount; exposes {status, loading, refresh}
  components/
    AppLayout.tsx/.css  — Tab bar, pre-fetches installed/outdated data on mount
    PackageList.tsx/.css — Package list, search, pagination, badge annotations
    PackageDetail.tsx/.css — Right-panel detail view for a selected package
    SplashScreen.tsx/.css  — Loading splash
    InstallBrew.tsx/.css   — Shown when Homebrew is missing
```

---

## IPC command registry

Every Rust function in `commands.rs` must be registered in `lib.rs` `invoke_handler![]`.

| Tauri command | Rust fn | Description |
|---|---|---|
| `check_brew` | `brew::check_brew` | Detect brew path + version |
| `get_installed_versions` | `brew::get_installed_versions_json` | `{name: version}` map, ~100ms |
| `get_outdated_formulae` | `brew::get_outdated_json` | `brew outdated --json=v1`, ~300ms |
| `get_installed_formulae` | `brew::get_installed_formulae_json` | Full `brew info --json=v2 --installed` (slow fallback, ~3-10s) |
| `get_installed_formula_names` | `brew::get_installed_formula_names` | Plain name list |
| `fetch_formulae_catalog` | `remote::fetch_catalog(Formulae)` | All formulae; 24h disk cache |
| `fetch_casks_catalog` | `remote::fetch_catalog(Casks)` | All casks; 24h disk cache |
| `fetch_formula_detail` | `remote::fetch_formula_detail` | Single formula detail (on-demand) |

---

## Data flow

### Installed tab (fast path)
```
App mount
  → AppLayout: Promise.allSettled([getInstalledVersions(), getOutdatedFormulae()])
      ~100ms + ~300ms in parallel → done in ~400ms total
  → setInstalledVersions({name: version, ...})
  → setOutdatedResult({formulae: [...OutdatedEntry], casks: [...]})
  → setInstalledReady(true)

PackageList (installed tab):
  Builds PackageRecord[] synchronously from installedVersions + outdatedResult
  → Object.entries(installedVersions).sort().map(([name, version]) => ...)
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
      isInstalled, installedVersion, isOutdated, latestVersion applied without
      touching raw cache
```

### Fallback (if new fast commands unavailable)
```
getInstalledVersions() rejects
  → fall back to getInstalledFormulae() (brew info --json=v2 --installed)
  → parse PackageRecord[] → {name: version} map
  → Same UI, just slower (~3-10s)
```

---

## Key patterns

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
- `isInstalled` — true when name found in `installedVersions` map

Helper functions in `src/api/tauri.ts`:
- `packageName(pkg)` — returns `name ?? token ?? "unknown"`
- `packageDescription(pkg)` — returns `desc ?? description ?? ""`
- `packageHomepage(pkg)` — returns `homepage` string or null
- `packageVersion(pkg)` — prefers `versions.stable`, falls back to installed[0].version, then `installedVersion`

---

## How to add a new Tauri command

1. **`src-tauri/src/brew.rs`** (or `remote.rs`) — implement the Rust function
2. **`src-tauri/src/commands.rs`** — add `#[tauri::command] pub fn my_command() -> Result<Value, String> { brew::my_fn() }`
3. **`src-tauri/src/lib.rs`** — add `commands::my_command` to `invoke_handler![]`
4. **`src/api/tauri.ts`** — add `export function myCommand(): Promise<...> { return invoke("my_command"); }`
5. Rebuild: `cd src-tauri && cargo build` then re-run `npm run tauri dev`

---

## Dev commands

```bash
# Start full dev mode (hot reload frontend, auto-recompile Rust on change)
npm run tauri dev

# Type-check TypeScript only (fast)
npx tsc --noEmit

# Build Rust only (check for compile errors)
cd src-tauri && cargo build

# Production build
npm run tauri build
```

---

## Disk cache location

Catalogs are cached at:
`~/Library/Caches/com.brew-versionneer.app/brew-catalog/{formula,cask}.json`

TTL: 24 hours. Force-refresh via "Refresh catalog" button in the UI.

---

## Gotchas

- **Brew path**: On Apple Silicon the brew binary lives at `/opt/homebrew/bin/brew`. Intel Macs use `/usr/local/bin/brew`. `brew.rs::resolve_brew_path()` checks all candidates.
- **Empty installed list**: Always use `Promise.allSettled` (not `Promise.all`) when fetching installed data; a single failure must not block the whole UI.
- **Badge "undefined"**: Always guard `typeof pkg.installedVersion === "string"` before rendering a version badge.
- **Casks don't support formula detail fetch**: `handleSelect` in PackageList early-returns for `activeTab === "casks"` before calling `fetchFormulaDetail`.
- **Tab descriptions**: Only Formulae and Casks tabs have descriptions (defined in `TABS` array in AppLayout.tsx). Installed tab has no description bar.
