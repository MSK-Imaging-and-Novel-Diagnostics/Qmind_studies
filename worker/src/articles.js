// Related articles: a nightly PubMed search stored in D1, with a read state per named viewer.

// Raise SEARCH_VERSION after every change to the search, so it is clear which search filled the table.
export const SEARCH_VERSION = 1;
export const TOPIC = "body-composition";

// Body composition on MRI or CT: subcutaneous, visceral, intramuscular and intermuscular fat, and related terms.
const FAT =
  '("Body Composition"[mh] OR "Adiposity"[mh] OR "Intra-Abdominal Fat"[mh] OR "Subcutaneous Fat"[mh] OR "Adipose Tissue"[majr] ' +
  'OR "body composition"[tiab] OR "visceral fat"[tiab] OR "visceral adipose"[tiab] OR "visceral adiposity"[tiab] ' +
  'OR "intra-abdominal fat"[tiab] OR "abdominal fat"[tiab] OR "abdominal adipose"[tiab] ' +
  'OR "subcutaneous fat"[tiab] OR "subcutaneous adipose"[tiab] ' +
  'OR "intramuscular fat"[tiab] OR "intramuscular adipose"[tiab] OR "intermuscular fat"[tiab] OR "intermuscular adipose"[tiab] ' +
  'OR "muscle fat"[tiab] OR "muscle adipose"[tiab] OR "fat infiltration"[tiab] OR "fatty infiltration"[tiab] ' +
  'OR "myosteatosis"[tiab] OR "muscle attenuation"[tiab] OR "muscle density"[tiab] ' +
  'OR "ectopic fat"[tiab] OR "epicardial fat"[tiab] OR "epicardial adipose"[tiab] OR "perirenal fat"[tiab] ' +
  'OR "fat fraction"[tiab] OR "adipose tissue volume"[tiab] OR "adipose tissue area"[tiab] OR "sarcopenic obesity"[tiab])';
const IMAGING =
  '("Magnetic Resonance Imaging"[mh] OR "Tomography, X-Ray Computed"[mh] OR MRI[tiab] OR "magnetic resonance"[tiab] ' +
  'OR "computed tomography"[tiab] OR CT[tiab] OR Dixon[tiab])';
