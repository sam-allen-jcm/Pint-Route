import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CrawlSummary } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { CityPicker, type PickedCity } from "../components/CityPicker";
import { countries, defaultCountry, rememberCountry } from "../countries";
import { savedCrawls } from "../storage";

interface ListItem {
  slug: string;
  name: string;
  detail: string | null;
  deviceOnly: boolean;
}

function summaryDetail(c: CrawlSummary): string {
  if (c.stopCount === 0) return "No stops yet";
  const stops = `${c.stopCount} ${c.stopCount === 1 ? "stop" : "stops"}`;
  return c.visitedCount ? `${stops} · ${c.visitedCount} visited` : stops;
}

export function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState(defaultCountry);
  const [city, setCity] = useState<PickedCity | null>(null);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCrawls, setAccountCrawls] = useState<CrawlSummary[] | null>(null);

  useEffect(() => {
    if (!user) {
      setAccountCrawls(null);
      return;
    }
    let cancelled = false;
    api
      .myCrawls()
      .then((list) => !cancelled && setAccountCrawls(list))
      .catch(() => !cancelled && setAccountCrawls([]));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Account crawls first, then any still only saved on this device.
  const inAccount = new Set(accountCrawls?.map((c) => c.slug));
  const items: ListItem[] = [
    ...(accountCrawls ?? []).map((c) => ({ slug: c.slug, name: c.name, detail: summaryDetail(c), deviceOnly: false })),
    ...savedCrawls
      .list()
      .filter((c) => !inAccount.has(c.slug))
      .map((c) => ({ slug: c.slug, name: c.name, detail: null, deviceOnly: Boolean(user) })),
  ];
  const loadingList = Boolean(user) && accountCrawls === null;

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { slug, editToken } = await api.createCrawl(name.trim(), {
        countryCode,
        cityPlaceId: city?.placeId ?? null,
        sessionToken: city ? sessionToken : null,
      });
      rememberCountry(countryCode);
      savedCrawls.save(slug, name.trim(), editToken);
      navigate(`/c/${slug}?tab=add`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <nav className="account-bar" aria-label="Account">
        {user === undefined ? (
          <span />
        ) : user ? (
          <>
            <span className="account-name">
              Hi, <strong>{user.name}</strong>
            </span>
            <button className="text-btn" onClick={() => logout()}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="text-btn">
              Log in
            </Link>
            <Link to="/register" className="btn btn-small btn-ghost">
              Sign up
            </Link>
          </>
        )}
      </nav>

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
            <span>Country</span>
            <select className="select" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              {countries().map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>
              Town or city <span className="optional">(optional)</span>
            </span>
            <CityPicker countryCode={countryCode} value={city} onChange={setCity} sessionToken={sessionToken} />
          </div>
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
        {loadingList ? (
          <p className="muted">Loading your crawls…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            {user
              ? "No crawls yet. Start one above."
              : "Crawls you create on this device appear here. Anyone you share a link with can view it, but only this browser can edit it."}
          </p>
        ) : (
          <ul className="crawl-list">
            {items.map((c) => (
              <li key={c.slug}>
                <Link to={`/c/${c.slug}`} className="crawl-link">
                  <span className="crawl-link-text">
                    <span className="crawl-link-name">{c.name}</span>
                    {(c.detail || c.deviceOnly) && (
                      <span className="crawl-link-detail">
                        {c.detail}
                        {c.deviceOnly && "On this device only"}
                      </span>
                    )}
                  </span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {user === null && items.length > 0 && (
          <p className="muted small">
            <Link to="/register">Create an account</Link> to keep these crawls if you lose or change your phone.
          </p>
        )}
      </section>
    </main>
  );
}
