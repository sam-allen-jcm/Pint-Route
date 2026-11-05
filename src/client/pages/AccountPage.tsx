import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { MIN_PUBLIC_STOPS, type CrawlSummary } from "../../shared/types";
import { usernameProblem } from "../../shared/username";
import { api } from "../api";
import { useAuth } from "../auth";
import { ShareSheet } from "../components/ShareSheet";
import { SiteFooter } from "../components/SiteFooter";
import { RatingBadge } from "../components/Stars";
import { TopNav } from "../components/TopNav";
import { VerifyBanner } from "../components/VerifyBanner";
import { savedCrawls } from "../storage";

export function AccountPage() {
  const { user } = useAuth();
  // Logged out or deleted from here: go home, not to the log-in page.
  const wasLoggedIn = useRef(false);
  if (user) wasLoggedIn.current = true;
  if (user === undefined) return <main className="page center muted">Loading…</main>;
  if (!user) return <Navigate to={wasLoggedIn.current ? "/" : "/login?next=/account"} replace />;
  return (
    <main className="page narrow">
      <TopNav brand />
      <header className="community-header">
        <h1>My account</h1>
        <p className="muted small">
          Hi <strong>{user.name}</strong>. Your public username is <strong>@{user.username}</strong>.
        </p>
      </header>
      <VerifyBanner className="banner home-verify" />
      <MyCrawls />
      <ProfileSection />
      <EmailSection />
      <PasswordSection />
      <DataSection />
      <DeleteSection />
      <SiteFooter />
    </main>
  );
}

// ---------- crawls ----------

