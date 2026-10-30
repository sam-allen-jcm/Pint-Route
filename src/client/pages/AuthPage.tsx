import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";

/** Only allow redirects back into this app (no open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={next} replace />;

  const isRegister = mode === "register";
  const switchTo = `${isRegister ? "/login" : "/register"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <header className="auth-header">
        <Link to="/" className="auth-brand">
          🍺 Pint Route
        </Link>
      </header>

      <section className="card">
        <h1 className="auth-title">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="muted small auth-lead">
          {isRegister
            ? "Save your crawls and pick them up on any device."
            : "Log in to see your crawls on this device."}
        </p>

        <form onSubmit={submit} className="stack" noValidate>
          {isRegister && (
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={40}
                required
              />
            </label>
          )}
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
          <label className="field">
            <span>Password</span>
            <div className="password-row">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? 8 : undefined}
                maxLength={200}
                required
              />
              <button
                type="button"
                className="text-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {isRegister && <span className="hint">At least 8 characters</span>}
          </label>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn btn-primary btn-block"
            disabled={busy || !email.trim() || !password || (isRegister && !name.trim())}
          >
            {busy ? "One moment…" : isRegister ? "Create account" : "Log in"}
          </button>
        </form>
      </section>

      <p className="center-text">
        {isRegister ? "Already have an account? " : "New to Pint Route? "}
        <Link to={switchTo}>{isRegister ? "Log in" : "Create an account"}</Link>
      </p>
      <p className="center-text small muted">
        <Link to="/">Continue without an account</Link>
      </p>
    </main>
  );
}
