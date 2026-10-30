import { useEffect, useState, type FormEvent } from "react";
import { DEFAULT_MINUTES_PER_STOP, type Crawl } from "../../shared/types";
import { api } from "../api";

/** Choices for "Time at each pub" (minutes). */
export const DURATIONS = [20, 30, 45, 60, 75, 90, 120];

/** 45 → "45 minutes", 90 → "1 h 30 min", 120 → "2 hours" */
export function durationLabel(m: number): string {
  if (m < 60) return `${m} minutes`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m > 60 ? "s" : ""}`;
}

interface Props {
  crawl: Crawl;
  editToken: string | null;
  onSaved: (crawl: Crawl) => void;
}

/** "When" section of the Edit crawl tab: start date, start time, time per pub. */
export function ScheduleEditor({ crawl, editToken, onSaved }: Props) {
  const [date, setDate] = useState(crawl.startsAt?.slice(0, 10) ?? "");
  const [time, setTime] = useState(crawl.startsAt?.slice(11, 16) ?? "");
  const [perStop, setPerStop] = useState(crawl.minutesPerStop ?? DEFAULT_MINUTES_PER_STOP);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep in step when the time is changed elsewhere (e.g. the meeting point sheet).
  useEffect(() => {
    setDate(crawl.startsAt?.slice(0, 10) ?? "");
    setTime(crawl.startsAt?.slice(11, 16) ?? "");
    setPerStop(crawl.minutesPerStop ?? DEFAULT_MINUTES_PER_STOP);
  }, [crawl.startsAt, crawl.minutesPerStop]);

  const startsAt = date && time ? `${date}T${time}` : null;
  const dirty = startsAt !== crawl.startsAt || perStop !== crawl.minutesPerStop;

  async function save(e?: FormEvent, clear = false) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateSchedule(
        crawl.slug,
        { startsAt: clear ? null : startsAt, minutesPerStop: perStop },
        editToken,
      );
      if (clear) {
        setDate("");
        setTime("");
      }
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h2 className="section-title">When</h2>
      <form className="card schedule-card stack" onSubmit={save}>
        <p className="muted small">
          Add a start time to see roughly when you'll reach each pub, and whether it'll be open then.
        </p>
        <div className="schedule-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>{crawl.meetingPoint ? "Meeting / start time" : "Start time"}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Time at each pub</span>
          <select className="select" value={perStop} onChange={(e) => setPerStop(Number(e.target.value))}>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {durationLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {(date && !time) || (!date && time) ? <p className="hint">Add both a date and a time.</p> : null}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="schedule-actions">
          <button className="btn btn-primary" disabled={busy || !dirty || Boolean((date && !time) || (!date && time))}>
            {busy ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save"}
          </button>
          {crawl.startsAt && (
            <button type="button" className="btn btn-plain" disabled={busy} onClick={() => save(undefined, true)}>
              Remove start time
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
