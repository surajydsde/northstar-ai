"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-context";

export type AuthMode = "login" | "signup";

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true); setError(null);
    try { if (isLogin) await login(email, password); else await signup(name, email, password); router.push("/"); }
    catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "Unable to authenticate"); }
    finally { setIsSubmitting(false); }
  }

  return <main className="auth-page shell"><div className="auth-shell"><section className="auth-hero"><div className="brand-row"><div className="brand-mark">N</div><span>Northstar AI</span></div><h1>{isLogin ? "Welcome back" : "Create your workspace"}</h1><p>{isLogin ? "Continue where you left off and keep your ideas moving." : "Set up a new workspace for faster thinking, writing, and planning."}</p><div className="auth-features"><div><strong>Instant answers</strong><span>AI-generated summaries and brainstorming</span></div><div><strong>Shared context</strong><span>Keep your threads organized and actionable</span></div><div><strong>Focused work</strong><span>Design, write, and decide with less friction</span></div></div></section><section className="auth-card"><div className="auth-card-header"><h2>{isLogin ? "Sign in" : "Create account"}</h2><Link href={isLogin ? "/signup" : "/login"} className="text-link">{isLogin ? "Need an account?" : "Already have one?"}</Link></div><form className="auth-form" onSubmit={handleSubmit}>{!isLogin && <label><span>Full name</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Avery Brooks" /></label>}<label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label><button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Please wait..." : isLogin ? "Sign in" : "Create account"}</button>{error && <p className="form-error" role="alert">{error}</p>}</form></section></div></main>;
}
