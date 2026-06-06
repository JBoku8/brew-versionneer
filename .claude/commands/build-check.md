Verify the full project compiles cleanly: Rust backend first, then TypeScript frontend.

Steps:
1. Run `cd /Users/janobokuchava/brew-versionneer/src-tauri && cargo build` — report any Rust compile errors.
2. Run `cd /Users/janobokuchava/brew-versionneer && npx tsc --noEmit` — report any TypeScript errors.

If both pass, confirm "Build check passed: Rust ✓ TypeScript ✓".
If either fails, show the errors clearly and suggest fixes.
