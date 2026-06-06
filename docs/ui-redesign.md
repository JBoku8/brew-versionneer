# UI/UX Redesign — Sidebar Layout & Component Reorganisation

## Status: Design document (pre-implementation)

---

## Motivation

The current tab-bar layout puts navigation at the top, leaving the main content area to share the full window width between the package list and detail panel. As new sections are added (Settings, future AI assistant panel), top-tabs become crowded and don't scale. A collapsible sidebar matches macOS conventions (Finder, VS Code, Xcode) and frees the content area for a better split between list, detail, and the incoming AI assistant.

---

## Layout overview

```
┌─────────────────────────────────────────────────────────────────┐
│ ◉ ○ ○  (traffic lights)                                         │
├──────────────┬──────────────────────────────────────────────────┤
│  SIDEBAR     │  CONTENT AREA                                    │
│              │  ─────────────────────────────────────────────  │
│  📦 Installed│  [toolbar: search · count · filters · refresh]  │
│  🍶 Formulae │                                                  │
│  🪣 Casks    │  ┌────────────────────┐  ┌────────────────────┐ │
│              │  │  PACKAGE LIST      │  │  PACKAGE DETAIL    │ │
│  ──────────  │  │                   │  │                    │ │
│  ⚙ Settings  │  │  (scrollable)     │  │  name / version    │ │
│              │  │                   │  │  description       │ │
│              │  │                   │  │  links / metadata  │ │
│  [«] toggle  │  │                   │  │  ─────────────── │ │
│  brew 4.x    │  │                   │  │  💬 AI Assistant  │ │
└──────────────┘  └────────────────────┘  └────────────────────┘ │
```

### Sidebar dimensions

| State | Width | Content |
|---|---|---|
| Expanded | 200 px | Icon + label, brew version at bottom |
| Collapsed | 48 px | Icon only; label shown as tooltip on hover |

Toggle button lives at the bottom-left of the sidebar. State persists to local storage (survives app restarts).

---

## Component hierarchy (proposed)

```
App
└── AppShell                      ← new root shell
    ├── Sidebar                   ← new
    │   ├── SidebarNavItem        ← new (one per route/view)
    │   └── SidebarFooter         ← brew version, collapse toggle
    └── ContentArea               ← new (flex-1 right of sidebar)
        ├── PackagesView          ← replaces AppLayout's main body
        │   ├── Toolbar           ← extracted from PackageList header
        │   ├── PackageList       ← refined (receives props, no change to logic)
        │   └── PackageDetail     ← extended with AI section
        └── SettingsView          ← new page
            ├── LLMSettings       ← new section component
            └── CacheSettings     ← new section component
```

### Routing strategy

No URL router is needed for a Tauri desktop app. Use a simple `activeView: "packages" | "settings"` state in `AppShell`. The sidebar `Settings` item sets `activeView = "settings"`.

---

## Component responsibilities

### `AppShell`
- Owns `sidebarCollapsed: boolean` (persisted to localStorage)
- Owns `activeView: "packages" | "settings"`
- Owns `activePkg: TabId` (installed / formulae / casks) — moved up from AppLayout
- Passes brew status, installed/outdated data down to PackagesView

### `Sidebar`
Props: `collapsed`, `onToggle`, `activeView`, `onNavigate`, `brewStatus`

Renders:
- Logo / app name (hidden when collapsed, icon only)
- Nav items: Installed, Formulae, Casks (package views), then a divider, then Settings
- Footer: brew version text + collapse toggle button
- Tooltip on each icon when collapsed (CSS title or custom tooltip)

### `PackagesView`
Absorbs what AppLayout currently does: owns `installedVersions`, `outdatedResult`, `installedReady`, calls `loadInstalledData` on mount. Passes everything down to Toolbar + PackageList + PackageDetail.

This replaces AppLayout (the component is renamed / refactored, not deleted).

### `Toolbar`
Extracted from the top of PackageList's `<header className="browser-toolbar">`. Owns search input, count label, filter button, refresh button. Lifted so it sits at the ContentArea level rather than inside the list scroll container.

### `PackageDetail` (extended)
Gains a new `AISection` sub-component at the bottom of the detail panel. See `llm-integration.md` for full spec.

### `SettingsView`
Full-height content area page. Two sections: LLMSettings, CacheSettings. On Save, writes to Keychain (API key) and app config file (endpoint, model, cache TTL).

---

## Visual spec

### Sidebar nav item
```
[expanded]                     [collapsed]
 ┌──────────────────────────┐   ┌────┐
 │ 📦  Installed        ●   │   │ 📦 │  ← active dot or highlight
 └──────────────────────────┘   └────┘
 ┌──────────────────────────┐   ┌────┐
 │ 🍶  Formulae             │   │ 🍶 │
 └──────────────────────────┘   └────┘
```

- Active item: filled background (same blue as current `.tab.active`)
- Hover: light background tint
- Divider: thin `<hr>` between package nav and Settings

### Sidebar footer (expanded)
```
 ┌──────────────────────────┐
 │  brew 4.4.x (arm64)      │
 │  [«]  Collapse           │
 └──────────────────────────┘
```

### Dark mode
All existing dark mode rules carry over. Sidebar background matches the header: `#1a1a1a` dark / `#f5f5f5` light with a right border.

---

## Migration from current layout

| Current | Becomes |
|---|---|
| `AppLayout.tsx` nav + state | Split into `AppShell` (shell) + `PackagesView` (data) |
| `.app-tabs` nav bar | `Sidebar` component |
| `.tab-description` bar | Static subtitle inside the PackagesView toolbar (inline text, no separate bar needed) |
| `PackageList` toolbar header | Extracted to `Toolbar` component |
| `PackageDetail` aside | Extended with `AISection` at the bottom |

No changes to the data-flow patterns (two-phase loading, useMemo annotations, useRef cache). Those stay exactly as-is; only the layout shell changes.

---

## Open questions (resolved)

| Question | Decision |
|---|---|
| Sidebar collapsible? | Yes — icon-only mode, toggle at bottom |
| Tab descriptions? | Inline subtitle text in Toolbar, not a separate bar |
| Settings: modal or page? | Full content-area page (replaces package view) |
| Routing? | Simple `activeView` state — no URL router |
