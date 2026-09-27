import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// No raw HTML, remote images or navigation from untrusted issue content.
// A controlled external opener belongs to the real BD integration phase.
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children }) => <span className="reference-text">{children}</span>,
        img: ({ alt }) => <span>{alt ?? "图片"}</span>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
