import { useEffect, useRef, useState } from "react";
import { ChatMessage, askAboutPackage } from "../../api/llm";
import { PackageRecord, packageName } from "../../api/tauri";
import { getErrorMessage } from "../../lib/errors";
import { LlmContextProps } from "../../models/ui";
import "./AISection.css";

interface AISectionProps extends LlmContextProps {
  pkg: PackageRecord;
}

export function AISection({ pkg, llmConfig, apiKey, onOpenSettings }: AISectionProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pkgName = packageName(pkg);

  // Reset conversation when the selected package changes
  useEffect(() => {
    setHistory([]);
    setInput("");
    setError(null);
    setLoading(false);
  }, [pkgName]);

  // Scroll to bottom after each new message
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [history]);

  const handleAsk = async () => {
    const q = input.trim();
    if (!q || !llmConfig || !apiKey || loading) return;

    const userMsg: ChatMessage = { role: "user", content: q };
    setHistory((h) => [...h, userMsg]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const reply = await askAboutPackage(llmConfig, apiKey, pkg, history, q);
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(getErrorMessage(err));
      // Remove the user message on failure so they can retry
      setHistory((h) => h.slice(0, -1));
      setInput(q);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAsk();
    }
  };

  // ── Not configured ────────────────────────────────
  if (!llmConfig || !apiKey) {
    return (
      <div className="ai-section ai-unconfigured">
        <p className="ai-section-title">💬 AI Assistant</p>
        <p className="ai-unconfigured-msg">
          Add an API key in Settings to ask questions about this package.
        </p>
        <button type="button" className="ai-settings-link" onClick={onOpenSettings}>
          Open Settings →
        </button>
      </div>
    );
  }

  // ── Configured ────────────────────────────────────
  return (
    <div className="ai-section">
      <p className="ai-section-title">💬 Ask about {pkgName}</p>

      {history.length > 0 && (
        <div className="ai-thread" ref={threadRef}>
          {history.map((msg, i) => (
            <div key={i} className={`ai-message ai-message-${msg.role}`}>
              <span className="ai-message-label">{msg.role === "user" ? "You" : "AI"}</span>
              <span className="ai-message-content">{msg.content}</span>
            </div>
          ))}
          {loading && (
            <div className="ai-message ai-message-assistant">
              <span className="ai-message-label">AI</span>
              <span className="ai-thinking">●●●</span>
            </div>
          )}
          {error && (
            <div className="ai-error">
              <span>⚠ {error}</span>
              <button type="button" className="ai-retry-btn" onClick={() => void handleAsk()}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      <div className="ai-input-row">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={history.length === 0 ? `Ask about ${pkgName}…` : "Follow-up question…"}
          rows={2}
          disabled={loading}
        />
        <button
          type="button"
          className="ai-ask-btn"
          onClick={() => void handleAsk()}
          disabled={!input.trim() || loading}
        >
          {loading ? "…" : "Ask →"}
        </button>
      </div>
      <p className="ai-hint">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
