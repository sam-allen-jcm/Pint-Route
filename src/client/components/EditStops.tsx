import type { MeetingPoint, PlaceDetails, Stop } from "../../shared/types";

interface Props {
  stops: Stop[];
  places: Record<string, PlaceDetails>;
  meetingPoint: MeetingPoint | null;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (stop: Stop) => void;
  onEditMeeting: () => void;
}

/** Compact list on the "Edit crawl" tab: meeting point, reorder and remove stops. */
export function EditStops({ stops, places, meetingPoint, onMove, onRemove, onEditMeeting }: Props) {
  return (
    <section className="stack">
      <h2 className="section-title">Your crawl</h2>
      <ol className="edit-list">
        <li className="edit-row edit-meeting">
          <span className="edit-num" aria-hidden>
            🚩
          </span>
          <span className="edit-name">
            {meetingPoint ? (
              meetingPoint.name
            ) : (
              <span className="muted">
                Meeting point <span className="optional">(optional)</span>
              </span>
            )}
          </span>
          <button type="button" className="text-btn" onClick={onEditMeeting}>
            {meetingPoint ? "Change" : "+ Add"}
          </button>
        </li>
        {stops.map((stop, i) => (
          <li key={stop.id} className="edit-row">
            <span className="edit-num">{i + 1}</span>
            <span className="edit-name">{places[stop.placeId]?.name ?? "Loading…"}</span>
            <span className="edit-actions">
              <button type="button" className="icon-btn" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="Move up">
                ▲
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onMove(i, 1)}
                disabled={i === stops.length - 1}
                aria-label="Move down"
              >
                ▼
              </button>
              <button
                type="button"
                className="icon-btn remove-btn"
                onClick={() => onRemove(stop)}
                aria-label={`Remove ${places[stop.placeId]?.name ?? "stop"}`}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      {stops.length === 0 && <p className="muted small">No pubs yet. Search below to add your first.</p>}
    </section>
  );
}
