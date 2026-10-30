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
  // The meeting time is the crawl's start time (one value, also editable under "When").
  const [date, setDate] = useState(crawl.startsAt?.slice(0, 10) ?? "");
  const [time, setTime] = useState(crawl.startsAt?.slice(11, 16) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startsAt = date && time ? `${date}T${time}` : null;
  const halfTime = Boolean(date) !== Boolean(time);
  const placeChanged = (place?.placeId ?? null) !== (current?.placeId ?? null);
  const timeChanged = startsAt !== crawl.startsAt;

  async function patch(body: Parameters<typeof api.patchCrawl>[1]) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.patchCrawl(crawl.slug, body, editToken));
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!place || halfTime) return;
    if (!placeChanged && !timeChanged) return onClose();
    patch({
      ...(placeChanged ? { meetPlaceId: place.placeId, sessionToken } : {}),
      ...(timeChanged ? { startsAt } : {}),
    });
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
          <div className="field">
            <span>
              Meeting time <span className="optional">(optional)</span>
            </span>
            <div className="schedule-row">
              <input type="date" aria-label="Meeting date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input type="time" aria-label="Meeting time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <span className="hint">
              {halfTime
                ? "Add both a date and a time, or leave both blank."
                : "This is when the crawl starts. Arrival times at each pub are worked out from it."}
            </span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy || !place || halfTime}>
            {busy ? "Saving…" : "Save"}
          </button>
          {current && (
            <button
              type="button"
              className="btn btn-plain btn-block danger-text"
              disabled={busy}
              onClick={() => patch({ meetPlaceId: null })}
            >
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
