// Copies the data inside a saved dashboard file (qmind-dashboard*.html) into the database.
// Usage:  QMIND_PASSWORD=... node tools/import.mjs <dashboard.html> <api-url>
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [file, api] = process.argv.slice(2);
const password = process.env.QMIND_PASSWORD;
if (!file || !api || !password) {
  console.error("Usage: QMIND_PASSWORD=... node tools/import.mjs <dashboard.html> <api-url>");
  process.exit(1);
}

const html = readFileSync(file, "utf8");
const open = '<script id="seed" type="application/json">';
const a = html.indexOf(open);
if (a === -1) { console.error("No dashboard data found in " + file); process.exit(1); }
const seed = JSON.parse(html.slice(a + open.length, html.indexOf("</script>", a)));

const key = createHash("sha256").update(password).digest("hex");
const base = api.replace(/\/+$/, "");
let n = 0;
for (const [col, docs] of Object.entries(seed.data || {})) {
  for (const [id, doc] of Object.entries(docs || {})) {
    const r = await fetch(`${base}/api/docs/${col}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!r.ok) { console.error(`Failed on ${col}/${id}: HTTP ${r.status}`); process.exit(1); }
    n++;
  }
}
console.log(`Imported ${n} documents into ${base}`);
