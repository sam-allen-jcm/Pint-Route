import type { VenueKind } from "../shared/types";

export const KIND_LABELS: Record<VenueKind, string> = {
  pub: "Pub",
  bar: "Bar",
  taproom: "Taproom / brewery",
  nightclub: "Nightclub",
  club: "Club",
};

/** Filter chips on the search and area pages ("" = everything except members' clubs). */
export const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "pub", label: "Pubs" },
  { value: "bar", label: "Bars" },
  { value: "taproom", label: "Taprooms" },
  { value: "nightclub", label: "Nightclubs" },
  { value: "club", label: "Clubs" },
];

/** "Reading" → "reading", "Newcastle upon Tyne" → "newcastle-upon-tyne" (area page URLs). */
export function areaSlug(area: string): string {
  return area
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Food hygiene rating values from the Food Standards Agency, in plain English. */
export function hygieneLabel(rating: string): string {
  const labels: Record<string, string> = {
    "5": "5 (very good)",
    "4": "4 (good)",
    "3": "3 (generally satisfactory)",
    "2": "2 (improvement necessary)",
    "1": "1 (major improvement necessary)",
    "0": "0 (urgent improvement necessary)",
    Pass: "Pass",
    "Pass and Eat Safe": "Pass and Eat Safe",
    "Improvement Required": "Improvement required",
    AwaitingInspection: "Awaiting inspection",
    AwaitingPublication: "Awaiting publication",
    Exempt: "Exempt",
  };
  return labels[rating] ?? rating;
}
