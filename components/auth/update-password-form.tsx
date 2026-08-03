"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update your password.");
      setPending(false);
    }
  };

  return (
    <div className="auth-card panel">
      <div className="panel-heading">
        <div>
          <h2>Set your password</h2>
          <p>Choose a password to finish signing in.</p>
        </div>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            disabled={pending}
          />
        </label>
        <label>
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            disabled={pending}
          />
        </label>
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </button>
        {error && <p className="auth-form-error">{error}</p>}
      </form>
    </div>
  );
}
