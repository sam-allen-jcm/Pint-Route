import { useState, type FormEvent } from "react";
import type { Crawl } from "../../shared/types";
import { api } from "../api";
import { PlaceAutocomplete, type PickedCity } from "./CityPicker";

interface Props {
  crawl: Crawl;
  editToken: string | null;
  onSaved: (crawl: Crawl) => void;
  onClose: () => void;
}

/** Bottom sheet to set, change or remove where the group meets before stop 1. */
export function MeetingPointSheet({ crawl, editToken, onSaved, onClose }: Props) {
  const current = crawl.meetingPoint;
  const [place, setPlace] = useState<PickedCity | null>(
    current ? { placeId: current.placeId, label: current.name } : null,
  );
  const [sessionToken] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(meetPlaceId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.setMeetingPoint(crawl.slug, meetPlaceId, meetPlaceId ? sessionToken : null, editToken);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!place) return;
    if (place.placeId === current?.placeId) return onClose();
    save(place.placeId);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Meeting point" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <h2>🚩 Meeting point</h2>
        <p className="muted small">
          Where everyone meets before the first pub. It can be anywhere: a market, a station, a landmark or an address.
        </p>
        <form onSubmit={submit} className="stack">
          <div className="field">
            <span>Place</span>
            <PlaceAutocomplete
              value={place}
              onChange={setPlace}
              placeholder="e.g. Borough Market"
              noMatches="No matching places. Try adding the street or area."
              clearLabel="Clear meeting point"
              autoFocus={!current}
              fetchSuggestions={(q) =>
                api.suggestAnywhere(q, crawl.countryCode, crawl.area?.viewport ?? null, sessionToken)
              }
            />
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy || !place}>
            {busy ? "Saving…" : "Save meeting point"}
          </button>
          {current && (
            <button type="button" className="btn btn-plain btn-block danger-text" disabled={busy} onClick={() => save(null)}>
              Remove meeting point
            </button>
          )}
          <button type="button" className="btn btn-plain btn-block" onClick={onClose}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
