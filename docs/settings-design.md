# Settings — Design Spec

## Status: Design document (pre-implementation)

---

## Overview

Settings is a full content-area view (not a modal) activated by clicking the ⚙ Settings item in the sidebar. It replaces the package view in the content area while active. A "Back" affordance (or clicking any nav item) returns to the last active package tab.

---

## Layout

```
┌──────────────┬─────────────────────────────────────────────────────┐
│ 📦 Installed │  Settings                                            │
│ 🍶 Formulae  │                                                      │
│ 🪣 Casks     │  ┌─── AI Assistant ───────────────────────────────┐ │
│              │  │                                                 │ │
│ ──────────── │  │  API Endpoint                                   │ │
│ ⚙ Settings ● │  │  ┌─────────────────────────────────────────┐   │ │
│              │  │  │ https://api.openai.com/v1               │   │ │
│              │  │  └─────────────────────────────────────────┘   │ │
│ [«]          │  │                                                 │ │
│ brew 4.x     │  │  API Key                   [stored in Keychain] │ │
└──────────────┘  │  ┌─────────────────────────────────────────┐   │ │
                  │  │ ●●●●●●●●●●●●●●●●●          [Update key] │   │ │
                  │  └─────────────────────────────────────────┘   │ │
                  │                                                 │ │
                  │  Model                                          │ │
                  │  ┌─────────────────────────────────────────┐   │ │
                  │  │ gpt-4o-mini                           ▾  │   │ │
                  │  └─────────────────────────────────────────┘   │ │
                  │  (or type any custom model name)                │ │
                  │                                                 │ │
                  │  [Test connection]        ✓ Connected           │ │
                  │  [Save]                                         │ │
                  └─────────────────────────────────────────────────┘ │
                                                                      │
                  ┌─── Catalog Cache ──────────────────────────────┐  │
                  │                                                 │  │
                  │  Cache TTL      [ 24 hours ▾ ]                  │  │
                  │  Last updated   Today at 09:31                  │  │
                  │                                                 │  │
                  │  [Clear cache now]                              │  │
                  └─────────────────────────────────────────────────┘  │
```

---

## Sections

### AI Assistant

| Field | Details |
|---|---|
| **API Endpoint** | Full base URL including `/v1`. Validated to start with `http://` or `https://`. |
| **API Key** | Shows masked placeholder (●●●●) if key exists in Keychain. `[Update key]` opens inline text input to replace it. |
| **Model** | Text input with dropdown suggestions: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`, `llama3`. Any custom value allowed. |
| **Test connection** | Fires a minimal API call. Shows inline ✓ Connected / ✗ + error message. |
| **Save** | Writes endpoint + model to config file. Writes API key to macOS Keychain (only if changed). |

#### API Key field behaviour
- **Key exists**: show `●●●●●●●●●●` + `[Update key]` button. Clicking shows a text input pre-cleared.
- **Key not set**: show empty input with placeholder "Paste API key…"
- **After Save**: if input is non-empty, write to Keychain and mask again.
- **Clear key**: `[Update key]` → clear the field → Save → delete from Keychain.

### Catalog Cache

| Field | Details |
|---|---|
| **Cache TTL** | Dropdown: 6h / 12h / 24h (default) / 7 days. Saved to config file. |
| **Last updated** | Reads mtime of `formula.json` and `cask.json` cache files. Shows whichever is older. |
| **Clear cache now** | Deletes both cache files. Next tab visit triggers a fresh HTTP fetch. Shows confirmation text "Cache cleared" for 2s. |

---

## Config file

Path: `~/Library/Application Support/com.brew-versionneer.app/config.json`

```json
{
  "llm": {
    "endpoint": "https://api.openai.com/v1",
    "model": "gpt-4o-mini"
  },
  "cache": {
    "ttl_hours": 24
  }
}
```

API key is **not** in this file. It lives exclusively in the macOS Keychain under the service name `com.brew-versionneer.app` and account name `llm-api-key`.

---

## Tauri commands needed (new)

| Command | Description |
|---|---|
| `read_config` | Read config.json; return parsed object or defaults |
| `write_config` | Write config.json with provided fields |
| `read_keychain` | Read API key from Keychain (`service`, `account` args) |
| `write_keychain` | Write API key to Keychain |
| `delete_keychain` | Remove key from Keychain |

These follow the existing `commands.rs` → `lib.rs` registration pattern.
Keychain access requires a Tauri plugin (to be selected at implementation time).

---

## State flow

```
SettingsView mounts
  → invoke("read_config") → populate endpoint, model, ttl
  → invoke("read_keychain", {service, account}) → if key exists, show masked field

User edits fields (unsaved changes tracked in local state)
  → [Save] enabled when any field differs from loaded values

User clicks Save
  → invoke("write_config", { llm: {endpoint, model}, cache: {ttl_hours} })
  → if apiKey field changed && non-empty: invoke("write_keychain", {key})
  → if apiKey field changed && empty: invoke("delete_keychain")
  → show "Saved ✓" for 2s
  → emit config-changed event so AISection re-reads config

User clicks Test connection
  → fetch(`${endpoint}/chat/completions`, { method: "POST", body: minimal_payload })
  → show ✓ Connected or ✗ <error message>
```

---

## Edge cases

| Case | Behaviour |
|---|---|
| Config file missing | Treat as all-defaults; file created on first Save |
| Keychain read fails | Treat as no key; log error to console, don't crash |
| Test connection timeout | Show ✗ "Request timed out (10s)" |
| Save with empty endpoint | Validate inline, block Save |
| User leaves Settings with unsaved changes | No warning — discard silently (keep it simple for v1) |
