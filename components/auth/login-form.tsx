"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error(signInError.message);

      const accessResponse = await fetch("/api/auth/access", { cache: "no-store" });
      const access = (await accessResponse.json().catch(() => ({}))) as {
        landingPath?: string;
        message?: string;
      };
      if (!accessResponse.ok) {
        await supabase.auth.signOut();
        throw new Error(access.message ?? "CourseTrack could not verify your application access.");
      }

      const requestedPath = searchParams.get("return_to");
      router.push(requestedPath ? safeReturnTo(requestedPath) : (access.landingPath ?? "/"));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not sign in.");
      setPending(false);
    }
  };

  return (
    <div className="auth-card panel">
      <div className="panel-heading">
        <div>
          <h2>Sign in to CourseTrack</h2>
          <p>Access is by invitation only. Contact an administrator if you need an account.</p>
        </div>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="auth-form-error">{error}</p>}
      </form>
      <Link href="/recover" className="auth-secondary-link">
        Forgot your password?
      </Link>
    </div>
  );
}
