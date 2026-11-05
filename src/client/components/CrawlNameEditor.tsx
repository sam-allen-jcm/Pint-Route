import { useEffect, useState, type FormEvent } from "react";
import type { Crawl } from "../../shared/types";
import { api } from "../api";
import { savedCrawls } from "../storage";

/** "Crawl name" box at the top of the Edit crawl tab. */
export function CrawlNameEditor({
  crawl,
  editToken,
  onSaved,
}: {
  crawl: Crawl;
  editToken: string | null;
  onSaved: (c: Crawl) => void;
}) {
  const [name, setName] = useState(crawl.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Follow renames made elsewhere (e.g. tapping the title).
  useEffect(() => setName(crawl.name), [crawl.name]);

  const changed = name.trim() !== crawl.name && name.trim().length > 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.renameCrawl(crawl.slug, name.trim(), editToken);
      savedCrawls.rename(crawl.slug, updated.name);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack name-card" onSubmit={save}>
      <label className="field">
        <span>Crawl name</span>
        <div className="name-row">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            maxLength={80}
            autoComplete="off"
          />
          <button className="btn btn-primary btn-small" disabled={busy || !changed}>
            {busy ? "Saving…" : "Rename"}
          </button>
        </div>
      </label>
      {saved && <p className="success small">Renamed ✓</p>}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
