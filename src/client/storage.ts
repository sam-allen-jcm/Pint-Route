// The creator's private edit tokens live only in this browser (no accounts yet).

const KEY = "pint-route:crawls";

export interface SavedCrawl {
  slug: string;
  name: string;
  editToken: string;
  savedAt: string;
}

function readAll(): SavedCrawl[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedCrawl[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedCrawl[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked (private mode) – editing still works for this session.
  }
}

const sessionTokens = new Map<string, string>();

export const savedCrawls = {
  list(): SavedCrawl[] {
    return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  token(slug: string): string | null {
    return readAll().find((c) => c.slug === slug)?.editToken ?? sessionTokens.get(slug) ?? null;
  },
  save(slug: string, name: string, editToken: string) {
    sessionTokens.set(slug, editToken);
    const list = readAll().filter((c) => c.slug !== slug);
    list.push({ slug, name, editToken, savedAt: new Date().toISOString() });
    writeAll(list);
  },
  rename(slug: string, name: string) {
    writeAll(readAll().map((c) => (c.slug === slug ? { ...c, name } : c)));
  },
  remove(slug: string) {
    sessionTokens.delete(slug);
    writeAll(readAll().filter((c) => c.slug !== slug));
  },
};
