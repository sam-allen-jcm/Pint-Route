import { Link } from "react-router-dom";
import type { CommunityCrawl } from "../../shared/types";
import { countries } from "../countries";
import { RatingBadge } from "./Stars";

const countryNames = () => new Map(countries().map((c) => [c.code, c.name]));

/** Public crawls as cards: name, place, creator, pubs and rating. */
export function CommunityList({ crawls }: { crawls: CommunityCrawl[] }) {
  const names = countryNames();
  return (
    <ul className="crawl-list">
      {crawls.map((c) => {
        const where = c.areaName ?? (c.countryCode ? names.get(c.countryCode) : null);
        return (
          <li key={c.slug}>
            <Link to={`/c/${c.slug}`} className="crawl-link community-card">
              <span className="crawl-link-text">
                <span className="crawl-link-name">{c.name}</span>
                <span className="crawl-link-detail">
                  {where && <>📍 {where} · </>}
                  {c.stopCount} pubs · by @{c.author}
                </span>
                <span className="crawl-link-detail">
                  <RatingBadge rating={c.rating} compact />
                  {c.copyCount > 0 && <> · copied {c.copyCount}×</>}
                </span>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
