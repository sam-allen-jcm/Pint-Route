import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { StatsResponse } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { countries } from "../countries";

const RANGES = [7, 30, 90] as const;

/** Daily charts: one metric each (small multiples, one hue). */
const CHARTS: { title: string; events: string[] }[] = [
  { title: "Crawls created", events: ["crawl_created"] },
  { title: "Pubs added", events: ["stop_added"] },
  { title: "Pubs ticked off", events: ["stop_visited"] },
  { title: "Shared crawls opened", events: ["shared_view"] },
  { title: "Searches", events: ["search", "search_near_me"] },
  { title: "Sign-ups", events: ["signup_total"] },
];

/** Friendly names for the events table. */
const EVENT_LABELS: Record<string, string> = {
  crawl_created: "Crawl created",
  crawl_created_with_town: "Crawl created with a town",
  crawl_created_logged_in: "Crawl created while logged in",
  crawl_renamed: "Crawl renamed",
  crawl_area_changed: "Crawl town changed",
  crawl_deleted: "Crawl deleted",
  meeting_point_set: "Meeting point set",
  meeting_point_removed: "Meeting point removed",
  stop_added: "Pub added",
  stop_removed: "Pub removed",
  stops_reordered: "Pubs reordered",
  stop_visited: "Pub ticked off",
  stop_unvisited: "Pub un-ticked",
  note_saved: "Note saved",
  search: "Search (typed)",
  search_near_me: "Search (near me)",
  shared_view: "Shared crawl opened",
  share_opened: "Share sheet opened",
  share_link_shared: "Share link sent/copied",
  edit_link_copied: "Private edit link copied",
  map_viewed: "Map tab opened",
  signup: "Sign-up",
  signup_total: "New accounts",
  login: "Log in",
  login_failed: "Failed log in",
  password_reset_requested: "Password reset requested",
  password_reset_completed: "Password reset completed",
};

const fmt = (n: number) => n.toLocaleString();
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function sumSeries(stats: StatsResponse, events: string[]): number[] {
  return stats.days.map((_, i) => events.reduce((n, e) => n + (stats.series[e]?.[i] ?? 0), 0));
}

