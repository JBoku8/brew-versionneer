Scaffold a new end-to-end Tauri IPC command for the Brew Versionneer project.

The user will describe what the command should do. Follow the exact pattern used by existing commands:

**Step 1 — Rust implementation (`src-tauri/src/brew.rs` or `remote.rs`)**
Add a `pub fn` that runs the brew CLI or HTTP request and returns `Result<serde_json::Value, String>`.
Use `run_brew(&[...])` + `brew_output_success(output)?` for CLI commands.

**Step 2 — Tauri command wrapper (`src-tauri/src/commands.rs`)**
```rust
#[tauri::command]
pub fn my_command_name() -> Result<Value, String> {
    brew::my_rust_fn()
}
```
Use `async` + `AppHandle` only if the command needs the app cache dir (like catalog fetches).

**Step 3 — Register in handler (`src-tauri/src/lib.rs`)**
Add `commands::my_command_name` to the `invoke_handler![]` list.

**Step 4 — TypeScript wrapper (`src/api/tauri.ts`)**
```typescript
export function myCommandName(): Promise<ReturnType> {
  return invoke<ReturnType>("my_command_name");
}
```
Add any new interfaces/types above the function.

**Step 5 — Verify**
Run `cd src-tauri && cargo build` then `npx tsc --noEmit`. Fix any errors before finishing.

Ask the user what the command should do, what arguments it takes, and what it returns if not clear from context.
