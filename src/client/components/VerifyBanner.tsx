import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

/**
 * Reminds a logged-in user to confirm their email. Until they do, their crawls
 * work for them but can't be opened by anyone else through the share link.
 */
export function VerifyBanner({ className = "banner" }: { className?: string }) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!user || user.emailVerified) return null;

  async function resend() {
    setState("sending");
    setError(null);
    try {
      const r = await api.resendVerification();
      if (r.alreadyVerified) await refresh();
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <div className={`${className} banner-verify`} role="status">
      <p>
        📧 <strong>Confirm your email to share your crawls.</strong> We sent a link to <strong>{user.email}</strong>.
        Until you click it, only you can see your crawls.
      </p>
      <p className="banner-actions">
        {state === "sent" ? (
          <span className="muted small">Sent! Check your inbox (and spam folder).</span>
        ) : (
          <button className="text-btn" onClick={resend} disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Resend email"}
          </button>
        )}
        <button className="text-btn" onClick={() => refresh()}>
          I've confirmed it
        </button>
      </p>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
