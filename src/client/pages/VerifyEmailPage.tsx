import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthShell } from "./PasswordResetPages";

// The token arrives in the URL fragment (#token=…). Read it once and clear it
// from the address bar so it isn't left in history.
let pendingToken: string | null = null;
function takeToken(): string | null {
  const match = location.hash.match(/^#token=([A-Za-z0-9_-]{20,100})$/);
  if (match) {
    pendingToken = match[1];
    history.replaceState(null, "", location.pathname);
  }
  return pendingToken;
}

// One request per token, even under React StrictMode's double effects.
const attempts = new Map<string, Promise<unknown>>();

/** The link in the "Confirm your email" message lands here. */
export function VerifyEmailPage() {
  const { refresh } = useAuth();
  const [token] = useState(takeToken);
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let p = attempts.get(token);
    if (!p) {
      p = api.verifyEmail(token);
      attempts.set(token, p);
    }
    let cancelled = false;
    p.then(
      async () => {
        await refresh();
        if (!cancelled) setState("done");
      },
      (err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setState("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  if (state === "working") {
    return (
      <AuthShell title="Confirming your email…" lead="" backToLogin={false}>
        <p className="muted">One moment.</p>
      </AuthShell>
    );
  }
  if (state === "done") {
    return (
      <AuthShell title="Email confirmed 🍻" lead="" backToLogin={false}>
        <div className="stack">
          <p>Thanks! Your crawls can now be shared, and anyone with the link can follow along.</p>
          <Link className="btn btn-primary btn-block" to="/">
            Go to my crawls
          </Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Link not valid" lead="" backToLogin={false}>
      <div className="stack">
        <p>
          {error ?? "This confirmation link is incomplete or has already been used."} Links expire after 3 days. Log in
          and use "Resend email" to get a new one.
        </p>
        <Link className="btn btn-primary btn-block" to="/">
          Back to Pint Route
        </Link>
      </div>
    </AuthShell>
  );
}
