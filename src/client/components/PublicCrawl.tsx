import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MIN_PUBLIC_STOPS, type Crawl } from "../../shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { LEGAL } from "../legal/config";
import { savedCrawls } from "../storage";
import { RatingBadge, StarInput } from "./Stars";

/** Shown to visitors of a public crawl: who made it, its rating, and Copy / Rate / Report. */
export function PublicCrawlPanel({ crawl, onChange }: { crawl: Crawl; onChange: (c: Crawl) => void }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"rate" | "copy" | "unpublish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = `/c/${crawl.slug}`;
  const loginLink = `/login?next=${encodeURIComponent(here)}`;

  async function rate(stars: number) {
    setBusy("rate");
    setError(null);
    try {
      const rating = await api.rateCrawl(crawl.slug, stars === crawl.rating.mine ? null : stars);
      onChange({ ...crawl, rating });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!user) {
      navigate(loginLink);
      return;
    }
    setBusy("copy");
    setError(null);
    try {
      const { slug, editToken } = await api.copyCrawl(crawl.slug);
      savedCrawls.save(slug, crawl.name, editToken);
      navigate(`/c/${slug}?tab=edit`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function unpublish() {
    if (!window.confirm("Remove this crawl from the Community? The owner can still see and share it.")) return;
    setBusy("unpublish");
    try {
      onChange(await api.setPublic(crawl.slug, false));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const report = `mailto:${LEGAL.email}?subject=${encodeURIComponent(`Report: crawl ${crawl.slug}`)}&body=${encodeURIComponent(
    `Crawl: ${location.origin}${here}\nWhat's wrong with it:\n`,
  )}`;

  return (
    <section className="card public-panel" aria-label="Community">
      <div className="stack">
        <div className="section-head">
          <span className="public-by">
            🌍 Public crawl
            {crawl.author && (
              <>
                {" "}
                by <strong>@{crawl.author}</strong>
              </>
            )}
          </span>
          <RatingBadge rating={crawl.rating} />
        </div>

        <div>
          {!user ? (
            <p className="small muted">
              <Link to={loginLink}>Log in</Link> to rate this crawl.
            </p>
          ) : !user.emailVerified ? (
            <p className="small muted">Confirm your email address to rate crawls.</p>
          ) : (
            <>
              <span className="small muted">
                {crawl.rating.mine ? "Your rating (tap again to remove)" : "Rate this crawl"}
              </span>
              <StarInput value={crawl.rating.mine} onChange={rate} disabled={busy === "rate"} />
            </>
          )}
        </div>

        <div className="public-actions">
          <button className="btn btn-primary btn-small" onClick={copy} disabled={busy === "copy"}>
            {busy === "copy" ? "Copying…" : user ? "Copy to my crawls" : "Log in to copy"}
          </button>
          <a className="small-link muted" href={report}>
            Report
          </a>
          {isAdmin && (
            <button className="text-btn danger" onClick={unpublish} disabled={busy === "unpublish"}>
              Unpublish (admin)
            </button>
          )}
        </div>
        <p className="small muted">
          Copying adds the same pubs, in the same order, to a new crawl of your own that you can change.
        </p>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** Owner's switch in the Edit tab: show this crawl in the Community or not. */
export function PublishCard({ crawl, onChange }: { crawl: Crawl; onChange: (c: Crawl) => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = crawl.stops.length < MIN_PUBLIC_STOPS;
  const unverified = !user?.emailVerified;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.setPublic(crawl.slug, !crawl.isPublic));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack publish-card" aria-label="Community">
      <h3 className="section-title">Community</h3>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={crawl.isPublic}
          onChange={toggle}
          disabled={busy || (!crawl.isPublic && (tooShort || unverified))}
        />
        <span>
          <strong>Make this crawl public</strong>
          <br />
          <span className="small muted">
            Lists it in the <Link to="/community">Community</Link> under <strong>@{user?.username}</strong>, where
            anyone can see the route, rate it and copy it. Your notes and ticked-off pubs are hidden from everyone who
            can't edit it, including people you've sent the link to.
          </span>
        </span>
      </label>
      {!crawl.isPublic && tooShort && (
        <p className="small muted">Add at least {MIN_PUBLIC_STOPS} pubs to make it public.</p>
      )}
      {!crawl.isPublic && !tooShort && unverified && (
        <p className="small muted">Confirm your email address to make crawls public.</p>
      )}
      {crawl.isPublic && (
        <p className="small">
          <RatingBadge rating={crawl.rating} />
          {crawl.copyCount > 0 && <span className="muted"> · copied {crawl.copyCount}×</span>}
        </p>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
