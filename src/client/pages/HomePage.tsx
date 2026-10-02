import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { savedCrawls } from "../storage";

export function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = savedCrawls.list();

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { slug, editToken } = await api.createCrawl(name.trim());
      savedCrawls.save(slug, name.trim(), editToken);
      navigate(`/c/${slug}?tab=add`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <header className="hero">
        <div className="sign">
          <span className="sign-est">Est. tonight</span>
          <h1>Pint Route</h1>
          <span className="sign-sub">Pub crawls, properly planned</span>
        </div>
      </header>

      <section className="card">
        <h2>Start a new crawl</h2>
        <form onSubmit={create} className="stack">
          <label className="field">
            <span>Crawl name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday in Soho"
              maxLength={80}
              autoComplete="off"
              required
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
            {busy ? "Pulling a pint…" : "Create crawl"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="stack">
        <h2 className="section-title">Your crawls</h2>
        {mine.length === 0 ? (
          <p className="muted">
            Crawls you create on this device appear here. Anyone you share a link with can view it, but only this
            browser can edit it.
          </p>
        ) : (
          <ul className="crawl-list">
            {mine.map((c) => (
              <li key={c.slug}>
                <Link to={`/c/${c.slug}`} className="crawl-link">
                  <span className="crawl-link-name">{c.name}</span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
