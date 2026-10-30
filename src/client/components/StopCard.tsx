import { useEffect, useState } from "react";
import type { PlaceDetails, Stop } from "../../shared/types";
import { formatClock, formatDay, openingsOn, type LocalTime } from "../../shared/hours";
import { api } from "../api";
import type { StopTiming } from "../schedule";
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
  /** Estimated arrival and open/closed status then, when the crawl has a start time and time per pub. */
  timing?: StopTiming | null;
  /** The crawl's date, when it has one but no time per pub: show that day's opening hours. */
  day?: string | null;
}

/** A stop on the Stops tab: details, tick off, notes. Reordering/removing lives in "Edit crawl". */
export function StopCard({ stop, index, place, canEdit, canNote, onUpdate, timing, day }: Props) {
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
          {timing && !visited && !closed && <ArrivalLine timing={timing} />}
          {!timing && day && !visited && !closed && place && <DayHoursLine day={day} place={place} />}
          {!(timing && !visited) && !(day && !visited) && place && !closed && (place.openNow !== null || place.todayHours) && (
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

/** "🕖 Arrive ~7:15 PM · Open until 11 PM", or a warning if it'll be closed. */
function ArrivalLine({ timing }: { timing: StopTiming }) {
  const { arrive, status } = timing;
  const when = (t: LocalTime) => {
    if (t.minutes === 0 && t.date > arrive.date) return "midnight"; // closing at 00:00 the next day
    return t.date === arrive.date ? formatClock(t) : `${formatDay(t.date)} ${formatClock(t)}`;
  };
  return (
    <div className="arrival">
      <span className="arrival-time">🕖 Arrive ~{formatClock(arrive)}</span>
      {status === null ? (
        <span className="muted"> · Opening hours unknown</span>
      ) : status.open ? (
        status.closingSoon && status.closesAt ? (
          <span className="soon"> · ⚠ Closes at {when(status.closesAt)}, soon after you arrive</span>
        ) : (
          <span className="open"> · Open{status.closesAt ? ` until ${when(status.closesAt)}` : " 24 hours"}</span>
        )
      ) : (
        <span className="shut">
          {" "}
          · ⚠ Closed then{status.opensAt ? `, opens ${when(status.opensAt)}` : ""}
        </span>
      )}
    </div>
  );
}

/** "🕖 Sat 31 Oct: 11:00 – midnight", or "⚠ Closed on Sat 31 Oct". */
function DayHoursLine({ day, place }: { day: string; place: PlaceDetails }) {
  const hours = openingsOn(place.hours, day);
  const label = formatDay(day);
  const end = (t: LocalTime | null) => {
    if (!t) return "late";
    if (t.minutes === 0 && t.date > day) return "midnight";
    return t.date > day ? `${formatClock(t)} (next day)` : formatClock(t);
  };
  return (
    <div className="arrival">
      <span className="arrival-time">🕖 {label}: </span>
      {hours === null ? (
        <span className="muted">opening hours unknown</span>
      ) : hours.kind === "always" ? (
        <span className="open">open 24 hours</span>
      ) : hours.kind === "closed" ? (
        <span className="shut">⚠ closed all day</span>
      ) : (
        <span className="open">{hours.periods.map((p) => `${formatClock(p.open)} – ${end(p.close)}`).join(", ")}</span>
      )}
    </div>
  );
}
