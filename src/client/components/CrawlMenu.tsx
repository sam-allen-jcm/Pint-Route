import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export type Section = "stops" | "map" | "edit";

interface Item {
  id: Section;
  icon: string;
  label: string;
}

interface Props {
  current: Section;
  items: Item[];
  onSelect: (section: Section) => void;
}

/** Desktop: section buttons in the header, next to Share. */
export function HeaderNav({ current, items, onSelect }: Props) {
  if (items.length < 2) return null;
  return (
    <nav className="header-nav" aria-label="Crawl sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`header-nav-btn ${current === item.id ? "on" : ""}`}
          aria-current={current === item.id ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span aria-hidden>{item.icon}</span> {item.label}
        </button>
      ))}
    </nav>
  );
}

/** Mobile: a ☰ button with a drop-down of the same sections. */
export function BurgerMenu({ current, items, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="burger" ref={ref}>
      <button
        type="button"
        className={`burger-btn ${open ? "on" : ""}`}
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>
      {open && (
        <div className="burger-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`burger-item ${current === item.id ? "on" : ""}`}
              aria-current={current === item.id ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                onSelect(item.id);
              }}
            >
              <span className="burger-icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
              {current === item.id && <span className="burger-here">Viewing</span>}
            </button>
          ))}
          <Link to="/" role="menuitem" className="burger-item burger-home" onClick={() => setOpen(false)}>
            <span className="burger-icon" aria-hidden>
              🏠
            </span>
            My crawls
          </Link>
        </div>
      )}
    </div>
  );
}
