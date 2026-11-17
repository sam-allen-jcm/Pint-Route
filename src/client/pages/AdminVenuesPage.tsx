import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { FsaAuthority } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { TopNav } from "../components/TopNav";

/**
 * Admin: load pubs from the Food Standards Agency into our venue directory, one
 * council area at a time (each import is one request, so it can't time out).
 */
export function AdminVenuesPage() {
  const { user, isAdmin } = useAuth();
  const [authorities, setAuthorities] = useState<FsaAuthority[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .fsaAuthorities()
      .then(setAuthorities)
      .catch((err: Error) => setError(err.message));
  }, [isAdmin]);

  const shown = useMemo(
    () => (authorities ?? []).filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase())),
    [authorities, filter],
  );
  const imported = (authorities ?? []).filter((a) => a.importedAt);
  const totalVenues = imported.reduce((n, a) => n + a.venueCount, 0);

  async function importOne(a: FsaAuthority): Promise<boolean> {
    setBusy(a.id);
    try {
      const r = await api.importAuthority(a.id);
      setLog((l) => [
        `${r.name}: ${r.total} venues (${r.added} new, ${r.updated} updated${r.closed ? `, ${r.closed} gone` : ""})`,
        ...l,
      ]);
      setAuthorities(
        (list) =>
          list?.map((x) => (x.id === a.id ? { ...x, importedAt: new Date().toISOString(), venueCount: r.total } : x)) ??
          null,
      );
      return true;
    } catch (err) {
      setLog((l) => [`${a.name}: failed: ${(err as Error).message}`, ...l]);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function importAll(onlyNew: boolean) {
    const queue = (authorities ?? []).filter((a) => !onlyNew || !a.importedAt);
    if (!queue.length) return;
    if (!window.confirm(`Import ${queue.length} council areas? This takes a while; keep this page open.`)) return;
    stopRef.current = false;
    setRunningAll(true);
    for (const a of queue) {
      if (stopRef.current) break;
      const ok = await importOne(a);
      if (!ok && !window.confirm("That one failed. Carry on with the rest?")) break;
    }
    setRunningAll(false);
  }

  if (user === undefined) return <main className="page center muted">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="page narrow center">
        <div className="empty">
          <h1>Not available</h1>
          <p className="muted">This page is only for the Pint Route team.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <TopNav brand />
      <header className="community-header">
        <h1>Pub database</h1>
        <p className="muted small">
          Load pubs, bars and clubs from the Food Standards Agency's food hygiene data, one council area at a time.
          Re-importing an area refreshes it, and marks venues that have left the register as closed.{" "}
          <Link to="/pubs">Search the directory ›</Link>
        </p>
        <p className="small">
          <strong>{imported.length}</strong> of {authorities?.length ?? "…"} areas imported ·{" "}
          <strong>{totalVenues.toLocaleString()}</strong> venues
        </p>
      </header>

      <div className="public-actions">
        <button
          className="btn btn-primary btn-small"
          onClick={() => importAll(true)}
          disabled={runningAll || busy !== null}
        >
          Import all areas not yet imported
        </button>
        {runningAll ? (
          <button className="text-btn danger" onClick={() => (stopRef.current = true)}>
            Stop after this one
          </button>
        ) : (
          <button className="text-btn" onClick={() => importAll(false)} disabled={busy !== null}>
            Refresh every area
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {log.length > 0 && (
        <ol className="import-log" aria-live="polite">
          {log.slice(0, 8).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}

      <label className="field admin-filter">
        <span>Find a council area</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g. Reading" />
      </label>

      {!authorities ? (
        !error && <p className="muted">Loading council areas from the Food Standards Agency…</p>
      ) : (
        <ul className="authority-list">
          {shown.map((a) => (
            <li key={a.id} className="account-row">
              <span className="account-row-label">
                {a.name}
                <small>
                  {a.importedAt
                    ? `${a.venueCount} venues · imported ${new Date(a.importedAt).toLocaleDateString("en-GB")}`
                    : "Not imported yet"}
                </small>
              </span>
              <button className="text-btn" onClick={() => importOne(a)} disabled={busy !== null || runningAll}>
                {busy === a.id ? "Importing…" : a.importedAt ? "Refresh" : "Import"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
