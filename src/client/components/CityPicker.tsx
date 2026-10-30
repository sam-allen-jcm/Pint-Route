import { useEffect, useId, useRef, useState } from "react";
import type { CitySuggestion } from "../../shared/types";
import { api } from "../api";

export interface PickedCity {
  placeId: string;
  label: string;
}

interface Props {
  countryCode: string;
  value: PickedCity | null;
  onChange: (city: PickedCity | null) => void;
  /** Places Autocomplete session token (groups typing + the final lookup for billing). */
  sessionToken: string;
}

/** Optional town/city field with suggestions from Google, limited to one country. */
export function CityPicker({ countryCode, value, onChange, sessionToken }: Props) {
  return (
    <PlaceAutocomplete
      value={value}
      onChange={onChange}
      resetKey={countryCode}
      placeholder="Start typing, e.g. Leeds"
      noMatches="No matching towns. You can leave this blank."
      clearLabel="Clear town or city"
      fetchSuggestions={(q) => api.suggestCities(q, countryCode, sessionToken)}
    />
  );
}

interface AutocompleteProps {
  value: PickedCity | null;
  onChange: (place: PickedCity | null) => void;
  /** When this changes (e.g. the country), the field clears. */
  resetKey?: string;
  placeholder: string;
  noMatches: string;
  clearLabel: string;
  fetchSuggestions: (q: string) => Promise<CitySuggestion[]>;
  autoFocus?: boolean;
}

/** Text field with Google place suggestions in a dropdown. */
export function PlaceAutocomplete({
  value,
  onChange,
  resetKey = "",
  placeholder,
  noMatches,
  clearLabel,
  fetchSuggestions,
  autoFocus,
}: AutocompleteProps) {
  const listId = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Latest fetcher without re-running the effect on every render.
  const fetchRef = useRef(fetchSuggestions);
  fetchRef.current = fetchSuggestions;

  // Changing the reset key (e.g. country) clears the field, but not on first render.
  const lastKey = useRef(resetKey);
  useEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    setText("");
    setSuggestions([]);
    onChange(null);
  }, [resetKey]);

  // Debounced suggestions while typing (not after a pick).
  useEffect(() => {
    const q = text.trim();
    if (value || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchRef
        .current(q)
        .then((list) => {
          if (cancelled) return;
          setSuggestions(list);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => !cancelled && setSuggestions([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, value, resetKey]);

  function pick(s: CitySuggestion) {
    const label = s.detail ? `${s.name}, ${s.detail}` : s.name;
    setText(label);
    setOpen(false);
    setSuggestions([]);
    onChange({ placeId: s.placeId, label });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div className="city-picker">
      <div className="city-input-row">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null); // editing un-picks the town
          }}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          onBlur={() => (blurTimer.current = setTimeout(() => setOpen(false), 150))}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
        {text && (
          <button
            type="button"
            className="clear-btn"
            aria-label={clearLabel}
            onClick={() => {
              setText("");
              onChange(null);
            }}
          >
            ×
          </button>
        )}
      </div>
      {loading && !showList && text.trim().length >= 2 && !value && <span className="hint">Searching…</span>}
      {!loading && open && !value && text.trim().length >= 2 && suggestions.length === 0 && (
        <span className="hint">{noMatches}</span>
      )}
      {showList && (
        <ul className="city-list" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              <span className="city-name">{s.name}</span>
              {s.detail && <span className="city-detail">{s.detail}</span>}
            </li>
          ))}
          <li className="city-attribution" aria-hidden>
            Powered by Google
          </li>
        </ul>
      )}
    </div>
  );
}
