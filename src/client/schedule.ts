import { addMinutes, parseStart, statusAt, type LocalTime, type OpenStatus } from "../shared/hours";
import type { PlaceDetails, RouteLeg, Stop } from "../shared/types";

export interface StopTiming {
  arrive: LocalTime;
  /** Open/closed when you arrive; null if the venue's hours are unknown. */
  status: OpenStatus | null;
}

/**
 * Estimated arrival at each stop: start at the meeting point (or the first
 * stop), walk each leg, and spend `minutesPerStop` at every pub.
 * Legs that haven't loaded yet count as zero minutes.
 */
export function planArrivals(
  startsAt: string | null,
  minutesPerStop: number | null,
  stops: Stop[],
  places: Record<string, PlaceDetails>,
  meetingLeg: RouteLeg | null,
  legAfter: (i: number) => RouteLeg | null,
): StopTiming[] | null {
  const start = parseStart(startsAt);
  // Without a time per pub there's nothing to estimate from: stops show the day's hours instead.
  if (!start || !stops.length || minutesPerStop === null) return null;
  const out: StopTiming[] = [];
  let t = addMinutes(start, Math.round((meetingLeg?.durationSeconds ?? 0) / 60));
  stops.forEach((stop, i) => {
    if (i > 0) t = addMinutes(t, minutesPerStop + Math.round((legAfter(i - 1)?.durationSeconds ?? 0) / 60));
    out.push({ arrive: t, status: statusAt(places[stop.placeId]?.hours ?? null, t) });
  });
  return out;
}

/** When you'd leave the last stop. */
export function finishTime(timings: StopTiming[] | null, minutesPerStop: number | null): LocalTime | null {
  if (!timings?.length || minutesPerStop === null) return null;
  return addMinutes(timings[timings.length - 1].arrive, minutesPerStop);
}