export const SEARCH_TERM = FAT + " AND " + IMAGING + " NOT (animals[mh] NOT humans[mh])";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const TOOL = "qmind-dashboard";
export const UNREAD_DAYS = 7;
const DAILY_RELDATE = 30;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function clean(s) {
  return String(s == null ? "" : s)
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function eutils(endpoint, params, apiKey) {
  const body = new URLSearchParams({ db: "pubmed", retmode: "json", tool: TOOL, ...params });
  if (apiKey) body.set("api_key", apiKey);
  const r = await fetch(EUTILS + endpoint, { method: "POST", body });
  if (!r.ok) throw new Error(endpoint + " HTTP " + r.status);
  const d = await r.json();
  const err = d.error || (d.esearchresult && d.esearchresult.ERROR);
  if (err) throw new Error(endpoint + ": " + err);
  return d;
}

// One esummary record -> one row. `found` is when the article entered this database.
export function toRow(r, found) {
  const ids = Array.isArray(r.articleids) ? r.articleids : [];
  const doi = (ids.find((x) => x.idtype === "doi") || {}).value || "";
  const authors = (Array.isArray(r.authors) ? r.authors : []).map((a) => a.name).filter(Boolean);
  const entrez = ((Array.isArray(r.history) ? r.history : []).find((x) => x.pubstatus === "entrez") || {}).date || "";
  const sort = String(r.sortpubdate || "").slice(0, 10).replace(/\//g, "-");
  return {
    pmid: Number(r.uid),
    title: clean(r.title).slice(0, 600),
    authors: clean(authors.length > 8 ? authors.slice(0, 7).join(", ") + ", …, " + authors[authors.length - 1] : authors.join(", ")).slice(0, 400),
    journal: clean(r.source || r.fulljournalname).slice(0, 200),
    year: Number(String(r.pubdate || sort).slice(0, 4)) || null,
    pubdate: sort,
    volume: clean(r.volume).slice(0, 40),
    issue: clean(r.issue).slice(0, 40),
    pages: clean(r.pages).slice(0, 60),
    doi: clean(doi).slice(0, 200),
    ptypes: (Array.isArray(r.pubtype) ? r.pubtype : []).join("; ").slice(0, 200),
    entrez: entrez.slice(0, 10).replace(/\//g, "-"),
    found,
  };
}

export async function summaries(pmids, apiKey) {
  const out = [];
  for (let i = 0; i < pmids.length; i += 200) {
    const d = await eutils("esummary.fcgi", { id: pmids.slice(i, i + 200).join(",") }, apiKey);
    for (const uid of (d.result && d.result.uids) || []) {
      const r = d.result[uid];
      if (r && !r.error && r.title) out.push(r);
    }
  }
  return out;
}

const COLS = ["pmid", "title", "authors", "journal", "year", "pubdate", "volume", "issue", "pages", "doi", "ptypes", "topic", "found"];

async function setMeta(env, values) {
  const st = env.DB.prepare("INSERT INTO article_meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  await env.DB.batch(Object.entries(values).map(([k, v]) => st.bind(k, String(v))));
}

// The nightly run: everything PubMed added in the last 30 days that is not in the table yet.
export async function ingest(env) {
  const now = new Date().toISOString();
  try {
    const s = await eutils("esearch.fcgi", { term: SEARCH_TERM, reldate: String(DAILY_RELDATE), datetype: "edat", retmax: "2000", sort: "pub_date" }, env.NCBI_API_KEY);
    const ids = (s.esearchresult.idlist || []).map(Number).filter(Boolean);
    const known = new Set();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const { results } = await env.DB.prepare("SELECT pmid FROM articles WHERE pmid IN (" + part.map(() => "?").join(",") + ")").bind(...part).all();
      for (const r of results) known.add(r.pmid);
    }
    const fresh = ids.filter((id) => !known.has(id));
    const rows = (await summaries(fresh, env.NCBI_API_KEY)).map((r) => toRow(r, now));
    const st = env.DB.prepare("INSERT OR IGNORE INTO articles (" + COLS.join(", ") + ") VALUES (" + COLS.map((_, i) => "?" + (i + 1)).join(", ") + ")");
    for (let i = 0; i < rows.length; i += 40) {
      await env.DB.batch(rows.slice(i, i + 40).map((r) => st.bind(...COLS.map((c) => (c === "topic" ? TOPIC : r[c])))));
    }
    await setMeta(env, { last_run: now, last_ok: now, last_added: rows.length, last_error: "", search_version: SEARCH_VERSION });
    return { ok: true, searched: ids.length, added: rows.length };
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 300);
    await setMeta(env, { last_run: now, last_error: msg }).catch(() => {});
    return { ok: false, error: msg };
  }
}

// ---------- API ----------
export async function articlesApi(req, env, viewer, path, json) {
  const reader = viewer.admin ? viewer.name : "";
  const cut = new Date(Date.now() - UNREAD_DAYS * 86400000).toISOString();
  const UNREAD = "a.found >= ?1 AND NOT EXISTS (SELECT 1 FROM article_reads r WHERE r.pmid = a.pmid AND r.reader = ?2)";

  if (path === "/api/articles" && req.method === "GET") {
    const u = new URL(req.url).searchParams;
    const filter = u.get("filter") === "all" ? "all" : "unread";
    const q = (u.get("q") || "").trim().slice(0, 100);
    const limit = Math.min(Math.max(parseInt(u.get("limit") || "50", 10) || 0, 0), 100);
    const offset = Math.max(parseInt(u.get("offset") || "0", 10) || 0, 0);
    const where = [];
    const args = [cut, reader];
    if (filter === "unread") where.push(UNREAD);
    if (q) {
      args.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
      where.push("(a.title LIKE ?3 ESCAPE '\\' OR a.authors LIKE ?3 ESCAPE '\\' OR a.journal LIKE ?3 ESCAPE '\\')");
    }
    const w = where.length ? " WHERE " + where.join(" AND ") : "";
    const [items, total, unread, meta] = await env.DB.batch([
      env.DB.prepare(
        "SELECT a.pmid, a.title, a.authors, a.journal, a.year, a.pubdate, a.volume, a.issue, a.pages, a.doi, a.ptypes, a.found, " +
        "(" + UNREAD + ") AS unread FROM articles a" + w + " ORDER BY a.found DESC, a.pmid DESC LIMIT " + limit + " OFFSET " + offset
      ).bind(...args),
      env.DB.prepare("SELECT COUNT(*) AS n, ?1 AS a, ?2 AS b FROM articles a" + w).bind(...args),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles a WHERE " + UNREAD).bind(cut, reader),
      env.DB.prepare("SELECT key, value FROM article_meta"),
    ]);
    const m = {};
    for (const r of meta.results) m[r.key] = r.value;
    return json({
      items: items.results.map((r) => ({ ...r, unread: !!r.unread })),
      total: total.results[0].n,
      unread: unread.results[0].n,
      canMark: viewer.admin,
      updated: m.last_ok || "",
      error: m.last_error || "",
    });
  }

  if (!viewer.admin) return json({ error: "forbidden" }, 403);
  const now = new Date().toISOString();

  if (path === "/api/articles/read-all" && req.method === "POST") {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO article_reads (pmid, reader, read_at) SELECT a.pmid, ?2, ?3 FROM articles a WHERE " + UNREAD
    ).bind(cut, reader, now).run();
    return json({ ok: true });
  }

  if (path === "/api/articles/refresh" && req.method === "POST") return json(await ingest(env));

  const m = /^\/api\/articles\/(\d{1,9})\/read$/.exec(path);
  if (m && req.method === "PUT") {
    await env.DB.prepare("INSERT OR IGNORE INTO article_reads (pmid, reader, read_at) VALUES (?1, ?2, ?3)").bind(Number(m[1]), reader, now).run();
    return json({ ok: true });
  }
  if (m && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM article_reads WHERE pmid = ?1 AND reader = ?2").bind(Number(m[1]), reader).run();
    return json({ ok: true });
  }
  return json({ error: "not_found" }, 404);
}
