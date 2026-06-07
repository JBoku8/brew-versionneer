Verify the full project compiles cleanly: Rust backend first, then TypeScript frontend.

## Commands

```bash
# Step 1 — Rust
cd src-tauri && cargo build

# Step 2 — TypeScript (from project root)
npx tsc --noEmit
```

## Project context

**Rust (`src-tauri/src/`)**
- `brew.rs` — Homebrew CLI wrappers. All CLI calls use `run_brew(&[...])` + `brew_output_success(output)?`.
- `remote.rs` — Catalog HTTP fetch + 24h disk cache.
- `config.rs` — `AppConfig` struct; config file read/write; keychain via `keyring` crate.
- `commands.rs` — `#[tauri::command]` wrappers. Every new function here must be added to `lib.rs`.
- `lib.rs` — `invoke_handler![]` list. Missing registration = silent IPC failure at runtime.

**TypeScript (`src/`)**
- Strict mode + `noUnusedLocals` + `noUnusedParameters` enforced.
- `PackageRecord = Record<string, unknown>` — always narrow unknown fields before use.
- `BrewStatus | null` flows through most components — check nullable handling.

## Common Rust errors to watch for

- New command added to `commands.rs` but not registered in `lib.rs` `invoke_handler![]`.
- New module created (e.g. `config.rs`) but not declared with `mod config;` in `lib.rs`.
- `keyring` crate requires `features = ["apple-native"]` in `Cargo.toml` — missing feature = compile error.
- Async commands that need app paths must take `app: AppHandle` as first param.
- `AppHandle` needs `use tauri::Manager;` in scope to call `.path()`.

## Output

- Both pass → confirm "Build check passed: Rust ✓ TypeScript ✓".
- Either fails → show errors clearly with file/line and suggest fixes.
- Rust build is slow on first run after adding new dependencies (~30-60s); subsequent runs are fast.
