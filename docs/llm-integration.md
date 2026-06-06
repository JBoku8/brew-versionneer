# LLM Integration — AI Assistant for Package Detail

## Status: Design document (pre-implementation)

---

## Goal

Allow users to ask natural-language questions about any selected Homebrew package. The AI operates exclusively inside the **Package Detail panel** — it answers questions about the specific package in view, nothing else. It never triggers automatically; the user always initiates the conversation.

---

## Scope boundaries

| In scope | Out of scope |
|---|---|
| Question/answer about the selected package | Global brew advice |
| "What does this do?" / "Is it safe to update?" | Running brew commands on behalf of user |
| Short AI-generated package summary (on demand) | Persistent history across sessions |
| Works with any OpenAI-compatible endpoint | Web search / real-time data |

---

## User flow

```
1. User selects a package in the list
   → Detail panel shows name, version, description (same as now)
   → AI section appears at bottom of detail panel

2a. API not configured:
   → "Configure API in Settings to use the AI assistant"
   → [Open Settings →] link

2b. API configured, waiting:
   → Text input with placeholder "Ask about <package name>…"
   → [Ask →] button

3. User types question and clicks Ask
   → Input clears, spinner appears
   → Response streams in (or appears when complete)

4. User switches to a different package
   → Chat history clears completely (fresh conversation)

5. User can ask follow-up questions in the same package session
   → Each follow-up appends to the visible chat thread
   → Full thread is sent as context with each new message
```

---

## LLM client design

### OpenAI-compatible endpoint

The client sends standard OpenAI Chat Completions API requests. This is compatible with:
- OpenAI (api.openai.com)
- Ollama (localhost:11434/v1)
- LM Studio (localhost:1234/v1)
- Any OpenAI-compatible proxy or gateway

### Request shape

```json
POST {endpoint}/chat/completions
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "model": "{model}",
  "stream": false,
  "messages": [
    {
      "role": "system",
      "content": "You are a concise assistant that helps users understand Homebrew packages. Answer only questions about the package provided. Keep responses short (2-4 sentences unless detail is needed)."
    },
    {
      "role": "user",
      "content": "Package: git\nDescription: Distributed revision control system\nInstalled version: 2.45.1\nLatest version: 2.47.0\nTap: homebrew/core\nHomepage: https://git-scm.com\n\nQuestion: Is it safe to update to 2.47.0?"
    },
    // ... previous assistant + user turns for follow-ups
  ]
}
```

### Context injected per-package (system turns)

| Field | Source |
|---|---|
| `name` | `packageName(pkg)` |
| `description` | `packageDescription(pkg)` |
| `installedVersion` | `pkg.installedVersion` (if present) |
| `latestVersion` | `pkg.latestVersion` (if present) |
| `tap` | `pkg.tap` |
| `homepage` | `packageHomepage(pkg)` |

No raw JSON or full catalog data is sent. Context is minimal and deterministic.

### Rust vs TypeScript — where the client lives

The LLM client lives in **TypeScript** (frontend), not Rust. Reasons:
- No new Tauri IPC command needed — `fetch()` is available in WebView
- Streaming responses are easier to handle in React state
- Credentials can be read from config state (already in memory after Settings load)

The Rust backend is involved only in **reading/writing the API key** to/from macOS Keychain.

---

## Keychain integration

### Tauri plugin required
`tauri-plugin-stronghold` or the lighter `tauri-plugin-keychain` (community). Needs evaluation at implementation time. The design is the same either way:

| Operation | When |
|---|---|
| Write key to Keychain | User clicks Save in Settings |
| Read key from Keychain | App start, or when Settings page opens |
| Delete key from Keychain | User clears the key field and saves |

### Config file (non-sensitive)
Stored at `~/Library/Application Support/com.brew-versionneer.app/config.json`:

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

API key is **never** in this file.

---

## Frontend — AI section states

The `AISection` component inside `PackageDetail` has four distinct states:

### `unconfigured`
```
┌───────────────────────────────────────┐
│ 💬 AI Assistant                       │
│ Add an API key in Settings to ask     │
│ questions about this package.         │
│ [Open Settings →]                     │
└───────────────────────────────────────┘
```

### `idle` (configured, no messages yet)
```
┌───────────────────────────────────────┐
│ 💬 Ask about git                      │
│ ┌─────────────────────────────────┐   │
│ │ What does this do?              │   │
│ └─────────────────────────────────┘   │
│                              [Ask →]  │
└───────────────────────────────────────┘
```

### `loading` (request in flight)
```
┌───────────────────────────────────────┐
│ 💬 Ask about git                      │
│ You: Is it safe to update?            │
│                                       │
│ AI: ●●●                               │
└───────────────────────────────────────┘
```

### `answered` (with follow-up input)
```
┌───────────────────────────────────────┐
│ 💬 Ask about git                      │
│ You: Is it safe to update?            │
│ AI:  Yes — 2.47.0 is a minor release  │
│      with bug fixes only. Low risk.   │
│                                       │
│ ┌─────────────────────────────────┐   │
│ │ What changed in 2.47.0?         │   │
│ └─────────────────────────────────┘   │
│                              [Ask →]  │
└───────────────────────────────────────┘
```

### Error state
```
┌───────────────────────────────────────┐
│ 💬 Ask about git                      │
│ You: Is it safe to update?            │
│ ⚠ Could not reach API: Network error  │
│   [Retry]                             │
└───────────────────────────────────────┘
```

---

## Data model (TypeScript)

```typescript
// Stored in component state, resets when selected package changes
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
}

// Config loaded from config file + Keychain
interface LLMConfig {
  endpoint: string;    // e.g. "https://api.openai.com/v1"
  apiKey: string;      // read from Keychain
  model: string;       // e.g. "gpt-4o-mini"
}
```

---

## Settings — LLMSettings component

Fields:
| Field | Type | Validation |
|---|---|---|
| API Endpoint | URL input | Must start with http/https |
| API Key | Password input | Any non-empty string; stored to Keychain on Save |
| Model | Text input (with suggestions dropdown) | Non-empty |

Suggestions for model dropdown (user can type custom value):
- `gpt-4o-mini`
- `gpt-4o`
- `gpt-3.5-turbo`
- `llama3`
- *(any custom value)*

**Test connection** button: sends a minimal request (empty message list, max_tokens=1) to verify endpoint + key are correct. Shows ✓ / ✗ inline.

---

## Security considerations

- API key lives only in macOS Keychain and in-memory JS state after load. Never logged, never serialised to disk.
- Package context sent to LLM is minimal (no filesystem paths, no user data beyond package metadata).
- If endpoint is a local server (localhost), no credentials leave the machine.
- No telemetry. Requests go directly from the app to the configured endpoint.

---

## Open questions (to decide at implementation time)

| Question | Options |
|---|---|
| Streaming responses? | `stream: true` for better UX; `stream: false` simpler to implement. Start with false. |
| Which Keychain plugin? | `tauri-plugin-stronghold` (official) vs community alternatives. Evaluate crate maturity. |
| Token limit guard? | Cap context to prevent accidental large sends. Suggested: 2000 tokens system + context. |
| Local model fallback? | Out of scope for v1. |
