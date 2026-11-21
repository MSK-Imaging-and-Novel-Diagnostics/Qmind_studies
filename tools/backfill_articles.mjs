// One-off: fetch every article the search matches, over all years, and write it as SQL for D1.
// Usage:  node tools/backfill_articles.mjs out.sql
//         cd worker && npx wrangler d1 execute qmind --remote --file ../out.sql
import { writeFileSync } from "node:fs";
import { SEARCH_TERM, SEARCH_VERSION, TOPIC, eutils, summaries, toRow } from "../worker/src/articles.js";

const out = process.argv[2];
if (!out) { console.error("Usage: node tools/backfill_articles.mjs out.sql"); process.exit(1); }
const key = process.env.NCBI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn) => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await sleep(2000 * (i + 1)); }
  }
};

// PubMed returns at most 9,999 ids per search, so search year by year.
const ids = new Set();
const thisYear = new Date().getFullYear();
const ranges = [[1900, 1989]];
for (let y = 1990; y <= thisYear + 1; y++) ranges.push([y, y]);
for (const [a, b] of ranges) {
  const d = await retry(() => eutils("esearch.fcgi", { term: SEARCH_TERM, datetype: "pdat", mindate: String(a), maxdate: String(b), retmax: "9999" }, key));
  const n = Number(d.esearchresult.count);
  if (n > 9999) throw new Error("More than 9,999 articles in " + a + "-" + b + "; split this range.");
  for (const id of d.esearchresult.idlist) ids.add(Number(id));
  await sleep(400);
}
console.log(ids.size + " articles found");

const all = [...ids].sort((x, y) => x - y);
const rows = [];
for (let i = 0; i < all.length; i += 200) {
  const part = await retry(() => summaries(all.slice(i, i + 200), key));
  // Found = the day PubMed added it, so only this week's articles start as unread.
  for (const r of part) { const row = toRow(r, ""); row.found = (row.entrez || row.pubdate || "1900-01-01") + "T00:00:00.000Z"; rows.push(row); }
  if ((i / 200) % 10 === 0) console.log(rows.length + " / " + all.length);
  await sleep(400);
}

const COLS = ["pmid", "title", "authors", "journal", "year", "pubdate", "volume", "issue", "pages", "doi", "ptypes", "topic", "found"];
const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const now = new Date().toISOString();
const lines = [];
for (let i = 0; i < rows.length; i += 100) {
  lines.push("INSERT OR IGNORE INTO articles (" + COLS.join(", ") + ") VALUES\n" +
    rows.slice(i, i + 100).map((r) => "(" + COLS.map((c) => q(c === "topic" ? TOPIC : r[c])).join(", ") + ")").join(",\n") + ";");
}
for (const [k, v] of Object.entries({ last_run: now, last_ok: now, last_added: rows.length, last_error: "", search_version: SEARCH_VERSION })) {
  lines.push("INSERT INTO article_meta (key, value) VALUES (" + q(k) + ", " + q(String(v)) + ") ON CONFLICT (key) DO UPDATE SET value = excluded.value;");
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(rows.length + " rows written to " + out);
