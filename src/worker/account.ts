// "My Account": profile, email and password changes, data export and self-serve deletion.

import { sha256 } from "./crypto";
import {
  COOKIE,
  USER_COLS,
  type UserFields,
  cleanDisplayName,
  cleanEmail,
  cleanPassword,
  cleanUsername,
  hashPassword,
  rateLimit,
  readCookie,
  requireUser,
  sendVerification,
  sessionCookie,
  toUser,
  verifyPassword,
} from "./auth";
import { accountNoticeEmail, sendEmail } from "./email";
import type { Env } from "./env";
import { HttpError, json } from "./http";

const appUrl = (env: Env, request: Request) => env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;

/** Checks the current password before a sensitive change (rate-limited like logins). */
async function confirmPassword(request: Request, env: Env, userId: number, email: string, password: unknown) {
  const pw = cleanPassword(password, false);
  await rateLimit(request, env, "confirm", email);
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(userId)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(pw, row.password_hash))) {
    throw new HttpError(401, "Your current password is incorrect");
  }
}

async function loadUser(env: Env, id: number): Promise<UserFields> {
  const row = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first<UserFields>();
  if (!row) throw new HttpError(404, "Account not found");
  return row;
}

/** PATCH /api/me { name?, username? } */
export async function updateProfile(request: Request, env: Env, body: Record<string, unknown>): Promise<Response> {
  const user = await requireUser(request, env);
  const sets: string[] = [];
  const values: unknown[] = [];
  if ("name" in body) {
    sets.push("display_name = ?");
    values.push(cleanDisplayName(body.name));
  }
  if ("username" in body) {
    sets.push("username = ?");
    values.push(await cleanUsername(env, body.username, user.id));
  }
  if (!sets.length) throw new HttpError(400, "Nothing to update");
  try {
    await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values, user.id)
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new HttpError(409, "That username is taken. Try another.");
    throw err;
  }
  return json({ user: toUser(await loadUser(env, user.id)) });
}

/** POST /api/me/password { currentPassword, newPassword }: signs out every other device. */
export async function changePassword(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  body: Record<string, unknown>,
): Promise<Response> {
  const user = await requireUser(request, env);
  await confirmPassword(request, env, user.id, user.email, body.currentPassword);
  const next = cleanPassword(body.newPassword, true);
  const current = await sha256(readCookie(request, COOKIE) ?? "");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user.id, current),
    env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id),
  ]);
  ctx.waitUntil(
    sendEmail(env, { to: user.email, ...accountNoticeEmail(user.name, "password", appUrl(env, request)) }).catch(
      (err) => console.error("notice email failed", err),
    ),
  );
  return json({ ok: true });
}

/**
 * POST /api/me/email { password, email }: the new address must be confirmed again
 * (shared links pause until it is), and the old address gets a notice.
 */
export async function changeEmail(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  body: Record<string, unknown>,
): Promise<Response> {
  const user = await requireUser(request, env);
  await confirmPassword(request, env, user.id, user.email, body.password);
  const email = cleanEmail(body.email);
  if (email === user.email.toLowerCase()) throw new HttpError(400, "That's already your email address");
  const taken = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (taken) throw new HttpError(409, "Another account already uses that email address");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?").bind(email, user.id),
    // Old links went to the old address.
    env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id),
  ]);
  const row = await loadUser(env, user.id);
  ctx.waitUntil(
    Promise.all([
      sendVerification(env, request, row),
      sendEmail(env, { to: user.email, ...accountNoticeEmail(user.name, "email", appUrl(env, request), email) }),
    ]).catch((err) => console.error("email change mails failed", err)),
  );
  return json({ user: toUser(row) });
}

/** GET /api/me/export: everything we hold about the account, as JSON. */
export async function exportData(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const [account, crawls, stops, ratings] = await env.DB.batch([
    env.DB.prepare(
      `SELECT email, display_name, username, created_at, email_verified_at, terms_version, terms_accepted_at
       FROM users WHERE id = ?`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT slug, name, country_code, area_place_id, meet_place_id, starts_at, minutes_per_stop,
              is_public, published_at, copy_count, shared_views, created_at, updated_at
       FROM crawls WHERE owner_id = ? ORDER BY created_at`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT c.slug, s.place_id, s.position, s.visited_on, s.note, s.created_at
       FROM stops s JOIN crawls c ON c.id = s.crawl_id WHERE c.owner_id = ? ORDER BY c.id, s.position`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT c.slug AS crawl, c.name AS crawl_name, r.stars, r.created_at, r.updated_at
       FROM ratings r JOIN crawls c ON c.id = r.crawl_id WHERE r.user_id = ?`,
    ).bind(user.id),
  ]);
  const stopsBySlug = new Map<string, unknown[]>();
  for (const s of stops.results as { slug: string }[]) {
    const { slug, ...rest } = s;
    stopsBySlug.set(slug, [...(stopsBySlug.get(slug) ?? []), rest]);
  }
  const data = {
    exportedAt: new Date().toISOString(),
    note: "Pubs and places are stored as Google Place IDs. Look one up at https://www.google.com/maps/place/?q=place_id:<id>",
    account: account.results[0] ?? null,
    crawls: (crawls.results as { slug: string }[]).map((c) => ({ ...c, stops: stopsBySlug.get(c.slug) ?? [] })),
    ratingsGiven: ratings.results,
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pint-route-data.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/** POST /api/me/delete { password }: deletes the account, its crawls and ratings, and logs out. */
export async function deleteAccount(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  body: Record<string, unknown>,
): Promise<Response> {
  const user = await requireUser(request, env);
  await confirmPassword(request, env, user.id, user.email, body.password);
  const mine = "SELECT id FROM crawls WHERE owner_id = ?";
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ratings WHERE user_id = ? OR crawl_id IN (${mine})`).bind(user.id, user.id),
    env.DB.prepare(`DELETE FROM stops WHERE crawl_id IN (${mine})`).bind(user.id),
    env.DB.prepare("DELETE FROM crawls WHERE owner_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM email_verifications WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  ctx.waitUntil(
    sendEmail(env, { to: user.email, ...accountNoticeEmail(user.name, "deleted", appUrl(env, request)) }).catch((err) =>
      console.error("notice email failed", err),
    ),
  );
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
}
