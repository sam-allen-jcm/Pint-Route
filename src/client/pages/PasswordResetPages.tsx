import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

function AuthShell({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="page narrow">
      <header className="auth-header">
        <Link to="/" className="auth-brand">
          🍺 Pint Route
        </Link>
      </header>
      <section className="card">
        <h1 className="auth-title">{title}</h1>
        {lead && <p className="muted small auth-lead">{lead}</p>}
        {children}
      </section>
      <p className="center-text">
        <Link to="/login">Back to log in</Link>
      </p>
    </main>
  );
}

/** Step 1: ask for the email address and send a reset link. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" lead="">
        <div className="stack">
          <p>
            If there's a Pint Route account for <strong>{sentTo}</strong>, we've sent it a link to reset the password.
            The link works once and expires in 1 hour.
          </p>
          <p className="muted small">Nothing arrived after a few minutes? Check your spam folder, or try again.</p>
          <button className="btn btn-ghost btn-block" onClick={() => setSentTo(null)}>
            Send another link
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" lead="Enter your email and we'll send you a link to choose a new one.">
      <form onSubmit={submit} className="stack" noValidate>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}

// Read once: the token arrives in the URL fragment (#token=…) and is removed
// from the address bar straight away so it isn't left in history.
let pendingToken: string | null = null;
function takeResetToken(): string | null {
  const match = location.hash.match(/^#token=([A-Za-z0-9_-]{20,100})$/);
  if (match) {
    pendingToken = match[1];
    history.replaceState(null, "", location.pathname);
  }
  return pendingToken;
}

/** Step 2: the emailed link lands here to set a new password. */
export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(takeResetToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthShell title="Link not valid" lead="">
        <div className="stack">
          <p>This reset link is incomplete or has already been used. Request a new one and use the latest email.</p>
          <Link className="btn btn-primary btn-block" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token!, password);
      pendingToken = null;
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" lead="You'll be logged in, and signed out on any other devices.">
      <form onSubmit={submit} className="stack" noValidate>
        <label className="field">
          <span>New password</span>
          <div className="password-row">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={200}
              required
            />
            <button type="button" className="text-btn" onClick={() => setShow((v) => !v)}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <span className="hint">At least 8 characters</span>
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={200}
            required
          />
          {mismatch && <span className="hint error-hint">Passwords don't match</span>}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
            {error.includes("expired") && (
              <>
                {" "}
                <Link to="/forgot-password">Request a new link</Link>
              </>
            )}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || password.length < 8 || password !== confirm}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
