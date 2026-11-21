// Fetch every article a search matches, over all years, and write it as SQL for D1.
// Usage:  node tools/backfill_articles.mjs out.sql [topic-id ...]     (no topic ids = all topics)
//         cd worker && npx wrangler d1 execute qmind --remote --file ../out.sql
// It also marks the group's own work (OWN_AUTHORS) across all topics.
import { writeFileSync } from "node:fs";
import { TOPICS, OWN_AUTHORS, SEARCH_VERSION, COLS, eutils, summaries, toRow } from "../worker/src/articles.js";

const [out, ...wanted] = process.argv.slice(2);
if (!out) { console.error("Usage: node tools/backfill_articles.mjs out.sql [topic-id ...]"); process.exit(1); }
const topics = wanted.length ? TOPICS.filter((t) => wanted.includes(t.id)) : TOPICS;
if (wanted.length !== 0 && topics.length !== wanted.length) { console.error("Unknown topic. Known: " + TOPICS.map((t) => t.id).join(", ")); process.exit(1); }
const key = process.env.NCBI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn) => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await sleep(2000 * (i + 1)); }
  }
};

// PubMed returns at most 9,999 ids per search, so search year by year.
const thisYear = new Date().getFullYear();
const ranges = [[1900, 1989]];
for (let y = 1990; y <= thisYear + 1; y++) ranges.push([y, y]);
async function allIds(term) {
  const ids = new Set();
  const first = await retry(() => eutils("esearch.fcgi", { term, retmax: "9999" }, key));
  if (Number(first.esearchresult.count) <= 9999) { for (const id of first.esearchresult.idlist) ids.add(Number(id)); return ids; }
  for (const [a, b] of ranges) {
    const d = await retry(() => eutils("esearch.fcgi", { term, datetype: "pdat", mindate: String(a), maxdate: String(b), retmax: "9999" }, key));
    if (Number(d.esearchresult.count) > 9999) throw new Error("More than 9,999 articles in " + a + "-" + b + "; split this range.");
    for (const id of d.esearchresult.idlist) ids.add(Number(id));
    await sleep(400);
  }
  return ids;
}

const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const lines = [];
const byTopic = {};
const ids = new Set();
for (const t of topics) {
  byTopic[t.id] = [...(await allIds(t.term))];
  for (const id of byTopic[t.id]) ids.add(id);
  console.log(t.id + ": " + byTopic[t.id].length + " articles");
  await sleep(400);
}

const all = [...ids].sort((x, y) => x - y);
const rows = [];
for (let i = 0; i < all.length; i += 200) {
  const part = await retry(() => summaries(all.slice(i, i + 200), key));
  // Found = the day PubMed added it, so only this week's articles start as unread.
  for (const r of part) { const row = toRow(r, ""); row.found = (row.entrez || row.pubdate || "1900-01-01") + "T00:00:00.000Z"; rows.push(row); }
  if ((i / 200) % 10 === 0) console.log(rows.length + " / " + all.length);
  await sleep(400);
}
for (let i = 0; i < rows.length; i += 100) {
  lines.push("INSERT OR IGNORE INTO articles (" + COLS.join(", ") + ") VALUES\n" +
    rows.slice(i, i + 100).map((r) => "(" + COLS.map((c) => q(r[c])).join(", ") + ")").join(",\n") + ";");
}
const have = new Set(rows.map((r) => r.pmid));
for (const t of topics) {
  const list = byTopic[t.id].filter((id) => have.has(id));
  for (let i = 0; i < list.length; i += 500) {
    lines.push("INSERT OR IGNORE INTO article_topics (pmid, topic) VALUES " + list.slice(i, i + 500).map((id) => "(" + id + ", " + q(t.id) + ")").join(", ") + ";");
  }
}

// Own work, for every topic (also the ones not fetched in this run).
const own = new Set();
for (const t of TOPICS) {
  const d = await retry(() => eutils("esearch.fcgi", { term: "(" + t.term + ") AND " + OWN_AUTHORS, retmax: "9999" }, key));
  for (const id of d.esearchresult.idlist) own.add(Number(id));
  await sleep(400);
}
if (own.size) lines.push("UPDATE articles SET own = 1 WHERE pmid IN (" + [...own].join(", ") + ");");
console.log(own.size + " own articles");

const now = new Date().toISOString();
for (const [k, v] of Object.entries({ last_run: now, last_ok: now, last_error: "", search_version: SEARCH_VERSION })) {
  lines.push("INSERT INTO article_meta (key, value) VALUES (" + q(k) + ", " + q(String(v)) + ") ON CONFLICT (key) DO UPDATE SET value = excluded.value;");
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(rows.length + " rows written to " + out);
