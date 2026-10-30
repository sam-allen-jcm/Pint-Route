import type {
  Crawl,
  CrawlRoute,
  Bounds,
  CitySuggestion,
  CrawlSummary,
  CreatedCrawl,
  LatLng,
  PlaceDetails,
  PlaceSummary,
  Stop,
  User,
} from "../shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { editToken?: string | null } = {}): Promise<T> {
  const { editToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set("Content-Type", "application/json");
  if (editToken) headers.set("X-Edit-Token", editToken);
  const res = await fetch(path, { ...rest, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  // ---- accounts (session cookie, sent automatically) ----
  me() {
    return request<{ user: User | null }>("/api/auth/me").then((r) => r.user);
  },
  register(name: string, email: string, password: string) {
    return request<{ user: User }>("/api/auth/register", {
      method: "POST",
      // The form won't submit until the age/terms box is ticked.
      body: JSON.stringify({ name, email, password, acceptTerms: true }),
    }).then((r) => r.user);
  },
  login(email: string, password: string) {
    return request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }).then((r) => r.user);
  },
  forgotPassword(email: string) {
    return request<{ ok: true }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
  },
  resetPassword(token: string, password: string) {
    return request<{ user: User }>("/api/auth/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }).then((r) => r.user);
  },
  logout() {
    return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  },
  myCrawls() {
    return request<{ crawls: CrawlSummary[] }>("/api/me/crawls").then((r) => r.crawls);
  },
  claimCrawls(crawls: { slug: string; editToken: string }[]) {
    return request<{ claimed: number }>("/api/me/claim", { method: "POST", body: JSON.stringify({ crawls }) });
  },

  searchPlaces(q: string, near: LatLng | null, bias: Bounds | null = null) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (bias) params.set("bias", [bias.low.lat, bias.low.lng, bias.high.lat, bias.high.lng].map((n) => n.toFixed(4)).join(","));
    if (near) {
      params.set("lat", near.lat.toFixed(5));
      params.set("lng", near.lng.toFixed(5));
    }
    return request<{ places: PlaceSummary[] }>(`/api/places/search?${params}`).then((r) => r.places);
  },
  getPlaces(ids: string[]) {
    return request<{ places: Record<string, PlaceDetails> }>(
      `/api/places?ids=${ids.map(encodeURIComponent).join(",")}`,
    ).then((r) => r.places);
  },
  photoUrl(name: string, width = 400) {
    return `/api/places/photo?name=${encodeURIComponent(name)}&w=${width}`;
  },

  suggestCities(q: string, countryCode: string, sessionToken: string) {
    const params = new URLSearchParams({ q, country: countryCode, session: sessionToken });
    return request<{ cities: CitySuggestion[] }>(`/api/places/cities?${params}`).then((r) => r.cities);
  },
  createCrawl(name: string, where: { countryCode: string; cityPlaceId: string | null; sessionToken: string | null }) {
    return request<CreatedCrawl>("/api/crawls", { method: "POST", body: JSON.stringify({ name, ...where }) });
  },
  getCrawl(slug: string, editToken: string | null) {
    return request<Crawl>(`/api/crawls/${slug}`, { editToken });
  },
  updateCrawlArea(
    slug: string,
    where: { countryCode: string; cityPlaceId: string | null; sessionToken: string | null },
    editToken: string | null,
  ) {
    return request<Crawl>(`/api/crawls/${slug}`, { method: "PATCH", body: JSON.stringify(where), editToken });
  },
  renameCrawl(slug: string, name: string, editToken: string | null) {
    return request<Crawl>(`/api/crawls/${slug}`, { method: "PATCH", body: JSON.stringify({ name }), editToken });
  },
  deleteCrawl(slug: string, editToken: string | null) {
    return request<{ ok: true }>(`/api/crawls/${slug}`, { method: "DELETE", editToken });
  },
  getRoute(slug: string, stopIds: number[]) {
    return request<CrawlRoute>(`/api/crawls/${slug}/route?stops=${stopIds.join(",")}`);
  },
  addStop(slug: string, placeId: string, editToken: string | null) {
    return request<Stop>(`/api/crawls/${slug}/stops`, { method: "POST", body: JSON.stringify({ placeId }), editToken });
  },
  reorderStops(slug: string, stopIds: number[], editToken: string | null) {
    return request<Crawl>(`/api/crawls/${slug}/stops/order`, {
      method: "PUT",
      body: JSON.stringify({ stopIds }),
      editToken,
    });
  },
  updateStop(slug: string, stopId: number, patch: { visitedOn?: string | null; note?: string | null }, editToken: string | null) {
    return request<Stop>(`/api/crawls/${slug}/stops/${stopId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      editToken,
    });
  },
  removeStop(slug: string, stopId: number, editToken: string | null) {
    return request<{ ok: true }>(`/api/crawls/${slug}/stops/${stopId}`, { method: "DELETE", editToken });
  },
};
