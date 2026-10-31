import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";

interface Props {
  crawlName: string;
  /** Called once the person is signed up or logged in; it creates the crawl. */
  onSignedIn: () => Promise<void>;
  onBack: () => void;
}

/**
 * Step 2 of starting a crawl when logged out: create a free account (or log in)
 * so the crawl is saved to it. New accounts then get a "confirm your email" message.
 */
export function SaveCrawlAccount({ crawlName, onSignedIn, onBack }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    try {
      await onSignedIn();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div className="account-step-head">
        <h2>{isRegister ? "Save your crawl" : "Log in to save your crawl"}</h2>
        <button type="button" className="text-btn" onClick={onBack} disabled={busy}>
          ‹ Back
        </button>
      </div>
      <p className="muted small">
        {isRegister ? (
          <>
            Create a free account to save <strong>{crawlName}</strong>, edit it from any device and share it with your
            group. We'll email you a link to confirm your address before it can be shared.
          </>
        ) : (
          <>
            <strong>{crawlName}</strong> will be saved to your account.
          </>
        )}
      </p>

      {isRegister && (
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} required />
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
      {!isRegister && (
        <Link to="/forgot-password" className="forgot-link">
          Forgot password?
        </Link>
      )}

      {isRegister && (
        <label className="check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
          <span>
            I'm of legal drinking age where I live (18+ in the UK) and I agree to the{" "}
            <Link to="/terms" target="_blank">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link to="/privacy" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button
        className="btn btn-primary btn-block"
        disabled={busy || !email.trim() || !password || (isRegister && (!name.trim() || !agreed || password.length < 8))}
      >
        {busy ? "Pulling a pint…" : isRegister ? "Create account and save crawl" : "Log in and save crawl"}
      </button>
      <p className="center-text small">
        {isRegister ? "Already have an account? " : "New to Pint Route? "}
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setMode(isRegister ? "login" : "register");
            setError(null);
          }}
        >
          {isRegister ? "Log in instead" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
