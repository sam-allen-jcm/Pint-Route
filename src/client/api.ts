import type { Crawl, CrawlRoute, CreatedCrawl, LatLng, PlaceDetails, PlaceSummary, Stop } from "../shared/types";

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
  searchPlaces(q: string, near: LatLng | null) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
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

  createCrawl(name: string) {
    return request<CreatedCrawl>("/api/crawls", { method: "POST", body: JSON.stringify({ name }) });
  },
  getCrawl(slug: string, editToken: string | null) {
    return request<Crawl>(`/api/crawls/${slug}`, { editToken });
  },
  renameCrawl(slug: string, name: string, editToken: string) {
    return request<Crawl>(`/api/crawls/${slug}`, { method: "PATCH", body: JSON.stringify({ name }), editToken });
  },
  deleteCrawl(slug: string, editToken: string) {
    return request<{ ok: true }>(`/api/crawls/${slug}`, { method: "DELETE", editToken });
  },
  getRoute(slug: string) {
    return request<CrawlRoute>(`/api/crawls/${slug}/route`);
  },
  addStop(slug: string, placeId: string, editToken: string) {
    return request<Stop>(`/api/crawls/${slug}/stops`, { method: "POST", body: JSON.stringify({ placeId }), editToken });
  },
  reorderStops(slug: string, stopIds: number[], editToken: string) {
    return request<Crawl>(`/api/crawls/${slug}/stops/order`, {
      method: "PUT",
      body: JSON.stringify({ stopIds }),
      editToken,
    });
  },
  updateStop(slug: string, stopId: number, patch: { visitedOn?: string | null; note?: string | null }, editToken: string) {
    return request<Stop>(`/api/crawls/${slug}/stops/${stopId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      editToken,
    });
  },
  removeStop(slug: string, stopId: number, editToken: string) {
    return request<{ ok: true }>(`/api/crawls/${slug}/stops/${stopId}`, { method: "DELETE", editToken });
  },
};
