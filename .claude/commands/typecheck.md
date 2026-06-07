Run TypeScript type-checking on the frontend without emitting files.

## Command

```bash
npx tsc --noEmit
```

## Project context

- TypeScript source lives entirely in `src/` — components, hooks, and API wrappers.
- `tsconfig.json` enables `strict`, `noUnusedLocals`, and `noUnusedParameters` — all three are enforced.
- No emitted output; Vite handles bundling separately.

## Key types to know

- `BrewStatus` — can be `null` while brew detection is in progress. Components receive `brewStatus: BrewStatus | null` and `brewChecking: boolean`, not just `BrewStatus`.
- `PackageRecord = Record<string, unknown>` — all fields are `unknown`; always guard with `typeof pkg.x === "string"` before using.
- `TabId = "installed" | "formulae" | "casks"`
- `LLMConfig`, `AppConfig` — defined in `src/api/config.ts`, not `src/api/tauri.ts`.

## Common errors in this codebase

- Passing `BrewStatus` where `BrewStatus | null` is expected (or vice versa).
- Using `pkg.someField` without narrowing — TS will flag `unknown` access.
- Unused imports or variables — `noUnusedLocals` is on; remove or prefix with `_`.
- Void promise not handled — wrap fire-and-forget calls in `void myFn()`.
- Missing prop in a component that had its interface extended (e.g. after adding `onOpenSettings`).

## Output

- No output = no errors. Confirm "TypeScript: no errors found."
- On error: report each as `file:line — message` and suggest the fix.
