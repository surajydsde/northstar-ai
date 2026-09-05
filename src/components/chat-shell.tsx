const chatHistory = [
  { id: 1, label: "Generate onboarding copy", active: true },
  { id: 2, label: "UI component audit" },
  { id: 3, label: "Product roadmap draft" },
];

export function ChatShell() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex h-screen max-w-7xl">
        <aside className="flex w-72 flex-col border-r border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15 text-sm font-semibold text-emerald-300">
                C
              </div>
              <span className="text-sm font-medium text-slate-100">ChatGPT Clone</span>
            </div>
            <button className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500">
              New
            </button>
          </div>

          <div className="space-y-2">
            {chatHistory.map((chat) => (
              <button
                key={chat.id}
                className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition ${
                  chat.active
                    ? "bg-slate-800 text-slate-50 ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-slate-800/80"
                }`}
              >
                <span className="truncate">{chat.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Workspace</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-50">Project planning</h1>
            </div>
            <button className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
              Share
            </button>
          </header>

          <div className="flex flex-1 flex-col justify-between">
            <div className="flex flex-1 flex-col gap-4 px-6 py-8">
              <div className="max-w-2xl rounded-2xl bg-slate-900/80 p-4 shadow-lg ring-1 ring-slate-800">
                <p className="text-base leading-7 text-slate-200">
                  Welcome to your chat workspace. This is the base shell for the ChatGPT-style app,
                  ready for message handling, model integrations, and chat UI implementation.
                </p>
              </div>
              <div className="max-w-2xl self-end rounded-2xl bg-emerald-500/10 p-4 shadow-lg ring-1 ring-emerald-500/20">
                <p className="text-base leading-7 text-emerald-100">
                  Next steps: add streaming responses, prompt states, and AI integration.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 px-6 py-5">
              <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900/80 p-3 shadow-lg">
                <textarea
                  aria-label="Message input"
                  rows={3}
                  placeholder="Message ChatGPT..."
                  className="w-full resize-none bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-3">
                  <div className="text-xs text-slate-500">Ready for implementation</div>
                  <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200">
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
