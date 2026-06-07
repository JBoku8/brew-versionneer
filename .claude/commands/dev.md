Start the Brew Versionneer app in development mode.

## Command

```bash
npm run tauri dev
```

Run from the project root (where `package.json` lives). This is the only command needed — it handles both the Rust backend and Vite frontend together.

## What it does

1. Compiles the Rust binary (`src-tauri/`) — slow on first run or after Rust changes (~20-60s).
2. Starts the Vite dev server for the React frontend.
3. Opens the Tauri window pointing at the Vite dev server.

## Reload behaviour

| Change type | What to do |
|---|---|
| React/TypeScript/CSS | Auto hot-reloads — no action needed |
| Rust source (`.rs` files) | Ctrl+C, re-run `npm run tauri dev` |
| New Tauri IPC command | Ctrl+C, re-run (Rust must recompile) |
| `Cargo.toml` dependency | Ctrl+C, re-run (downloads + compiles new crate) |

## Project structure reminder

```
src/              ← React frontend (Vite, hot-reloaded)
src-tauri/src/    ← Rust backend (requires restart on change)
  brew.rs         ← Homebrew CLI calls
  remote.rs       ← Remote catalog fetch + cache
  config.rs       ← App config + keychain
  commands.rs     ← IPC surface (register here AND in lib.rs)
  lib.rs          ← invoke_handler![] registration list
```

## Common startup issues

- **"Homebrew is not installed"** in the UI — expected on machines without brew; Formulae/Casks tabs still work.
- **IPC command not found** — new command added to `commands.rs` but not listed in `lib.rs` `invoke_handler![]`.
- **Port conflict on Vite** — kill any other `npm run dev` processes.
- **Rust compile error on start** — check `cargo build` output for the specific error before re-running.
