import { useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import type { AuthUser } from "@/features/auth/auth-context";
import { isSupportedTextFile, SUPPORTED_EXTENSIONS_LABEL } from "@/features/documents/document-types";

type AppHeaderProps = { title: string; subtitle?: string; user: AuthUser | null; onLogout: () => void };

type UploadStatus = { ok: boolean; text: string } | null;

export function AppHeader({ title, subtitle, user, onLogout }: AppHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<UploadStatus>(null);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isSupportedTextFile(file.name)) {
      setStatus({ ok: false, text: `Unsupported file type. Supported formats: ${SUPPORTED_EXTENSIONS_LABEL}` });
      return;
    }

    setUploading(true);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "Upload failed");
      setStatus({ ok: true, text: body.message || "Uploaded successfully" });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  const accept = ".txt,.md,.csv,.json,.log";

  return (
    <header className="topbar">
      <div className="topbar-copy">
        <span>{subtitle || "Workspace"}</span>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        <input ref={fileInputRef} type="file" accept={accept} hidden onChange={handleUpload} />
        <button
          type="button"
          className="secondary-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title={`Supported formats: ${SUPPORTED_EXTENSIONS_LABEL}`}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {status && (
          <small role="status" style={{ color: status.ok ? "var(--color-success, #22c55e)" : "var(--color-danger, #ef4444)" }}>
            {status.text}
          </small>
        )}
        <ThemeToggle />
        <div className="profile-pill">
          <div className="avatar">{user?.name?.[0] || "A"}</div>
          <div className="profile-copy">
            <strong>{user?.name || "User"}</strong>
            <small>{user?.email || ""}</small>
          </div>
          <button type="button" className="text-button" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </header>
  );
}
