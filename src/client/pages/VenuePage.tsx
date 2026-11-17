import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { VenueDetails } from "../../shared/types";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { AddToCrawlSheet } from "../components/AddToCrawlSheet";
import { SiteFooter } from "../components/SiteFooter";
import { TopNav } from "../components/TopNav";
import { VenueMap } from "../components/VenueMap";
import { statusLabel } from "../format";
import { KIND_LABELS, areaSlug, hygieneLabel } from "../venues";
import { NotFound } from "./NotFound";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A pub's profile: our directory data, plus live hours and photos from Google. */
export function VenuePage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<VenueDetails | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [adding, setAdding] = useState(false);
  const [showHours, setShowHours] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVenue(null);
    setError(null);
    api
      .getVenue(slug)
      .then((v) => !cancelled && setVenue(v))
      .catch((err: Error) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <NotFound
        message={error instanceof ApiError && error.status === 404 ? "We couldn't find that pub." : error.message}
      />
    );
  }
  if (!venue) return <main className="page center muted">Loading…</main>;

  const place = venue.place;
  const flag = place ? statusLabel(place.businessStatus) : null;
  const directions = `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    destination: [venue.name, venue.postcode ?? venue.town].filter(Boolean).join(", "),
    ...(venue.placeId ? { destination_place_id: venue.placeId } : {}),
    travelmode: "walking",
  })}`;
  const location = venue.location ?? place?.location ?? null;

  function addToCrawl() {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/v/${slug}`)}`);
      return;
    }
    setAdding(true);
  }

  return (
    <main className="page narrow venue-page">
      <TopNav brand />

      {place?.photo && (
        <figure className="venue-photo">
          <img src={api.photoUrl(place.photo.name, 900)} alt={`Photo of ${venue.name}`} loading="lazy" />
          {place.photo.attributions[0] && (
            <figcaption>
              Photo:{" "}
              {place.photo.attributions[0].uri ? (
                <a href={place.photo.attributions[0].uri} target="_blank" rel="noreferrer">
                  {place.photo.attributions[0].displayName}
                </a>
              ) : (
                place.photo.attributions[0].displayName
              )}{" "}
              · Google
            </figcaption>
          )}
        </figure>
      )}

      <header className="venue-head">
        <span className="badge">{KIND_LABELS[venue.kind]}</span>
        <h1>{venue.name}</h1>
        <p className="venue-address">{[venue.address, venue.postcode].filter(Boolean).join(", ")}</p>
        {flag ? (
          <p className="flag-text danger-text">⚠ {flag}</p>
        ) : place?.openNow !== undefined && place?.openNow !== null ? (
          <p className={place.openNow ? "open-now" : "closed-now"}>
            {place.openNow ? "Open now" : "Closed now"}
            {place.todayHours && <span className="muted"> · {place.todayHours.replace(/^[A-Za-z]+:\s*/, "")}</span>}
          </p>
        ) : null}
      </header>

      <div className="venue-actions">
        <button className="btn btn-primary" onClick={addToCrawl} disabled={!venue.placeId}>
          + Add to a crawl
        </button>
        <a className="btn btn-ghost" href={directions} target="_blank" rel="noreferrer">
          Directions ↗
        </a>
        {place?.googleMapsUri && (
          <a className="btn btn-plain" href={place.googleMapsUri} target="_blank" rel="noreferrer">
            Google Maps ↗
          </a>
        )}
      </div>
      {!venue.placeId && (
        <p className="muted small">
          We haven't matched this venue to Google Maps yet, so its opening hours and photos aren't shown and it can't be
          added to a crawl. Try searching for it by name when adding pubs to a crawl.
        </p>
      )}

      {place && place.weekdayHours.length > 0 && (
        <section className="card venue-card">
          <button
            className="section-head hours-toggle"
            onClick={() => setShowHours((v) => !v)}
            aria-expanded={showHours}
          >
            <h2 className="section-title">Opening hours</h2>
            <span className="text-btn">{showHours ? "Hide" : "Show"}</span>
          </button>
          {showHours && (
            <ul className="hours-list">
              {place.weekdayHours.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p className="attribution">Opening hours from Google Maps</p>
        </section>
      )}

      {location && <VenueMap location={location} name={venue.name} />}

      {venue.hygiene && (
        <section className="card venue-card">
          <h2 className="section-title">Food hygiene rating</h2>
          <p>
            <strong>{hygieneLabel(venue.hygiene.rating)}</strong>
            {venue.hygiene.date && <span className="muted"> · inspected {formatDate(venue.hygiene.date)}</span>}
          </p>
          <a className="small-link" href={venue.hygiene.url} target="_blank" rel="noreferrer">
            See the full rating on the Food Standards Agency site ↗
          </a>
        </section>
      )}

      {venue.publicCrawls.length > 0 && (
        <section className="stack venue-crawls">
          <h2 className="section-title">On public crawls</h2>
          <ul className="crawl-list">
            {venue.publicCrawls.map((c) => (
              <li key={c.slug}>
                <Link to={`/c/${c.slug}`} className="crawl-link">
                  <span className="crawl-link-text">
                    <span className="crawl-link-name">{c.name}</span>
                    <span className="crawl-link-detail">by @{c.author}</span>
                  </span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="venue-more">
        {venue.town && (
          <Link className="text-btn" to={`/pubs/${areaSlug(venue.town)}`}>
            More pubs in {venue.town} ›
          </Link>
        )}
        {venue.outcode && (
          <Link className="text-btn" to={`/pubs/${venue.outcode.toLowerCase()}`}>
            Pubs in {venue.outcode} ›
          </Link>
        )}
      </section>

      <p className="muted small venue-claim">
        🍺 <strong>Is this your pub?</strong> Business profiles are coming soon, so you'll be able to add your beers,
        events, sport and photos.
      </p>

      <p className="attribution venue-sources">
        Venue details and food hygiene rating from the Food Standards Agency, under the{" "}
        <a
          href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
          target="_blank"
          rel="noreferrer"
        >
          Open Government Licence v3.0
        </a>
        .{place && " Opening hours, photo and status from Google Maps."} Details can change, so check with the venue.
      </p>

      {adding && venue.placeId && (
        <AddToCrawlSheet venueName={venue.name} placeId={venue.placeId} onClose={() => setAdding(false)} />
      )}
      <SiteFooter />
    </main>
  );
}
