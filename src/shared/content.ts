/**
 * True if text looks like it contains a web link or domain ("http…", "www.",
 * "dodgy-site.com"). Crawl names, notes and display names can't contain links,
 * so share pages can't be used to spread spam.
 */
export function containsLink(text: string): boolean {
  return /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|co|uk|biz|info|xyz|top|site|online|shop|ly|ru|cn)\b)/i.test(
    text,
  );
}
