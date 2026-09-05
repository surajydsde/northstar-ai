import { useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import type { AuthUser } from "@/features/auth/auth-context";

type AppHeaderProps = { title: string; subtitle?: string; user: AuthUser | null; onLogout: () => void };

export function AppHeader({ title, subtitle, user, onLogout }: AppHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "Upload failed");
      setUploadMessage(body.message || "Uploaded");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Upload failed");
    } finally { setUploading(false); }
  }

  return <header className="topbar">
    <div className="topbar-copy"><span>{subtitle || "Workspace"}</span><h1>{title}</h1></div>
    <div className="topbar-actions">
      <input ref={fileInputRef} type="file" accept="text/*,.md,.csv,.json" hidden onChange={handleUpload} />
      <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? "Uploading..." : "Upload"}</button>
      {uploadMessage && <small role="status">{uploadMessage}</small>}
      <ThemeToggle />
      <div className="profile-pill"><div className="avatar">{user?.name?.[0] || "A"}</div><div className="profile-copy"><strong>{user?.name || "User"}</strong><small>{user?.email || ""}</small></div><button type="button" className="text-button" onClick={onLogout}>Log out</button></div>
    </div>
  </header>;
}
