import { useEffect, useRef, useState } from "react";
import { ChatMessage, askAboutSetup } from "../../api/llm";
import { OutdatedResult } from "../../api/tauri";
import { getErrorMessage } from "../../lib/errors";
import { LlmContextProps } from "../../models/ui";
import "./AISection.css";
import "./SetupAssistant.css";

interface SetupAssistantProps extends LlmContextProps {
  installedVersions: Record<string, string>;
  outdatedResult: OutdatedResult;
  installedReady: boolean;
}

const QUICK_PROMPTS = [
  "What's safe to upgrade right now?",
  "Anything deprecated or redundant I should remove?",
  "Recommend tools based on what I have",
];

export function SetupAssistant({
  installedVersions,
  outdatedResult,
  installedReady,
  llmConfig,
  apiKey,
  onOpenSettings,
}: SetupAssistantProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const installedCount = Object.keys(installedVersions).length;
  const outdatedCount = outdatedResult.formulae.length;

  // Follow the thread as messages arrive or stream in
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [history, streamText]);

  const ask = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || !llmConfig || !apiKey || loading) return;

    const userMsg: ChatMessage = { role: "user", content: q };
    setHistory((h) => [...h, userMsg]);
    setInput("");
    setError(null);
    setLoading(true);
    setStreamText("");

    try {
      const reply = await askAboutSetup(
        llmConfig,
        apiKey,
        installedVersions,
        outdatedResult,
        history,
        q,
        setStreamText,
      );
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(getErrorMessage(err));
      // Remove the user message on failure so they can retry
      setHistory((h) => h.slice(0, -1));
      setInput(q);
    } finally {
      setLoading(false);
      setStreamText("");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  const subtitle = installedReady
    ? outdatedCount > 0
      ? `${installedCount} formulae installed · ${outdatedCount} outdated`
      : `${installedCount} formulae installed · everything up to date`
    : "Loading your installed packages…";

  return (
    <div className="assistant-view">
      <h2 className="assistant-title">✦ AI Assistant</h2>
      <p className="assistant-sub">Ask anything about your Homebrew setup — {subtitle}</p>

      {!llmConfig || !apiKey ? (
        <div className="ai-unconfigured">
          <p className="ai-unconfigured-msg">
            Add an API key in Settings to ask questions about your setup.
          </p>
          <button type="button" className="ai-settings-link" onClick={onOpenSettings}>
            Open Settings →
          </button>
        </div>
      ) : (
        <>
          {history.length > 0 || loading ? (
            <div className="assistant-thread" ref={threadRef}>
              {history.map((msg, i) => (
                <div key={i} className={`ai-message ai-message-${msg.role}`}>
                  <span className="ai-message-label">{msg.role === "user" ? "You" : "AI"}</span>
                  <span className="ai-message-content">{msg.content}</span>
                </div>
              ))}
              {loading && (
                <div className="ai-message ai-message-assistant">
                  <span className="ai-message-label">AI</span>
                  {streamText ? (
                    <span className="ai-message-content">
                      {streamText}
                      <span className="ai-cursor">▍</span>
                    </span>
                  ) : (
                    <span className="ai-thinking">●●●</span>
                  )}
                </div>
              )}
              {error && (
                <div className="ai-error">
                  <span>⚠ {error}</span>
                  <button type="button" className="ai-retry-btn" onClick={() => void ask(input)}>
                    Retry
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="assistant-thread assistant-empty">
              <p>Your installed and outdated packages are shared as context automatically.</p>
            </div>
          )}

          {history.length === 0 && !loading && (
            <div className="ai-chips">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="ai-chip"
                  onClick={() => void ask(prompt)}
                  disabled={!installedReady}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="ai-input-row">
            <textarea
              ref={inputRef}
              className="ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                history.length === 0 ? "Ask about your setup…" : "Follow-up question…"
              }
              rows={2}
              disabled={loading}
            />
            <button
              type="button"
              className="ai-ask-btn"
              onClick={() => void ask(input)}
              disabled={!input.trim() || loading}
            >
              {loading ? "…" : "Ask →"}
            </button>
          </div>
          <p className="ai-hint">Enter to send · Shift+Enter for new line</p>
        </>
      )}
    </div>
  );
}
