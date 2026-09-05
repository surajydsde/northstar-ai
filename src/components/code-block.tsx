"use client";

import type { ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";

type CodeBlockProps = {
  className?: string;
  children?: ReactNode;
  inline?: boolean;
};

export function CodeBlock({ className, children, inline = false }: CodeBlockProps) {
  const value = String(children ?? "").replace(/\n$/, "");
  const language = className?.replace("language-", "") ?? "";

  if (inline) {
    return <code className="inline-code">{value}</code>;
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language || "code"}</span>
        <CopyButton value={value} />
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}
