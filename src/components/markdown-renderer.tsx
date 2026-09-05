import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/code-block";

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children }: ComponentPropsWithoutRef<"code">) {
          const value = String(children ?? "").replace(/\n$/, "");
          const isInline = !className || !className.startsWith("language-");

          if (isInline) {
            return <CodeBlock className={className} inline>{value}</CodeBlock>;
          }

          return <CodeBlock className={className}>{value}</CodeBlock>;
        },
        p({ children }) {
          return <p>{children}</p>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
