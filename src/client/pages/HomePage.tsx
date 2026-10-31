import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CrawlSummary } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { SaveCrawlAccount } from "../components/SaveCrawlAccount";
import { SiteFooter } from "../components/SiteFooter";
import { VerifyBanner } from "../components/VerifyBanner";
import { CityPicker, type PickedCity } from "../components/CityPicker";
import { DURATIONS, NO_DURATION_LABEL, durationLabel } from "../components/ScheduleEditor";
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
  const { user, isAdmin, logout } = useAuth();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState(defaultCountry);
  const [city, setCity] = useState<PickedCity | null>(null);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  /** "" = not set: pubs show their opening hours for the day instead of arrival estimates. */
  const [perStop, setPerStop] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Logged out: after the details, ask them to sign up (or log in) to save the crawl. */
  const [step, setStep] = useState<"details" | "account">("details");
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

  /** Saves the crawl to the (now logged-in) account and opens it. */
  async function saveCrawl() {
    const { slug, editToken } = await api.createCrawl(name.trim(), {
      countryCode,
      cityPlaceId: city?.placeId ?? null,
      sessionToken: city ? sessionToken : null,
      startsAt: startDate && startTime ? `${startDate}T${startTime}` : null,
      ...(perStop ? { minutesPerStop: Number(perStop) } : {}),
    });
    rememberCountry(countryCode);
    savedCrawls.save(slug, name.trim(), editToken);
    navigate(`/c/${slug}?tab=edit`);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!user) {
      setStep("account");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveCrawl();
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
            {isAdmin && (
              <Link to="/stats" className="text-btn">
                Stats
              </Link>
            )}
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

      {user && !user.emailVerified && <VerifyBanner className="banner home-verify" />}

      <section className="card">
        {step === "account" && !user ? (
          <SaveCrawlAccount crawlName={name.trim()} onSignedIn={saveCrawl} onBack={() => setStep("details")} />
        ) : (
          <>
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
              <div className="field">
                <span>
                  When <span className="optional">(optional)</span>
                </span>
                <div className="schedule-row">
                  <input
                    type="date"
                    aria-label="Start date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <input
                    type="time"
                    aria-label="Start time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                {(startDate && !startTime) || (!startDate && startTime) ? (
                  <span className="hint">Add both a date and a time, or leave both blank.</span>
                ) : null}
              </div>
              <label className="field">
                <span>
                  Time at each pub <span className="optional">(optional)</span>
                </span>
                <select className="select" value={perStop} onChange={(e) => setPerStop(e.target.value)}>
                  <option value="">{NO_DURATION_LABEL}</option>
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {durationLabel(m)}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Set it to estimate when you'll reach each pub. Left blank, each pub shows its opening hours that day.
                </span>
              </label>
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
              <button
                className="btn btn-primary btn-block"
                disabled={busy || !name.trim() || Boolean(startDate) !== Boolean(startTime)}
              >
                {busy ? "Pulling a pint…" : user === null ? "Continue" : "Create crawl"}
              </button>
              {error && <p className="error">{error}</p>}
              {user === null && (
                <p className="fine-print">Next, create a free account (or log in) to save your crawl and share it.</p>
              )}
            </form>
          </>
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Your crawls</h2>
        {loadingList ? (
          <p className="muted">Loading your crawls…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            {user ? "No crawls yet. Start one above." : "Log in to see your crawls, or start one above."}
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
      <SiteFooter />
    </main>
  );
}
