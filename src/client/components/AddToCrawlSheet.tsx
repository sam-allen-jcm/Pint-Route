import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrawlSummary } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { savedCrawls } from "../storage";

interface Props {
  venueName: string;
  placeId: string;
  onClose: () => void;
}

/** Pick one of your crawls to add this venue to, or start a new crawl with it. */
export function AddToCrawlSheet({ venueName, placeId, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [crawls, setCrawls] = useState<CrawlSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .myCrawls()
      .then(setCrawls)
      .catch(() => setCrawls([]));
  }, [user]);

  async function addTo(slug: string) {
    setBusy(true);
    setError(null);
    try {
      await api.addStop(slug, placeId, savedCrawls.token(slug));
      navigate(`/c/${slug}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function startNew() {
    setBusy(true);
    setError(null);
    try {
      const name = `Night out at ${venueName}`.slice(0, 80);
      const { slug, editToken } = await api.createCrawl(name, {
        countryCode: "GB",
        cityPlaceId: null,
        sessionToken: null,
        startsAt: null,
      });
      savedCrawls.save(slug, name, editToken);
      // If adding the pub fails, still open the new crawl: it can be added from its Edit tab.
      await api.addStop(slug, placeId, editToken).catch(() => undefined);
      navigate(`/c/${slug}?tab=edit`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add to a crawl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <h2>Add {venueName} to a crawl</h2>
        <button className="btn btn-primary btn-block" onClick={startNew} disabled={busy}>
          {busy ? "Adding…" : "Start a new crawl here"}
        </button>
        {crawls === null ? (
          <p className="muted small">Loading your crawls…</p>
        ) : crawls.length > 0 ? (
          <>
            <p className="muted small">Or add it to one of your crawls:</p>
            <ul className="crawl-list sheet-list">
              {crawls.map((c) => (
                <li key={c.slug}>
                  <button className="crawl-link" onClick={() => addTo(c.slug)} disabled={busy}>
                    <span className="crawl-link-text">
                      <span className="crawl-link-name">{c.name}</span>
                      <span className="crawl-link-detail">
                        {c.stopCount} {c.stopCount === 1 ? "pub" : "pubs"}
                      </span>
                    </span>
                    <span className="chev" aria-hidden>
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-plain btn-block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
