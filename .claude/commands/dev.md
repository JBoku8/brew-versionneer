Start the Brew Versionneer app in development mode.

Run:
```bash
cd /Users/janobokuchava/brew-versionneer && npm run tauri dev
```

This compiles the Rust backend, starts the Vite dev server, and opens the app window.
Frontend changes hot-reload automatically. Rust changes require a restart (Ctrl+C then re-run).

Remind the user: if they just added new Tauri commands, the binary must be recompiled — `npm run tauri dev` handles that automatically.
