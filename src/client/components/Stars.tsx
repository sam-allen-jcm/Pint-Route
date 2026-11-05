import { useState } from "react";
import type { RatingSummary } from "../../shared/types";

/** Read-only: "★ 4.3 (12)". */
export function RatingBadge({ rating, compact = false }: { rating: RatingSummary; compact?: boolean }) {
  if (!rating.count || rating.average === null) {
    return <span className="rating-badge muted">{compact ? "No ratings" : "No ratings yet"}</span>;
  }
  return (
    <span className="rating-badge" aria-label={`Rated ${rating.average} out of 5 by ${rating.count}`}>
      <span className="star on" aria-hidden>
        ★
      </span>{" "}
      <strong>{rating.average.toFixed(1)}</strong> <span className="muted">({rating.count})</span>
    </span>
  );
}

/** Tap a star to rate 1–5. */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (stars: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="star-input" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          className={`star ${n <= shown ? "on" : ""}`}
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
