# Q-MIND research questions

Dashboard for collecting research questions per dataset, for student projects.
Amsterdam UMC, Department of Radiology and Nuclear Medicine.

## How it fits together

| Part | Where | What |
| --- | --- | --- |
| Site | `index.html`, `qmind_logo.png`, `qmind_icon.png` | Static page, served by GitHub Pages. Contains no project data and no password. |
| API | `worker/` | Cloudflare Worker. Checks the password and reads and writes the data. |
| Data | Cloudflare D1 database `qmind` | One table, `docs`, holding projects, questions, supervisors and the activity log as JSON. |

The page asks for the password, sends its SHA-256 hash to the API with every request, and the API compares it with the `DASHBOARD_PASSWORD` secret. Open pages pick up each other's changes within 20 seconds.

## Setting up the API

Run these in `worker/`. You need a Cloudflare account.

```
npm install
npx wrangler login
npx wrangler d1 create qmind
```

Copy the `database_id` that the last command prints into `wrangler.toml`, then:

```
npx wrangler d1 execute qmind --remote --file schema.sql
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler deploy
```

`wrangler deploy` prints the API address (`https://qmind-api.<account>.workers.dev`). Put it in `index.html`:

```js
var API = "https://qmind-api.<account>.workers.dev";
```

Then set `ALLOWED_ORIGINS` in `wrangler.toml` to the address of the site (for example `https://<user>.github.io`) and deploy again, so only that site can call the API from a browser.

On Windows on ARM, `npm install` skips the Worker runtime. Add it with
`npm install --no-save --force @cloudflare/workerd-windows-64@<version of workerd in node_modules>`.

## Publishing the site

Push this repository to GitHub and turn on Pages (Settings, Pages, deploy from branch `main`, folder `/`).

## Moving existing data in

`tools/import.mjs` copies the data from a saved single-file dashboard (`qmind-dashboard*.html`) into the database:

```
QMIND_PASSWORD=... node tools/import.mjs qmind-dashboard.html https://qmind-api.<account>.workers.dev
```

## Passwords

There are two levels, both stored as Worker secrets:

- `DASHBOARD_PASSWORD`: the shared password. Shows everything except who applied for a question; applicants appear as "Applicant" with a date.
- `ADMIN_PASSWORDS`: a comma-separated list of personal passwords, each ending in `_FirstnameLastname`. These also show the applicants, and the name is used in the activity log.

The names are removed by the API, so they never reach the browser of someone using the shared password.

```
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put ADMIN_PASSWORDS
```

After a change, everyone has to enter their new password the next time they open the page.

## Related articles

The Related articles page lists PubMed articles found by a search that runs inside the Worker every night at 02:15 UTC (`[triggers]` in `wrangler.toml`).

- **Search**: `SEARCH_TERM` in `worker/src/articles.js`. Currently body composition on MRI or CT (subcutaneous, visceral, intramuscular and intermuscular fat and related terms), humans only. Raise `SEARCH_VERSION` when you change it.
- **Nightly run**: asks PubMed for everything added in the last 30 days, and stores the articles that are not in the `articles` table yet. No abstracts are stored.
- **Unread**: an article is unread for 7 days after it was found. People with a personal password can mark it as read sooner; this is stored per person in `article_reads`. With the shared password the same list is shown as "New", without read marks.
- **Status**: `article_meta` holds the time of the last successful run and the last error. The page shows "Last update failed" when the last run went wrong.
- **Feedback on the search**: the "Search string" button shows the search in use. People with a personal password can leave feedback there; it is stored in `article_feedback` and returned by `GET /api/articles/search`.
- **Run it now**: `POST /api/articles/refresh` with a personal password.
- **Fill from scratch or after changing the search**: `node tools/backfill_articles.mjs out.sql`, then in `worker/`: `npx wrangler d1 execute qmind --remote --file ../out.sql`. This fetches all years and takes about half an hour.

Optional: set an `NCBI_API_KEY` secret to raise PubMed's rate limit. It is not needed for the nightly run.

## Testing locally

Create `worker/.dev.vars` with `DASHBOARD_PASSWORD=something` and `ADMIN_PASSWORDS=something_TestUser`, then in `worker/`:

```
npx wrangler d1 execute qmind --local --file schema.sql
npx wrangler dev
```

Set `API` in `index.html` to `http://127.0.0.1:8787` and open the page through a local web server.