export function StatsPage() {
  const { user, isAdmin } = useAuth();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setError(null);
    api
      .stats(days)
      .then((s) => !cancelled && setStats(s))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [days, isAdmin]);

  if (user === undefined) return <main className="page center muted">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="page narrow center">
        <div className="empty">
          <h1>Not available</h1>
          <p className="muted">This page is only for the Pint Route team.</p>
          <Link className="btn btn-primary" to={user ? "/" : "/login?next=/stats"}>
            {user ? "Back to Pint Route" : "Log in"}
          </Link>
        </div>
      </main>
    );
  }

  const countryName = new Map(countries().map((c) => [c.code, c.name]));

  return (
    <main className="page stats">
      <header className="stats-header">
        <Link to="/" className="auth-brand">
          🍺 Pint Route
        </Link>
        <h1>Usage stats</h1>
        <p className="muted small">
          Anonymous counts of what people do in the app. Visitors, page views and traffic sources are in{" "}
          <a href="https://dash.cloudflare.com/?to=/:account/web-analytics" target="_blank" rel="noreferrer">
            Cloudflare Web Analytics
          </a>
          .
        </p>
        <div className="segmented" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} className={r === days ? "on" : ""} aria-pressed={r === days} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {!stats ? (
        !error && <p className="muted">Loading stats…</p>
      ) : (
        <>
          <section aria-label="All-time totals">
            <h2 className="stats-h2">All time</h2>
            <div className="tiles">
              <Tile label="Accounts" value={stats.totals.users} />
              <Tile label="Crawls" value={stats.totals.crawls} />
              <Tile label="Pubs added" value={stats.totals.stops} />
              <Tile label="Pubs ticked off" value={stats.totals.visited} />
              <Tile label="Crawls opened via a share link" value={stats.totals.shared} />
            </div>
          </section>

          <section className="card stats-card">
            <h2 className="stats-h2">What happens to new crawls</h2>
            <p className="muted small">Crawls created in the last {days} days, and how far they got.</p>
            <Funnel
              steps={[
                ["Created", stats.funnel.created],
                ["Added a pub", stats.funnel.withStop],
                ["Added 2+ pubs", stats.funnel.withTwo],
                ["Opened by someone else", stats.funnel.shared],
                ["Ticked off a pub", stats.funnel.visited],
              ]}
            />
          </section>

          <section aria-label="Daily activity">
            <h2 className="stats-h2">Daily activity</h2>
            <div className="chart-grid">
              {CHARTS.map((c) => (
                <DailyChart key={c.title} title={c.title} days={stats.days} values={sumSeries(stats, c.events)} />
              ))}
            </div>
          </section>

          <div className="stats-two">
            <section className="card stats-card">
              <h2 className="stats-h2">Top countries</h2>
              <p className="muted small">New crawls, last {days} days</p>
              <RankTable rows={stats.countries.map((c) => [countryName.get(c.code) ?? c.code, c.count])} empty="No crawls yet" />
            </section>
            <section className="card stats-card">
              <h2 className="stats-h2">Top towns</h2>
              <p className="muted small">New crawls with a town chosen, last {days} days</p>
              <RankTable rows={stats.areas.map((a) => [a.name, a.count])} empty="No towns chosen yet" />
            </section>
          </div>

          <section className="card stats-card">
            <h2 className="stats-h2">All events</h2>
            <p className="muted small">Totals for the last {days} days</p>
            <RankTable
              rows={Object.entries(stats.series)
                .filter(([e]) => e !== "signup_total") // same as "Sign-up"
                .map(([e, v]) => [EVENT_LABELS[e] ?? e, v.reduce((a, b) => a + b, 0)] as [string, number])
                .sort((a, b) => b[1] - a[1])}
              empty="Nothing recorded yet"
            />
          </section>
        </>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{fmt(value)}</div>
    </div>
  );
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const top = steps[0][1];
  return (
    <ol className="funnel">
      {steps.map(([label, value]) => {
        const pct = top ? Math.round((value / top) * 100) : 0;
        return (
          <li key={label} className="funnel-row">
            <span className="funnel-label">{label}</span>
            <span className="funnel-track">
              <span className="funnel-bar" style={{ width: `${top ? Math.max((value / top) * 100, value ? 1.5 : 0) : 0}%` }} />
              <span className="funnel-value">
                {fmt(value)}
                {label !== steps[0][0] && top > 0 && <span className="muted"> · {pct}%</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Single-series column chart with a hover/tap readout. */
function DailyChart({ title, days, values }: { title: string; days: string[]; values: number[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values, 0);
  const scale = max || 1;
  return (
    <figure className="card chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout" aria-live="polite">
          {active === null ? (
            <>
              <strong>{fmt(total)}</strong> total
            </>
          ) : (
            <>
              {dayLabel(days[active])}: <strong>{fmt(values[active])}</strong>
            </>
          )}
        </span>
      </figcaption>
      <div className="chart-plot" onMouseLeave={() => setActive(null)}>
        <span className="chart-max">{fmt(max)}</span>
        <div className="chart-cols">
          {values.map((v, i) => (
            <button
              key={days[i]}
              type="button"
              className={`col ${active === i ? "on" : ""}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={`${dayLabel(days[i])}: ${v}`}
            >
              <span className="col-bar" style={{ height: v ? `${Math.max((v / scale) * 100, 3)}%` : 0 }} />
            </button>
          ))}
        </div>
      </div>
      <div className="chart-axis">
        <span>{dayLabel(days[0])}</span>
        <span>{dayLabel(days[days.length - 1])}</span>
      </div>
    </figure>
  );
}

function RankTable({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <table className="rank-table">
      <tbody>
        {rows.map(([name, count]) => (
          <tr key={name}>
            <td>{name}</td>
            <td className="num">{fmt(count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
