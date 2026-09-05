"use client";

import { useRef } from "react";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function ChatInput({ value, onChange, onSubmit, disabled = false }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rows = Math.min(5, Math.max(1, value.split("\n").length));

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="chat-input-shell">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="chat-input"
        placeholder="Message Northstar AI..."
      />
      <button type="button" className="primary-button compact" onClick={onSubmit} disabled={disabled || !value.trim()}>
        Send
      </button>
    </div>
  );
}
