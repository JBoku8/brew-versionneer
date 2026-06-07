# Brew Versionneer

A read-only Homebrew package browser built with [Tauri v2](https://v2.tauri.app/) and React.

Browse installed formulae via the `brew` CLI, or explore the public [formulae.brew.sh](https://formulae.brew.sh) API for formulae and casks.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) 1.85+ (stable)
- macOS: Xcode Command Line Tools
- **Homebrew** (optional for Installed tab; required to list local packages)

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Data sources

### Local (requires Homebrew)

```bash
brew list --formula
brew info --json=v2 --installed
```

### Remote (no Homebrew required)

- `GET https://formulae.brew.sh/api/formula.json`
- `GET https://formulae.brew.sh/api/formula/{name}.json`
- `GET https://formulae.brew.sh/api/cask.json`

Remote catalogs are cached under the app cache directory for 24 hours. Use **Refresh catalog** in the UI to force a new download.

## If Homebrew is not installed

The app shows install instructions from [brew.sh](https://brew.sh). You can still browse Formulae and Casks from the public API.

## License

MIT
