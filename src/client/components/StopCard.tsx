import { useEffect, useState } from "react";
import type { PlaceDetails, Stop } from "../../shared/types";
import { api } from "../api";
import { formatDate, statusLabel, stripDay, todayIso } from "../format";

interface Props {
  stop: Stop;
  index: number;
  place: PlaceDetails | undefined;
  /** Can tick pubs off (has edit rights). */
  canEdit: boolean;
  /** Can add/edit notes (edit rights and logged in). */
  canNote: boolean;
  onUpdate: (patch: { visitedOn?: string | null; note?: string | null }) => Promise<void>;
}

/** A stop on the Stops tab: details, tick off, notes. Reordering/removing lives in "Edit crawl". */
export function StopCard({ stop, index, place, canEdit, canNote, onUpdate }: Props) {
  const [note, setNote] = useState(stop.note ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNote(stop.note ?? ""), [stop.note]);

  const flag = place ? statusLabel(place.businessStatus) : null;
  const closed = place && place.businessStatus !== "OPERATIONAL";
  const visited = Boolean(stop.visitedOn);

  async function save(patch: { visitedOn?: string | null; note?: string | null }) {
    setSaving(true);
    setError(null);
    try {
      await onUpdate(patch);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    setEditingNote(false);
    if ((stop.note ?? "") !== note.trim()) await save({ note: note.trim() || null });
  }

  return (
    <article className={`stop ${visited ? "stop-visited" : ""} ${closed ? "stop-closed" : ""}`}>
      <div className="stop-main">
        <div className="stop-num" aria-label={`Stop ${index + 1}`}>
          {visited ? "✓" : index + 1}
        </div>
        <div className="stop-body">
          <h3 className="stop-name">{place?.name ?? <span className="skeleton">Loading pub…</span>}</h3>
          {place && <div className="stop-address">{place.address}</div>}
          {flag && <div className="flag">⚠ {flag}</div>}
          {place && !closed && (place.openNow !== null || place.todayHours) && (
            <div className="stop-hours">
              {place.openNow !== null && (
                <span className={place.openNow ? "open" : "shut"}>{place.openNow ? "Open now" : "Closed now"}</span>
              )}
              {place.todayHours && <span className="muted"> · Today {stripDay(place.todayHours)}</span>}
            </div>
          )}
          {place?.googleMapsUri && (
            <a className="small-link" href={place.googleMapsUri} target="_blank" rel="noreferrer">
              Open in Google Maps ↗
            </a>
          )}
        </div>
        {place?.photo && (
          <figure className="stop-photo">
            <img src={api.photoUrl(place.photo.name, 240)} alt="" loading="lazy" width={84} height={84} />
            {place.photo.attributions[0] && (
              <figcaption>
                {place.photo.attributions[0].uri ? (
                  <a href={place.photo.attributions[0].uri} target="_blank" rel="noreferrer">
                    {place.photo.attributions[0].displayName}
                  </a>
                ) : (
                  place.photo.attributions[0].displayName
                )}
              </figcaption>
            )}
          </figure>
        )}
      </div>

      {canEdit ? (
        <div className="stop-visit">
          <button
            type="button"
            className={`tick ${visited ? "tick-on" : ""}`}
            aria-pressed={visited}
            disabled={saving}
            onClick={() => save({ visitedOn: visited ? null : todayIso() })}
          >
            <span className="tick-box" aria-hidden>
              {visited ? "✓" : ""}
            </span>
            {visited ? "Visited" : "Tick off"}
          </button>
          {visited && (
            <input
              type="date"
              className="date-input"
              aria-label="Date visited"
              value={stop.visitedOn ?? ""}
              max={todayIso()}
              onChange={(e) => e.target.value && save({ visitedOn: e.target.value })}
            />
          )}
        </div>
      ) : (
        visited && <div className="visited-line">✓ Visited {formatDate(stop.visitedOn!)}</div>
      )}

      {canNote && editingNote ? (
        <textarea
          className="note-input"
          value={note}
          maxLength={500}
          rows={2}
          autoFocus
          placeholder="e.g. Try the guest ale"
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
        />
      ) : stop.note ? (
        <p className="note" onClick={() => canNote && setEditingNote(true)}>
          “{stop.note}”
        </p>
      ) : null}

      {canNote && !editingNote && (
        <button type="button" className="text-btn note-btn" onClick={() => setEditingNote(true)}>
          {stop.note ? "✎ Edit note" : "+ Add note"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  );
}
