// Public usernames: shown on crawls people make public, instead of their real name.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

/** Names that could pass for us, or for staff. */
const RESERVED = [
  "admin",
  "administrator",
  "pintroute",
  "pint_route",
  "support",
  "help",
  "legal",
  "moderator",
  "mod",
  "staff",
  "official",
  "team",
  "system",
  "root",
  "null",
  "undefined",
  "anonymous",
];

/** A short, deliberately incomplete block list; reported names are handled by hand. */
const BLOCKED = [
  "fuck",
  "shit",
  "cunt",
  "nigg",
  "fag",
  "rape",
  "nazi",
  "hitler",
  "wank",
  "twat",
  "slut",
  "whore",
  "porn",
];

/** An error message, or null if the username is acceptable. */
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `Usernames must be ${USERNAME_MIN}–${USERNAME_MAX} characters`;
  }
  if (!USERNAME_RE.test(name)) return "Use letters, numbers and underscores only, starting with a letter";
  const lower = name.toLowerCase();
  if (RESERVED.includes(lower) || lower.startsWith("pintroute")) return "That username isn't available";
  if (BLOCKED.some((w) => lower.includes(w))) return "Please choose a different username";
  return null;
}

const ADJECTIVES = [
  "Hoppy",
  "Malty",
  "Frothy",
  "Golden",
  "Amber",
  "Crafty",
  "Merry",
  "Jolly",
  "Hazy",
  "Bitter",
  "Mellow",
  "Toasty",
  "Plucky",
  "Cheery",
  "Rambling",
  "Wandering",
  "Thirsty",
  "Lively",
  "Rustic",
  "Smooth",
];
const NOUNS = [
  "Badger",
  "Otter",
  "Fox",
  "Heron",
  "Stag",
  "Owl",
  "Hare",
  "Robin",
  "Wren",
  "Ferret",
  "Barrel",
  "Tankard",
  "Cask",
  "Hop",
  "Porter",
  "Stout",
  "Cider",
  "Pilgrim",
  "Rover",
  "Landlord",
];

/** e.g. "HoppyBadger42". Callers retry if it's already taken. */
export function generateUsername(): string {
  const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(Math.random() * 90) + 10}`;
}
