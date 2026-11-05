import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CommunityCrawl } from "../../shared/types";
import { api } from "../api";
import { CommunityList } from "../components/CommunityList";
import { SiteFooter } from "../components/SiteFooter";
import { TopNav } from "../components/TopNav";
import { countries } from "../countries";

/** Public crawls that anyone can browse, rate (when logged in) and copy. */
export function CommunityPage() {
  const [params, setParams] = useSearchParams();
  const sort = params.get("sort") === "new" ? "new" : "top";
  const country = params.get("country") ?? "";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  const [crawls, setCrawls] = useState<CommunityCrawl[] | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) update("q", search.trim());
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setCrawls(null);
    setError(null);
    api
      .community({ sort, country, q })
      .then((r) => {
        if (cancelled) return;
        setCrawls(r.crawls);
        setNextPage(r.nextPage);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [sort, country, q]);

  async function more() {
    if (nextPage === null) return;
    setLoadingMore(true);
    try {
      const r = await api.community({ sort, country, q, page: nextPage });
      setCrawls((list) => [...(list ?? []), ...r.crawls]);
      setNextPage(r.nextPage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="page narrow">
      <TopNav brand />
      <header className="community-header">
        <h1>Community crawls</h1>
        <p className="muted small">
          Pub crawls people have made public. Open one to see the route, rate it, or copy it to plan your own night.
        </p>
      </header>

      <div className="segmented" role="group" aria-label="Sort">
        <button className={sort === "top" ? "on" : ""} aria-pressed={sort === "top"} onClick={() => update("sort", "")}>
          Top rated
        </button>
        <button
          className={sort === "new" ? "on" : ""}
          aria-pressed={sort === "new"}
          onClick={() => update("sort", "new")}
        >
          Newest
        </button>
      </div>

      <div className="community-filters">
        <label className="field">
          <span>Country</span>
          <select className="select" value={country} onChange={(e) => update("country", e.target.value)}>
            <option value="">All countries</option>
            {countries().map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field search-field">
          <span>Search by name</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Shoreditch, birthday, real ale"
            maxLength={60}
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {!crawls ? (
        !error && <p className="muted">Loading crawls…</p>
      ) : crawls.length === 0 ? (
        <p className="muted">
          {q || country ? "No public crawls match that yet." : "No public crawls yet."} Make one of yours public from
          its Edit crawl tab, or from My account.
        </p>
      ) : (
        <>
          <CommunityList crawls={crawls} />
          {nextPage !== null && (
            <button className="btn btn-ghost btn-block load-more" onClick={more} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}
      <SiteFooter />
    </main>
  );
}
