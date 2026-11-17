import { useRef, useState, type PointerEvent } from "react";
import { formatClock, formatDay, parseStart } from "../../shared/hours";
import type { MeetingPoint, PlaceDetails, Stop } from "../../shared/types";

interface Props {
  stops: Stop[];
  places: Record<string, PlaceDetails>;
  meetingPoint: MeetingPoint | null;
  /** The crawl's start ("YYYY-MM-DDTHH:MM"), shown as the meeting time. */
  startsAt: string | null;
  onMove: (index: number, dir: -1 | 1) => void;
  /** Drag and drop: move the stop at `from` to position `to`. */
  onReorder: (from: number, to: number) => void;
  onRemove: (stop: Stop) => void;
  onEditMeeting: () => void;
}

/** Compact list on the "Edit crawl" tab: meeting point, reorder and remove stops. */
interface Drag {
  from: number;
  over: number;
  /** How far the row has been dragged, in px. */
  dy: number;
  startY: number;
  /** Each row's top and height when the drag started. */
  rows: { top: number; height: number }[];
}

export function EditStops({
  stops,
  places,
  meetingPoint,
  startsAt,
  onMove,
  onReorder,
  onRemove,
  onEditMeeting,
}: Props) {
  const start = parseStart(startsAt);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Drag by the ⠿ handle (mouse or finger). Other rows slide out of the way.
  function onDown(e: PointerEvent<HTMLSpanElement>, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rows = stops.map((_, i) => {
      const r = rowRefs.current[i]?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 56 };
    });
    setDrag({ from: index, over: index, dy: 0, startY: e.clientY, rows });
  }
  function onMoveDrag(e: PointerEvent<HTMLSpanElement>) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const me = drag.rows[drag.from];
    const centre = me.top + dy + me.height / 2;
    let over = drag.rows.findIndex((r) => centre < r.top + r.height);
    if (over === -1) over = drag.rows.length - 1;
    setDrag({ ...drag, dy, over });
  }
  function onUp() {
    if (drag && drag.over !== drag.from) onReorder(drag.from, drag.over);
    setDrag(null);
  }
  function shift(i: number): number {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    const h = drag.rows[drag.from].height;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -h;
    if (drag.from > drag.over && i >= drag.over && i < drag.from) return h;
    return 0;
  }
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
              <>
                {meetingPoint.name}
                <span className="edit-sub">
                  {start ? `${formatDay(start.date)} · ${formatClock(start)}` : "No meeting time set"}
                </span>
              </>
            ) : (
              <span className="muted">
                Meeting point <span className="optional">(optional)</span>
              </span>
            )}
          </span>
          <button type="button" className="text-btn" onClick={onEditMeeting}>
            {meetingPoint ? (start ? "Change" : "+ Time") : "+ Add"}
          </button>
        </li>
        {stops.map((stop, i) => (
          <li
            key={stop.id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={`edit-row ${drag?.from === i ? "dragging" : ""} ${drag ? "drag-active" : ""}`}
            style={drag ? { transform: `translateY(${shift(i)}px)` } : undefined}
          >
            {stops.length > 1 && (
              <span
                className="drag-handle"
                aria-hidden
                title="Drag to reorder"
                onPointerDown={(e) => onDown(e, i)}
                onPointerMove={onMoveDrag}
                onPointerUp={onUp}
                onPointerCancel={() => setDrag(null)}
              >
                ⠿
              </span>
            )}
            <span className="edit-num">{i + 1}</span>
            <span className="edit-name">{places[stop.placeId]?.name ?? "Loading…"}</span>
            <span className="edit-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => onMove(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
              >
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
