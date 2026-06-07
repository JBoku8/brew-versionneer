Scaffold a new end-to-end Tauri IPC command for the Brew Versionneer project.

Ask the user what the command should do, what arguments it takes, and what it returns if not clear from context. Then follow these steps exactly.

---

## Step 1 — Implement the Rust function

Choose the right module:
- **`src-tauri/src/brew.rs`** — for Homebrew CLI calls (use `run_brew` + `brew_output_success`)
- **`src-tauri/src/remote.rs`** — for HTTP fetches to formulae.brew.sh
- **`src-tauri/src/config.rs`** — for app config file or macOS Keychain operations

**CLI command pattern (brew.rs):**
```rust
pub fn my_fn() -> Result<serde_json::Value, String> {
    let output = run_brew(&["list", "--versions"])?;
    let stdout = brew_output_success(output)?;
    // parse stdout into a Value or struct
    serde_json::from_str(&stdout).map_err(|e| format!("JSON parse error: {e}"))
}
```

**Config/keychain pattern (config.rs):**
```rust
pub fn my_config_fn(data_dir: &Path) -> Result<AppConfig, String> {
    // reuse read_config / write_config / keychain_read / keychain_write helpers
}
```

---

## Step 2 — Add a Tauri command wrapper in `src-tauri/src/commands.rs`

**Sync command (no app paths needed):**
```rust
#[tauri::command]
pub fn my_command() -> Result<Value, String> {
    brew::my_fn()
}
```

**Async command (needs app cache or data dir):**
```rust
#[tauri::command]
pub async fn my_command(app: AppHandle) -> Result<Value, String> {
    let dir = app_cache_dir(&app)?;   // or app_data_dir(&app)?
    // ...
}
```

Use `app_cache_dir` for catalog caches, `app_data_dir` for config/persistent data.
Both helpers are already defined at the bottom of `commands.rs`.
`AppHandle` requires `use tauri::Manager;` — already imported at the top of `commands.rs`.

---

## Step 3 — Register in `src-tauri/src/lib.rs`

Add to the `invoke_handler![]` list:
```rust
commands::my_command,
```

**This step is mandatory** — omitting it causes silent IPC failure at runtime with no compile error.

---

## Step 4 — Add a TypeScript wrapper

Put it in the right file:
- **`src/api/tauri.ts`** — for brew/catalog/package commands
- **`src/api/config.ts`** — for config file or keychain commands

```typescript
export function myCommand(arg: string): Promise<ReturnType> {
  return invoke<ReturnType>("my_command", { arg });
}
```

Tauri converts camelCase JS params to snake_case Rust params automatically — pass `{ forceRefresh }` and the Rust side receives `force_refresh`.

---

## Step 5 — Verify

```bash
cd src-tauri && cargo build   # Rust must compile cleanly
npx tsc --noEmit              # TypeScript must have no errors
```

Fix any errors before finishing. Common issues:
- Forgot `mod my_module;` in `lib.rs` if you created a new `.rs` file.
- New crate in `Cargo.toml` may need `features = [...]` — check crate docs.
- Unused import or param → TypeScript `noUnusedLocals`/`noUnusedParameters` will error.

---

## Current command registry (15 commands as of last update)

`check_brew`, `detect_brew`, `get_brew_version`, `get_installed_versions`, `get_outdated_formulae`,
`get_installed_formulae`, `get_installed_formula_names`, `fetch_formulae_catalog`,
`fetch_casks_catalog`, `fetch_formula_detail`, `read_config`, `write_config`,
`read_keychain`, `write_keychain`, `delete_keychain`
