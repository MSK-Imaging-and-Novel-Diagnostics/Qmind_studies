// Related articles: nightly PubMed searches stored in D1, with a read state and reading list per named viewer.

// Raise SEARCH_VERSION after every change to a search, so it is clear which searches filled the table.
export const SEARCH_VERSION = 2;

const HUMANS = " NOT (animals[mh] NOT humans[mh])";

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

// Shape modelling of the knee, hip and ankle.
const SHAPE =
  '("statistical shape"[tiab] OR "shape model"[tiab] OR "shape models"[tiab] OR "shape modeling"[tiab] OR "shape modelling"[tiab] ' +
  'OR "active shape"[tiab] OR "neural shape"[tiab] OR "shape analysis"[tiab] OR "shape variation"[tiab] OR "shape variations"[tiab] ' +
  'OR "bone shape"[tiab] OR "geometric morphometric"[tiab] OR "geometric morphometrics"[tiab] OR "statistical appearance"[tiab] ' +
  'OR "shape score"[tiab] OR "B-score"[tiab])';
const JOINTS =
  '("Knee Joint"[mh] OR "Knee"[mh] OR "Hip Joint"[mh] OR "Hip"[mh] OR "Ankle Joint"[mh] OR "Ankle"[mh] OR "Femur"[mh] OR "Tibia"[mh] ' +
  'OR "Patella"[mh] OR "Talus"[mh] OR "Acetabulum"[mh] OR "Pelvic Bones"[mh] ' +
  'OR knee[tiab] OR knees[tiab] OR hip[tiab] OR hips[tiab] OR ankle[tiab] OR ankles[tiab] OR femur[tiab] OR femoral[tiab] ' +
  'OR tibia[tiab] OR tibial[tiab] OR patella[tiab] OR patellar[tiab] OR patellofemoral[tiab] OR tibiofemoral[tiab] ' +
  'OR talus[tiab] OR talar[tiab] OR calcaneus[tiab] OR acetabulum[tiab] OR acetabular[tiab] OR femoroacetabular[tiab] ' +
  'OR trochlea[tiab] OR trochlear[tiab] OR subtalar[tiab] OR hindfoot[tiab])';

// Osteochondral lesions of the talus and ankle.
const OCL =
  '("osteochondral lesion"[tiab] OR "osteochondral lesions"[tiab] OR "osteochondral defect"[tiab] OR "osteochondral defects"[tiab] ' +
  'OR "osteochondritis dissecans"[tiab] OR "Osteochondritis Dissecans"[mh] OR "osteochondral injury"[tiab] OR "osteochondral injuries"[tiab] ' +
  'OR "osteochondral fracture"[tiab] OR "osteochondral fractures"[tiab] OR "cartilage lesion"[tiab] OR "cartilage lesions"[tiab] ' +
  'OR "chondral lesion"[tiab] OR "chondral lesions"[tiab] OR "cartilage defect"[tiab] OR "cartilage defects"[tiab] OR OLT[tiab] OR OCD[tiab])';
const TALUS = '("Talus"[mh] OR talus[tiab] OR talar[tiab] OR "talar dome"[tiab] OR "Ankle Joint"[mh] OR ankle[tiab] OR tibiotalar[tiab])';

export const TOPICS = [
  { id: "body-composition", label: "Body composition", term: FAT + " AND " + IMAGING + HUMANS },
  { id: "shape", label: "Shape modelling", term: SHAPE + " AND " + JOINTS + HUMANS },
  { id: "talus-ocl", label: "Talus and osteochondral lesions", term: OCL + " AND " + TALUS + HUMANS },
];
const TOPIC_IDS = TOPICS.map((t) => t.id);

// Articles by these authors are marked as the group's own work.
// Full initials only: "Wesselink E" and "Beekman K" also match other researchers.
export const OWN_AUTHORS = '("Wesselink EO"[au] OR "Hemke R"[au] OR "Beekman KM"[au])';
const OWN_NAME = /^(wesselink eo|hemke r|beekman km)$/i;

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

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// PubMed allows 3 requests per second without a key, so space the requests and retry when it says "too many".
export async function eutils(endpoint, params, apiKey) {
  const body = new URLSearchParams({ db: "pubmed", retmode: "json", tool: TOOL, ...params });
  if (apiKey) body.set("api_key", apiKey);
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    await pause(attempt ? 1500 * attempt : 400);
    r = await fetch(EUTILS + endpoint, { method: "POST", body: new URLSearchParams(body) });
    if (r.status !== 429 && r.status < 500) break;
  }
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
    own: authors.some((n) => OWN_NAME.test(String(n).trim())) ? 1 : 0,
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

export const COLS = ["pmid", "title", "authors", "journal", "year", "pubdate", "volume", "issue", "pages", "doi", "ptypes", "own", "found"];

