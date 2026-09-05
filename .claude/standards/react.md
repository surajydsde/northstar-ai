# React & Next.js Standards — Northstar AI

## Server vs Client components

Default to **server components**. Only add `"use client"` when the component
needs one of these:

- `useState` / `useReducer`
- `useEffect` with side effects
- Browser APIs (`window`, `document`, `navigator`, `localStorage`)
- Event handlers that reference mutable state
- Third-party libraries that require a browser context

```typescript
// Server component (no directive needed)
export async function ConversationList({ userId }: { userId: string }) {
  const conversations = await conversationService.listByUser(userId);
  return <ul>{conversations.map(c => <ConversationItem key={c.id} {...c} />)}</ul>;
}

// Client component (needs interactivity)
'use client';
export function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  // ...
}
```

## Component structure

```typescript
// 1. Directive (if client component)
'use client';

// 2. Imports: React, third-party, internal
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { type Message } from '@/types/chat';

// 3. Types and interfaces
interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
}

// 4. Component (one per file unless tightly coupled sub-components)
export function ChatMessage({ message, isLast = false }: ChatMessageProps) {
  // hooks first
  const [copied, setCopied] = useState(false);

  // derived values
  const isUser = message.role === 'user';

  // handlers
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // render
  return (
    <article
      className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
      aria-label={`${message.role} message`}
    >
      {/* ... */}
    </article>
  );
}
```

## Semantic HTML patterns

```tsx
// Navigation
<nav aria-label="Chat sidebar">
  <ul role="list">
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</nav>

// Main content area
<main id="main-content">
  <h1>Northstar AI</h1>
</main>

// Dialogs/modals
<dialog
  open={isOpen}
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Confirm deletion</h2>
  <p id="dialog-description">This cannot be undone.</p>
  <button autoFocus onClick={onCancel}>Cancel</button>
  <button onClick={onConfirm}>Delete</button>
</dialog>

// Buttons (actions) vs Links (navigation)
<button type="button" onClick={handleSend}>Send</button>    // action
<a href="/dashboard">Back to dashboard</a>                   // navigation
<button type="submit" form="chat-form">Submit</button>       // form submit
```

## Accessibility patterns in components

```tsx
// Icon-only button
<button
  type="button"
  aria-label="Delete conversation"
  onClick={handleDelete}
>
  <TrashIcon aria-hidden="true" className="h-4 w-4" />
</button>

// Loading button
<button
  type="button"
  aria-busy={isSending}
  disabled={isSending}
  onClick={handleSend}
>
  {isSending ? 'Sending…' : 'Send'}
</button>

// Live region for chat messages
<div
  role="log"
  aria-live="polite"
  aria-label="Conversation"
  aria-relevant="additions"
>
  {messages.map(m => <ChatMessage key={m.id} message={m} />)}
</div>

// Error announcement
<p role="alert" aria-live="assertive" className="text-red-600">
  {error}
</p>

// Skip navigation
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

## Form patterns

```tsx
<form onSubmit={handleSubmit} noValidate>
  <div>
    <label htmlFor="message-input" className="sr-only">
      Message
    </label>
    <textarea
      id="message-input"
      name="message"
      value={text}
      onChange={e => setText(e.target.value)}
      aria-required="true"
      aria-describedby={error ? 'message-error' : undefined}
      placeholder="Ask anything…"
      rows={3}
    />
    {error && (
      <p id="message-error" role="alert" className="text-red-600 text-sm">
        {error}
      </p>
    )}
  </div>
  <button type="submit" disabled={!text.trim() || isSending}>
    Send
  </button>
</form>
```

## Tailwind conventions

```tsx
// Use cn() utility for conditional classes
import { cn } from '@/lib/utils';

<div className={cn(
  'flex items-center gap-2 rounded-lg p-3',
  isUser ? 'bg-blue-50 text-blue-900' : 'bg-gray-50 text-gray-900',
  isLast && 'mb-0',
)} />

// Screen reader only utility
<span className="sr-only">Loading…</span>

// Focus visible (do not remove outline without providing an alternative)
<button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
```

## Error boundaries

Wrap async data-fetching server components in error boundaries:

```typescript
// error.tsx alongside the page
'use client';
export default function Error({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

## Forbidden patterns

```tsx
// No onClick on non-interactive elements
<div onClick={handleClick}>...</div>   // use <button> or <a>

// No inline styles for colours (use Tailwind tokens)
<p style={{ color: '#666' }}>...</p>

// No dangerouslySetInnerHTML with user content
<div dangerouslySetInnerHTML={{ __html: userMessage }} />

// No layout effects in server components (they don't run)
// Don't forget 'use client' if you need useLayoutEffect

// No array index as React key for reorderable lists
items.map((item, i) => <Item key={i} ... />)   // use item.id
```
