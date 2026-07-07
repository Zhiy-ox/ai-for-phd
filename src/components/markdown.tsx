"use client";

import ReactMarkdown from "react-markdown";

export function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
