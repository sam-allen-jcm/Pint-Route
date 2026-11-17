import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Town = { name: string; slug: string; count: number };

/** "Browse by town": every town in the directory, A–Z, with a filter box. */
export function TownList() {
  const [towns, setTowns] = useState<Town[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .venueTowns()
      .then(setTowns)
      .catch((err: Error) => setError(err.message));
  }, []);

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const shown = (towns ?? []).filter((t) => !f || t.name.toLowerCase().includes(f));
    const byLetter = new Map<string, Town[]>();
    for (const t of shown) {
      const letter = /[a-z]/i.test(t.name[0]) ? t.name[0].toUpperCase() : "#";
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), t]);
    }
    return [...byLetter.entries()];
  }, [towns, filter]);

  if (error) return <p className="error small">{error}</p>;
  if (!towns) return <p className="muted small">Loading towns…</p>;
  if (!towns.length) return <p className="muted small">No towns yet: pubs appear here once an area is imported.</p>;

  return (
    <section className="stack town-section" aria-labelledby="towns-title">
      <div className="section-head">
        <h2 id="towns-title" className="section-title">
          Browse by town
        </h2>
        <span className="muted small">{towns.length} towns</span>
      </div>
      {towns.length > 12 && (
        <input
          type="search"
          className="town-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter towns, e.g. Reading"
          aria-label="Filter towns"
        />
      )}
      {groups.length === 0 ? (
        <p className="muted small">No towns match "{filter}".</p>
      ) : (
        groups.map(([letter, list]) => (
          <div key={letter} className="town-group">
            {groups.length > 1 && <h3 className="town-letter">{letter}</h3>}
            <ul className="town-list">
              {list.map((t) => (
                <li key={t.slug}>
                  <Link to={`/pubs/${t.slug}`}>
                    {t.name} <span className="muted">({t.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
