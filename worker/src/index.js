// Q-MIND dashboard API: a small document store on Cloudflare D1.
// Every request must carry "Authorization: Bearer <sha256 hex of a password>".
// DASHBOARD_PASSWORD gives anonymous access: everything except who applied for a question.
// ADMIN_PASSWORDS (comma-separated, each ending in _FirstnameLastname) also shows the applicants.

import { articlesApi, ingest } from "./articles.js";

const COLLECTIONS = ["projects", "questions", "supervisors", "activity"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 512 * 1024;

const enc = new TextEncoder();

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

function fromHex(hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function same(a, b) {
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Returns null, or { admin, name } for the password that was used.
async function viewerOf(req, env) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("Authorization") || "");
  const given = m && fromHex(m[1]);
  if (!given) return null;
  let viewer = null;
  for (const pw of String(env.ADMIN_PASSWORDS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (same(given, await sha256(pw))) {
      viewer = { admin: true, name: pw.slice(pw.lastIndexOf("_") + 1).replace(/([a-z])([A-Z])/g, "$1 $2") };
    }
  }
  if (!viewer && env.DASHBOARD_PASSWORD && same(given, await sha256(env.DASHBOARD_PASSWORD))) viewer = { admin: false, name: "" };
  return viewer;
}

const list = (x) => (Array.isArray(x) ? x : []);

// What an anonymous viewer gets to see of a question: that someone applied, not who.
function redact(col, doc, viewer) {
  if (viewer.admin || col !== "questions" || !doc || !Array.isArray(doc.applicants)) return doc;
  return { ...doc, applicants: doc.applicants.map((a) => ({ id: a.id, at: a.at, hidden: true })) };
}

// An anonymous viewer only holds hidden applicants, so their writes can add an application but never change or drop one.
function keepApplicants(col, incoming, stored, viewer) {
  if (viewer.admin || col !== "questions") return incoming;
  const have = list(stored && stored.applicants);
  if (!("applicants" in incoming)) return stored ? { ...incoming, applicants: have } : incoming;
  const ids = new Set(have.map((a) => a.id));
  const added = list(incoming.applicants).filter((a) => a && !a.hidden && a.id && !ids.has(a.id));
  return { ...incoming, applicants: have.concat(added) };
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowed.includes("*")) h["Access-Control-Allow-Origin"] = "*";
  else if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

async function readDoc(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) return { error: 413 };
  let doc;
  try { doc = JSON.parse(text); } catch (e) { return { error: 400 }; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: 400 };
  return { doc };
}

export default {
  // Nightly search for new related articles (see [triggers] in wrangler.toml).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ingest(env));
  },

  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const viewer = await viewerOf(req, env);
    if (!viewer) return json({ error: "unauthorized" }, 401);

    const path = new URL(req.url).pathname;

    if (path === "/api/data" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT col, id, data FROM docs ORDER BY col, id").all();
      const data = {};
      for (const c of COLLECTIONS) data[c] = {};
      for (const r of results) if (data[r.col]) data[r.col][r.id] = redact(r.col, JSON.parse(r.data), viewer);
      return json({ data, viewer });
    }

    if (path === "/api/articles" || path.startsWith("/api/articles/")) return articlesApi(req, env, viewer, path, json);

    const m = /^\/api\/docs\/([a-z]+)\/([^/]+)$/.exec(path);
    if (!m) return json({ error: "not_found" }, 404);
    const col = m[1];
    const id = decodeURIComponent(m[2]);
    if (!COLLECTIONS.includes(col) || !ID.test(id)) return json({ error: "bad_request" }, 400);
    const now = new Date().toISOString();

    const load = async () => {
      const row = await env.DB.prepare("SELECT data FROM docs WHERE col = ?1 AND id = ?2").bind(col, id).first();
      return row ? JSON.parse(row.data) : null;
    };

    if (req.method === "PUT") {
      const b = await readDoc(req);
      if (b.error) return json({ error: "bad_request" }, b.error);
      if (!viewer.admin && col === "questions") b.doc = keepApplicants(col, b.doc, await load(), viewer);
      await env.DB.prepare(
        "INSERT INTO docs (col, id, data, updated_at) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      ).bind(col, id, JSON.stringify(b.doc), now).run();
      return json({ doc: redact(col, b.doc, viewer) });
    }

    if (req.method === "PATCH") {
      const b = await readDoc(req);
      if (b.error) return json({ error: "bad_request" }, b.error);
      const stored = await load();
      if (!stored) return json({ error: "not_found" }, 404);
      const doc = Object.assign({}, stored, keepApplicants(col, b.doc, stored, viewer));
      await env.DB.prepare("UPDATE docs SET data = ?3, updated_at = ?4 WHERE col = ?1 AND id = ?2")
        .bind(col, id, JSON.stringify(doc), now).run();
      return json({ doc: redact(col, doc, viewer) });
    }

    if (req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM docs WHERE col = ?1 AND id = ?2").bind(col, id).run();
      return json({ doc: null });
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