async function setMeta(env, values) {
  const st = env.DB.prepare("INSERT INTO article_meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  await env.DB.batch(Object.entries(values).map(([k, v]) => st.bind(k, String(v))));
}

// Totals per topic are counted once per run and kept in article_meta, so that opening the page does not scan the table.
async function refreshCounts(env) {
  const { results } = await env.DB.prepare(
    "SELECT t.topic AS topic, COUNT(*) AS total, SUM(a.own) AS own FROM article_topics t JOIN articles a ON a.pmid = t.pmid GROUP BY t.topic"
  ).all();
  const all = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(own) AS own FROM articles").first();
  const values = { "total:": all.total || 0, "own:": all.own || 0 };
  for (const t of TOPICS) {
    const r = results.find((x) => x.topic === t.id) || {};
    values["total:" + t.id] = r.total || 0;
    values["own:" + t.id] = r.own || 0;
  }
  await setMeta(env, values);
  return values;
}

// The nightly run: per topic, everything PubMed added in the last 30 days that is not in the table yet.
export async function ingest(env) {
  const now = new Date().toISOString();
  try {
    const pairs = [];
    for (const t of TOPICS) {
      const s = await eutils("esearch.fcgi", { term: t.term, reldate: String(DAILY_RELDATE), datetype: "edat", retmax: "2000", sort: "pub_date" }, env.NCBI_API_KEY);
      for (const id of s.esearchresult.idlist || []) if (Number(id)) pairs.push([Number(id), t.id]);
    }
    const ids = [...new Set(pairs.map((p) => p[0]))];
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
      await env.DB.batch(rows.slice(i, i + 40).map((r) => st.bind(...COLS.map((c) => r[c]))));
    }
    // Topic links, also for articles that were already stored under another topic.
    const stored = new Set([...known, ...rows.map((r) => r.pmid)]);
    const links = pairs.filter((p) => stored.has(p[0]));
    for (let i = 0; i < links.length; i += 45) {
      const part = links.slice(i, i + 45);
      await env.DB.prepare("INSERT OR IGNORE INTO article_topics (pmid, topic) VALUES " + part.map(() => "(?, ?)").join(", ")).bind(...part.flat()).run();
    }
    if (rows.length || links.length) await refreshCounts(env);
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
  // ?1 = cut-off for unread, ?2 = reader, ?3 = topic ("" for all)
  const UNREAD = "(a.found >= ?1 AND NOT EXISTS (SELECT 1 FROM article_reads r WHERE r.pmid = a.pmid AND r.reader = ?2))";
  const SAVED = "EXISTS (SELECT 1 FROM article_stars s WHERE s.pmid = a.pmid AND s.reader = ?2)";
  const TOPIC = "(?3 = '' OR EXISTS (SELECT 1 FROM article_topics t WHERE t.pmid = a.pmid AND t.topic = ?3))";

  if (path === "/api/articles" && req.method === "GET") {
    const u = new URL(req.url).searchParams;
    const filter = ["all", "saved", "own"].includes(u.get("filter")) ? u.get("filter") : "unread";
    const topic = TOPIC_IDS.includes(u.get("topic")) ? u.get("topic") : "";
    const q = (u.get("q") || "").trim().slice(0, 100);
    const limit = Math.min(Math.max(parseInt(u.get("limit") || "50", 10) || 0, 0), 100);
    const offset = Math.max(parseInt(u.get("offset") || "0", 10) || 0, 0);

    // Every list starts from a small set or walks an index in display order, so a page costs tens of rows, not the whole table.
    //   unread: the last week, through the index on found      saved: the reader's own stars
    //   own:    the partial index on own work                   all:   the index on found, newest first
    let from = "articles a INDEXED BY articles_found";
    const where = [TOPIC];
    const args = [cut, reader, topic];
    if (filter === "unread") where.push(UNREAD);
    if (filter === "saved") { from = "article_stars s JOIN articles a ON a.pmid = s.pmid"; where.push("s.reader = ?2"); }
    if (filter === "own") { from = "articles a INDEXED BY articles_own"; where.push("a.own = 1"); }
    if (q) {
      args.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
      where.push("(a.title LIKE ?4 ESCAPE '\\' OR a.authors LIKE ?4 ESCAPE '\\' OR a.journal LIKE ?4 ESCAPE '\\')");
    }
    const w = " WHERE " + where.join(" AND ");
    // Own work first in the lists people work through; newest first everywhere.
    const order = filter === "unread" || filter === "saved" ? "a.own DESC, a.found DESC, a.pmid DESC" : "a.found DESC, a.pmid DESC";
    const [items, counts, meta] = await env.DB.batch([
      env.DB.prepare(
        "SELECT a.pmid, a.title, a.authors, a.journal, a.year, a.pubdate, a.volume, a.issue, a.pages, a.doi, a.ptypes, a.own, a.found, " +
        UNREAD + " AS unread, " + SAVED + " AS saved, " +
        "(SELECT group_concat(t.topic) FROM article_topics t WHERE t.pmid = a.pmid) AS topics " +
        "FROM " + from + w + " ORDER BY " + order + " LIMIT " + (limit + 1) + " OFFSET " + offset
      ).bind(...args),
      env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM articles a INDEXED BY articles_found WHERE " + UNREAD + " AND " + TOPIC + ") AS unread, " +
        "(SELECT COUNT(*) FROM articles a INDEXED BY articles_found WHERE " + UNREAD + ") AS unread_all, " +
        "(SELECT COUNT(*) FROM article_stars s WHERE s.reader = ?2 AND (?3 = '' OR EXISTS (SELECT 1 FROM article_topics t WHERE t.pmid = s.pmid AND t.topic = ?3))) AS saved"
      ).bind(cut, reader, topic),
      env.DB.prepare("SELECT key, value FROM article_meta"),
    ]);
    let m = {};
    for (const r of meta.results) m[r.key] = r.value;
    if (m["total:" + topic] == null) m = { ...m, ...(await refreshCounts(env)) };
    const c = counts.results[0];
    const own = Number(m["own:" + topic]) || 0;
    const page = items.results.slice(0, limit);
    // A search has no cheap total; the page then only knows whether there is more.
    const total = q ? null : filter === "unread" ? c.unread : filter === "saved" ? c.saved : filter === "own" ? own : Number(m["total:" + topic]) || 0;
    return json({
      items: page.map((r) => ({ ...r, own: !!r.own, unread: !!r.unread, saved: !!r.saved, topics: r.topics ? r.topics.split(",") : [] })),
      total, more: items.results.length > limit,
      unread: c.unread, unreadAll: c.unread_all, saved: c.saved, own,
      topics: TOPICS.map((t) => ({ id: t.id, label: t.label })),
      canMark: viewer.admin,
      updated: m.last_ok || "",
      error: m.last_error || "",
    });
  }

  // The searches in use, plus the feedback named viewers left on them.
  if (path === "/api/articles/search" && req.method === "GET") {
    let feedback = [];
    if (viewer.admin) {
      feedback = (await env.DB.prepare("SELECT id, author, text, created_at FROM article_feedback ORDER BY created_at DESC, id DESC LIMIT 200").all()).results;
    }
    return json({ topics: TOPICS, version: SEARCH_VERSION, canComment: viewer.admin, feedback });
  }

  if (!viewer.admin) return json({ error: "forbidden" }, 403);
  const now = new Date().toISOString();

  if (path === "/api/articles/feedback" && req.method === "POST") {
    let text = "";
    try { text = String((await req.json()).text || "").trim(); } catch (e) {}
    if (!text || text.length > 4000) return json({ error: "bad_request" }, 400);
    await env.DB.prepare("INSERT INTO article_feedback (author, text, created_at, search_version) VALUES (?1, ?2, ?3, ?4)")
      .bind(reader, text, now, SEARCH_VERSION).run();
    return json({ ok: true });
  }
  const fb = /^\/api\/articles\/feedback\/(\d{1,9})$/.exec(path);
  if (fb && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM article_feedback WHERE id = ?1 AND author = ?2").bind(Number(fb[1]), reader).run();
    return json({ ok: true });
  }

  if (path === "/api/articles/read-all" && req.method === "POST") {
    const topic = TOPIC_IDS.includes(new URL(req.url).searchParams.get("topic")) ? new URL(req.url).searchParams.get("topic") : "";
    await env.DB.prepare(
      "INSERT OR IGNORE INTO article_reads (pmid, reader, read_at) SELECT a.pmid, ?2, ?4 FROM articles a WHERE " + TOPIC + " AND " + UNREAD
    ).bind(cut, reader, topic, now).run();
    return json({ ok: true });
  }

  if (path === "/api/articles/refresh" && req.method === "POST") return json(await ingest(env));

  const m = /^\/api\/articles\/(\d{1,9})\/(read|star)$/.exec(path);
  if (m && (req.method === "PUT" || req.method === "DELETE")) {
    const table = m[2] === "read" ? "article_reads" : "article_stars";
    const col = m[2] === "read" ? "read_at" : "starred_at";
    if (req.method === "PUT") {
      await env.DB.prepare("INSERT OR IGNORE INTO " + table + " (pmid, reader, " + col + ") VALUES (?1, ?2, ?3)").bind(Number(m[1]), reader, now).run();
    } else {
      await env.DB.prepare("DELETE FROM " + table + " WHERE pmid = ?1 AND reader = ?2").bind(Number(m[1]), reader).run();
    }
    return json({ ok: true });
  }
  return json({ error: "not_found" }, 404);
}
