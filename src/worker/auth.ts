// Email + password accounts with server-side sessions.
//
// - Passwords: PBKDF2-SHA256 with a random 16-byte salt (100k iterations, the
//   most Workers' WebCrypto allows). The iteration count is stored with each
//   hash so it can be raised later without breaking existing passwords.
// - Sessions: a random token in an HttpOnly, Secure, SameSite=Lax cookie. Only
//   its SHA-256 is stored in D1, so a database leak doesn't leak live sessions.

import type { User } from "../shared/types";
import { fromBase64Url, randomToken, sha256, timingSafeEqual, toBase64Url } from "./crypto";
import { passwordResetEmail, sendEmail } from "./email";
import type { Env } from "./env";
import { HttpError, json } from "./http";

const COOKIE = "pr_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
}

const toUser = (r: { id: number; email: string; display_name: string }): User => ({
  id: r.id,
  email: r.email,
  name: r.display_name,
});

// ---------- passwords ----------

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iter || !salt || !hash) return false;
  const actual = await pbkdf2(password, fromBase64Url(salt), Number(iter));
  return timingSafeEqual(actual, fromBase64Url(hash));
}

// Used when the email doesn't exist, so a failed login takes the same time
// either way and doesn't reveal which emails have accounts.
const DUMMY_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// ---------- input validation ----------

function cleanEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address");
  return email;
}

function cleanPassword(v: unknown, forNewAccount: boolean): string {
  if (typeof v !== "string" || !v) throw new HttpError(400, "Enter your password");
  if (v.length > 200) throw new HttpError(400, "Password must be 200 characters or fewer");
  if (forNewAccount && v.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  return v;
}

function cleanDisplayName(v: unknown): string {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new HttpError(400, "Enter your name");
  if (name.length > 40) throw new HttpError(400, "Name must be 40 characters or fewer");
  return name;
}

// ---------- rate limiting ----------

async function rateLimit(request: Request, env: Env, what: string, email: string) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  // A missing binding (e.g. some local setups) just skips that check.
  const results = await Promise.all([
    env.AUTH_IP_LIMITER?.limit({ key: `${what}:${ip}` }) ?? { success: true },
    env.AUTH_EMAIL_LIMITER?.limit({ key: `${what}:${email}` }) ?? { success: true },
  ]);
  if (results.some((r) => !r.success)) {
    throw new HttpError(429, "Too many attempts. Please wait a minute and try again.");
  }
}

// ---------- sessions ----------

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function startSession(env: Env, userId: number): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(
      await sha256(token),
      userId,
      expires,
    ),
    // Housekeeping: drop this user's expired sessions.
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, new Date().toISOString()),
  ]);
  return sessionCookie(token, SESSION_DAYS * 86_400);
}

const userCache = new WeakMap<Request, Promise<User | null>>();

/** The logged-in user for this request, or null. Looked up once per request. */
export function getUser(request: Request, env: Env): Promise<User | null> {
  let pending = userCache.get(request);
  if (!pending) {
    pending = (async () => {
      const token = readCookie(request, COOKIE);
      if (!token) return null;
      const row = await env.DB.prepare(
        `SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ?`,
      )
        .bind(await sha256(token), new Date().toISOString())
        .first<{ id: number; email: string; display_name: string }>();
      return row ? toUser(row) : null;
    })();
    userCache.set(request, pending);
  }
  return pending;
}

export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, "Please log in");
  return user;
}

// ---------- endpoints ----------

export async function register(request: Request, env: Env, body: Record<string, unknown>): Promise<Response> {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password, true);
  const name = cleanDisplayName(body.name);
  await rateLimit(request, env, "register", email);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) throw new HttpError(409, "An account with this email already exists. Try logging in.");

  const row = await env.DB.prepare(
    "INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?) RETURNING id, email, display_name",
  )
    .bind(email, name, await hashPassword(password))
    .first<{ id: number; email: string; display_name: string }>();
  if (!row) throw new HttpError(500, "Could not create account");

  return json({ user: toUser(row) }, { status: 201, headers: { "Set-Cookie": await startSession(env, row.id) } });
}

export async function login(request: Request, env: Env, body: Record<string, unknown>): Promise<Response> {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password, false);
  await rateLimit(request, env, "login", email);

  const row = await env.DB.prepare("SELECT id, email, display_name, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, "Email or password is incorrect");

  return json({ user: toUser(row) }, { headers: { "Set-Cookie": await startSession(env, row.id) } });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request, COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
}

export async function me(request: Request, env: Env): Promise<Response> {
  return json({ user: await getUser(request, env) });
}

// ---------- password reset ----------

const RESET_MINUTES = 60;

/**
 * Emails a one-time reset link if the address has an account. Always answers
 * the same way, and sends in the background, so the response (and its timing)
 * doesn't reveal whether an email is registered.
 */
export async function forgotPassword(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  body: Record<string, unknown>,
): Promise<Response> {
  const email = cleanEmail(body.email);
  await rateLimit(request, env, "forgot", email);

  const origin = new URL(request.url).origin;
  ctx.waitUntil(
    (async () => {
      const user = await env.DB.prepare("SELECT id, email, display_name FROM users WHERE email = ?")
        .bind(email)
        .first<{ id: number; email: string; display_name: string }>();
      if (!user) return;
      const token = randomToken();
      const expires = new Date(Date.now() + RESET_MINUTES * 60_000).toISOString();
      await env.DB.batch([
        // Only the newest link works.
        env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id),
        env.DB.prepare("INSERT INTO password_resets (id, user_id, expires_at) VALUES (?, ?, ?)").bind(
          await sha256(token),
          user.id,
          expires,
        ),
      ]);
      // The token goes in the URL fragment, which browsers never send to servers
      // or put in Referer headers.
      const link = `${origin}/reset-password#token=${token}`;
      await sendEmail(env, { to: user.email, ...passwordResetEmail(user.display_name, link) });
    })().catch((err) => console.error("forgotPassword failed", err)),
  );

  return json({ ok: true });
}

/** Sets a new password from a reset link, signs out everywhere else, and logs in. */
export async function resetPassword(env: Env, body: Record<string, unknown>): Promise<Response> {
  const token = typeof body.token === "string" && body.token.length <= 100 ? body.token : "";
  const password = cleanPassword(body.password, true);
  const invalid = new HttpError(400, "This reset link is invalid or has expired. Please request a new one.");
  if (!token) throw invalid;

  const id = await sha256(token);
  const reset = await env.DB.prepare(
    "SELECT user_id FROM password_resets WHERE id = ? AND used_at IS NULL AND expires_at > ?",
  )
    .bind(id, new Date().toISOString())
    .first<{ user_id: number }>();
  if (!reset) throw invalid;

  // Mark used first; if two requests race, only one gets changes = 1.
  const claimed = await env.DB.prepare(
    "UPDATE password_resets SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND used_at IS NULL",
  )
    .bind(id)
    .run();
  if (!claimed.meta.changes) throw invalid;

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), reset.user_id),
    // Whoever knew the old password is signed out everywhere.
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.user_id),
  ]);

  const user = await env.DB.prepare("SELECT id, email, display_name FROM users WHERE id = ?")
    .bind(reset.user_id)
    .first<{ id: number; email: string; display_name: string }>();
  if (!user) throw invalid;
  return json({ user: toUser(user) }, { headers: { "Set-Cookie": await startSession(env, user.id) } });
}
