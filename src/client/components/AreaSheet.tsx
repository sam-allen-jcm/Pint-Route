import { useState, type FormEvent } from "react";
import type { Crawl } from "../../shared/types";
import { api } from "../api";
import { countries, defaultCountry, rememberCountry } from "../countries";
import { CityPicker, type PickedCity } from "./CityPicker";

interface Props {
  crawl: Crawl;
  editToken: string | null;
  onSaved: (crawl: Crawl) => void;
  onClose: () => void;
}

/** Bottom sheet to change a crawl's country and town/city. */
export function AreaSheet({ crawl, editToken, onSaved, onClose }: Props) {
  const current = crawl.area && !crawl.area.isCountry ? crawl.area : null;
  const [countryCode, setCountryCode] = useState(crawl.countryCode ?? defaultCountry());
  const [city, setCity] = useState<PickedCity | null>(current ? { placeId: current.placeId, label: current.name } : null);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const picked = city && city.placeId !== current?.placeId; // a newly chosen town
      const updated = await api.updateCrawlArea(
        crawl.slug,
        { countryCode, cityPlaceId: city?.placeId ?? null, sessionToken: picked ? sessionToken : null },
        editToken,
      );
      rememberCountry(countryCode);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Change town" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <h2>Where's this crawl?</h2>
        <form onSubmit={save} className="stack">
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
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-plain btn-block" onClick={onClose}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
