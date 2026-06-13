import ReactMarkdown from "react-markdown";
import "./MarkdownContent.css";

interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
}

export function MarkdownContent({ content, streaming }: MarkdownContentProps) {
  return (
    <div className={`md-content${streaming ? " md-streaming" : ""}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
      {streaming && <span className="ai-cursor">▍</span>}
    </div>
  );
}
