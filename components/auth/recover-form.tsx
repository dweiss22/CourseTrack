"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password setup/reset link has been sent.";

export function RecoverForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const supabase = await createSupabaseBrowserClient();
      // Never branch UI on the result -- this must not reveal whether the
      // email address has an account.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });
    } catch {
      // Intentionally swallowed for the same reason.
    } finally {
      setPending(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="auth-card panel">
      <div className="panel-heading">
        <div>
          <h2>Reset your password</h2>
          <p>Enter your email and we&apos;ll send you a link to set or reset your password.</p>
        </div>
      </div>
      {submitted ? (
        <p className="auth-generic-message">{GENERIC_MESSAGE}</p>
      ) : (
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
          <button type="submit" className="button button-primary" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <Link href="/login" className="auth-secondary-link">
        Back to sign in
      </Link>
    </div>
  );
}
