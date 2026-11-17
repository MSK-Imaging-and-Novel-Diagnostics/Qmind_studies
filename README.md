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

## Changing the password

```
npx wrangler secret put DASHBOARD_PASSWORD
```

Everyone has to enter the new password the next time they open the page.

## Testing locally

Create `worker/.dev.vars` with `DASHBOARD_PASSWORD=something`, then in `worker/`:

```
npx wrangler d1 execute qmind --local --file schema.sql
npx wrangler dev
```

Set `API` in `index.html` to `http://127.0.0.1:8787` and open the page through a local web server.
