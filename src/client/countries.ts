// Countries for the "new crawl" picker. Names come from the browser in the
// user's language, so only the ISO codes are stored (in src/shared).
import { COUNTRY_CODES as CODES, isCountryCode } from "../shared/countries";

export interface Country {
  code: string;
  name: string;
}

let cached: Country[] | null = null;

export function countries(): Country[] {
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(navigator.languages?.length ? [...navigator.languages] : ["en"], { type: "region" });
  } catch {
    // very old browser: fall back to codes
  }
  cached = CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return cached;
}

const LAST_KEY = "pint-route:last-country";

/** Last country used on this device, else the region in the browser's language (en-GB → GB), else GB. */
export function defaultCountry(): string {
  try {
    const last = localStorage.getItem(LAST_KEY);
    if (isCountryCode(last)) return last;
  } catch {
    // ignore
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const region = lang.split("-")[1]?.toUpperCase();
    if (isCountryCode(region)) return region;
  }
  return "GB";
}

export function rememberCountry(code: string) {
  try {
    localStorage.setItem(LAST_KEY, code);
  } catch {
    // ignore
  }
}
