import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CommunityCrawl } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { SaveCrawlAccount } from "../components/SaveCrawlAccount";
import { CommunityList } from "../components/CommunityList";
import { SiteFooter } from "../components/SiteFooter";
import { TopNav } from "../components/TopNav";
import { VerifyBanner } from "../components/VerifyBanner";
import { CityPicker, type PickedCity } from "../components/CityPicker";
import { DURATIONS, NO_DURATION_LABEL, durationLabel } from "../components/ScheduleEditor";
import { countries, defaultCountry, rememberCountry } from "../countries";
import { savedCrawls } from "../storage";

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [popular, setPopular] = useState<CommunityCrawl[] | null>(null);
  const [popularCountry, setPopularCountry] = useState<string | null>(null);
  // Crawls made as a guest before accounts were required (only kept on this device).
  const deviceCrawls = user === null ? savedCrawls.list() : [];

  // Top public crawls, from the country last used on this device first.
  useEffect(() => {
    let cancelled = false;
    const home = defaultCountry();
    api
      .community({ sort: "top", country: home, limit: 5 })
      .then(async (r) => {
        if (r.crawls.length) return { crawls: r.crawls, country: home };
        return { crawls: (await api.community({ sort: "top", limit: 5 })).crawls, country: null };
      })
      .then((r) => {
        if (cancelled) return;
        setPopular(r.crawls);
        setPopularCountry(r.country);
      })
      .catch(() => !cancelled && setPopular([]));
    return () => {
      cancelled = true;
    };
  }, []);

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
      <TopNav />

      <header className="hero">
        <div className="sign">
          <span className="sign-est">Est. tonight</span>
          <h1>Pint Route</h1>
          <span className="sign-sub">Pub crawls, properly planned</span>
          <span className="sign-hi">Hi Mr G 👋</span>
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

      {user && (
        <Link to="/account" className="crawl-link my-crawls-link">
          <span className="crawl-link-text">
            <span className="crawl-link-name">My crawls</span>
            <span className="crawl-link-detail">Edit, share, delete or make your crawls public</span>
          </span>
          <span className="chev" aria-hidden>
            ›
          </span>
        </Link>
      )}

      <section className="stack">
        <div className="section-head">
          <h2 className="section-title">
            Popular in the community
            {popularCountry && (
              <span className="muted small"> · {countries().find((c) => c.code === popularCountry)?.name}</span>
            )}
          </h2>
          <Link to="/community" className="text-btn">
            See all ›
          </Link>
        </div>
        {popular === null ? (
          <p className="muted">Loading…</p>
        ) : popular.length === 0 ? (
          <p className="muted">
            No public crawls yet. Make one of yours public and it'll show up here for everyone to rate and copy.
          </p>
        ) : (
          <CommunityList crawls={popular} />
        )}
      </section>

      {deviceCrawls.length > 0 && (
        <section className="stack device-crawls">
          <h2 className="section-title">On this device</h2>
          <ul className="crawl-list">
            {deviceCrawls.map((c) => (
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
          <p className="muted small">
            <Link to="/login">Log in</Link> or <Link to="/register">sign up</Link> to move these into an account, so you
            don't lose them.
          </p>
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