function MyCrawls() {
  const { user } = useAuth();
  const [crawls, setCrawls] = useState<CrawlSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sharing, setSharing] = useState<CrawlSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .myCrawls()
      .then((list) => !cancelled && setCrawls(list))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePublic(c: CrawlSummary) {
    setBusy(c.slug);
    setError(null);
    try {
      const updated = await api.setPublic(c.slug, !c.isPublic);
      setCrawls((list) => list?.map((x) => (x.slug === c.slug ? { ...x, isPublic: updated.isPublic } : x)) ?? null);
    } catch (err) {
      setError(`${c.name}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: CrawlSummary) {
    if (!window.confirm(`Delete "${c.name}"? This can't be undone, and its share link will stop working.`)) return;
    setBusy(c.slug);
    setError(null);
    try {
      await api.deleteCrawl(c.slug, savedCrawls.token(c.slug));
      savedCrawls.remove(c.slug);
      setCrawls((list) => list?.filter((x) => x.slug !== c.slug) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="stack account-section" aria-labelledby="my-crawls">
      <div className="section-head">
        <h2 id="my-crawls" className="section-title">
          My crawls
        </h2>
        <Link to="/" className="text-btn">
          + New crawl
        </Link>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!crawls ? (
        !error && <p className="muted">Loading your crawls…</p>
      ) : crawls.length === 0 ? (
        <p className="muted">
          No crawls yet. <Link to="/">Start one</Link>.
        </p>
      ) : (
        <ul className="crawl-list">
          {crawls.map((c) => (
            <li key={c.slug} className="account-crawl">
              <div className="account-crawl-head">
                <Link to={`/c/${c.slug}`}>{c.name}</Link>
                <span className={`badge ${c.isPublic ? "public" : ""}`}>{c.isPublic ? "Public" : "Private"}</span>
              </div>
              <div className="crawl-link-detail">
                {c.stopCount} {c.stopCount === 1 ? "pub" : "pubs"}
                {c.visitedCount > 0 && <> · {c.visitedCount} visited</>}
                {c.isPublic && (
                  <>
                    {" · "}
                    <RatingBadge rating={c.rating} compact />
                  </>
                )}
              </div>
              <div className="account-crawl-actions">
                <Link className="text-btn" to={`/c/${c.slug}`}>
                  Open
                </Link>
                <Link className="text-btn" to={`/c/${c.slug}?tab=edit`}>
                  Edit
                </Link>
                <button className="text-btn" onClick={() => setSharing(c)}>
                  Share
                </button>
                <button
                  className="text-btn"
                  onClick={() => togglePublic(c)}
                  disabled={busy === c.slug || (!c.isPublic && c.stopCount < MIN_PUBLIC_STOPS)}
                  title={
                    !c.isPublic && c.stopCount < MIN_PUBLIC_STOPS
                      ? `Add at least ${MIN_PUBLIC_STOPS} pubs first`
                      : undefined
                  }
                >
                  {c.isPublic ? "Make private" : "Make public"}
                </button>
                <button className="text-btn danger" onClick={() => remove(c)} disabled={busy === c.slug}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {crawls && crawls.some((c) => !c.isPublic) && (
        <p className="muted small">
          Public crawls appear in the <Link to="/community">Community</Link> under @{user?.username}, where anyone can
          see the route, rate it and copy it. Your notes and ticked-off pubs stay private. Crawls need at least{" "}
          {MIN_PUBLIC_STOPS} pubs to go public.
        </p>
      )}
      {sharing && (
        <ShareSheet
          name={sharing.name}
          slug={sharing.slug}
          editToken={savedCrawls.token(sharing.slug)}
          locked={!user?.emailVerified}
          isOwner
          onClose={() => setSharing(null)}
        />
      )}
    </section>
  );
}

// ---------- settings ----------

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card stats-card account-section ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** A row showing a value, with a "Change" button that opens its form. */
function Row({ label, value, open, onOpen }: { label: string; value: ReactNode; open: boolean; onOpen: () => void }) {
  return (
    <div className="account-row">
      <span className="account-row-label">
        <small>{label}</small>
        {value}
      </span>
      {!open && (
        <button className="text-btn" onClick={onOpen}>
          Change
        </button>
      )}
    </div>
  );
}

function useForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const msg = await fn();
      if (msg) setDone(msg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run, setDone };
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  return (
    <>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="success small" role="status">
          {done}
        </p>
      )}
    </>
  );
}

function ProfileSection() {
  const { user, refresh } = useAuth();
  const [editing, setEditing] = useState<"username" | "name" | null>(null);
  const [value, setValue] = useState("");
  const form = useForm();
  if (!user) return null;

  const open = (which: "username" | "name") => {
    setEditing(which);
    setValue(which === "username" ? user.username : user.name);
    form.setDone(null);
  };
  const problem = editing === "username" && value.trim() ? usernameProblem(value.trim().replace(/^@/, "")) : null;

  function save(e: FormEvent) {
    e.preventDefault();
    form.run(async () => {
      await api.updateProfile(
        editing === "username" ? { username: value.trim().replace(/^@/, "") } : { name: value.trim() },
      );
      await refresh();
      setEditing(null);
      return "Saved ✓";
    });
  }

  return (
    <Section title="Profile">
      <Row
        label="Username (public)"
        value={<>@{user.username}</>}
        open={editing === "username"}
        onOpen={() => open("username")}
      />
      <Row label="Your name (private)" value={user.name} open={editing === "name"} onOpen={() => open("name")} />
      {editing && (
        <form onSubmit={save} className="stack">
          <label className="field">
            <span>{editing === "username" ? "New username" : "Your name"}</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={editing === "username" ? 21 : 40}
              autoCapitalize={editing === "username" ? "none" : undefined}
              spellCheck={false}
              autoFocus
            />
            <span className={`hint ${problem ? "error-hint" : ""}`}>
              {problem ??
                (editing === "username"
                  ? "Shown on your public crawls. Letters, numbers and underscores."
                  : "Only used in emails to you and when you're logged in. Never shown publicly.")}
            </span>
          </label>
          <div className="public-actions">
            <button className="btn btn-primary btn-small" disabled={form.busy || !value.trim() || Boolean(problem)}>
              {form.busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="text-btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <Feedback error={form.error} done={form.done} />
    </Section>
  );
}

function EmailSection() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const form = useForm();
  if (!user) return null;

  function save(e: FormEvent) {
    e.preventDefault();
    form.run(async () => {
      await api.changeEmail(password, email.trim());
      await refresh();
      setOpen(false);
      setPassword("");
      return `Email changed. We've sent a confirmation link to ${email.trim()}: until you click it, your crawls can't be shared.`;
    });
  }

  return (
    <Section title="Email">
      <Row
        label={user.emailVerified ? "Email (confirmed)" : "Email (not confirmed yet)"}
        value={user.email}
        open={open}
        onOpen={() => {
          setOpen(true);
          form.setDone(null);
        }}
      />
      {open && (
        <form onSubmit={save} className="stack" noValidate>
          <label className="field">
            <span>New email</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          </label>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <span className="hint">
              You'll need to confirm the new address. We'll also let your old address know it was changed.
            </span>
          </label>
          <div className="public-actions">
            <button className="btn btn-primary btn-small" disabled={form.busy || !email.trim() || !password}>
              {form.busy ? "Saving…" : "Change email"}
            </button>
            <button type="button" className="text-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <Feedback error={form.error} done={form.done} />
    </Section>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const form = useForm();
  const mismatch = confirm.length > 0 && confirm !== next;

  function save(e: FormEvent) {
    e.preventDefault();
    form.run(async () => {
      await api.changePassword(current, next);
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      return "Password changed ✓ Any other devices have been logged out.";
    });
  }

  return (
    <Section title="Password">
      <Row
        label="Password"
        value="••••••••"
        open={open}
        onOpen={() => {
          setOpen(true);
          form.setDone(null);
        }}
      />
      {open && (
        <form onSubmit={save} className="stack" noValidate>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              maxLength={200}
            />
            <span className="hint">At least 8 characters</span>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              maxLength={200}
            />
            {mismatch && <span className="hint error-hint">Passwords don't match</span>}
          </label>
          <div className="public-actions">
            <button
              className="btn btn-primary btn-small"
              disabled={form.busy || !current || next.length < 8 || next !== confirm}
            >
              {form.busy ? "Saving…" : "Change password"}
            </button>
            <button type="button" className="text-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <Feedback error={form.error} done={form.done} />
    </Section>
  );
}

function DataSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const form = useForm();

  function download() {
    form.run(async () => {
      const blob = await api.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pint-route-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "Downloaded ✓";
    });
  }

  return (
    <Section title="Your data">
      <p className="muted small">
        Download a copy of everything we hold about your account: your details, crawls, notes and ratings. See our{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <div className="public-actions">
        <button className="btn btn-ghost btn-small" onClick={download} disabled={form.busy}>
          {form.busy ? "Preparing…" : "Download my data"}
        </button>
        <button
          className="text-btn"
          onClick={async () => {
            navigate("/");
            await logout();
          }}
        >
          Log out
        </button>
      </div>
      <Feedback error={form.error} done={form.done} />
    </Section>
  );
}

function DeleteSection() {
  const { forget } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [sure, setSure] = useState(false);
  const form = useForm();

  function remove(e: FormEvent) {
    e.preventDefault();
    form.run(async () => {
      await api.deleteAccount(password);
      // Leave the page first: once the user is gone, this page would redirect to log in.
      navigate("/", { replace: true });
      forget();
    });
  }

  return (
    <Section title="Delete account" className="danger-zone">
      <p className="muted small">
        Permanently deletes your account, all your crawls (their share links stop working, and public ones leave the
        Community) and your ratings. Copies other people made of your public crawls are theirs and stay. This can't be
        undone.
      </p>
      {!open ? (
        <button className="btn btn-ghost btn-small danger-text" onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      ) : (
        <form onSubmit={remove} className="stack" noValidate>
          <label className="field">
            <span>Enter your password to confirm</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            <span>I understand my account and crawls will be deleted for good.</span>
          </label>
          <div className="public-actions">
            <button className="btn btn-danger btn-small" disabled={form.busy || !password || !sure}>
              {form.busy ? "Deleting…" : "Delete my account"}
            </button>
            <button type="button" className="text-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <Feedback error={form.error} done={form.done} />
    </Section>
  );
}
