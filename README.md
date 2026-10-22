# JJ Links Open

**So many links, one single dashboard.**

JJ Links is a self-hosted control plane for branded short links served by [Cloudflare Bulk Redirects](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/). It gives one owner a searchable inventory, request analytics, guarded create and update workflows, system health, audit history and rollback snapshots without placing the dashboard in the redirect-serving path.

This repository is the clean public edition of a production tool. It contains synthetic examples only. No private redirects, analytics, account identifiers or deployment credentials are included.

## Why it exists

Cloudflare already provides an excellent, fast redirect engine. JJ Links adds the missing personal operating surface around it:

- see every short link and destination in one calm interface;
- search sources, targets and notes;
- inspect Cloudflare request activity and optional legacy history;
- create redirects with collision checks and live verification;
- update redirects only after an immutable D1 snapshot;
- keep serving independent of the dashboard.

If JJ Links is offline, every short URL continues to work because Cloudflare still serves the redirects directly.

## Quick start: sample mode

Requirements: Node.js 22.13 or later.

```bash
git clone https://github.com/jardenberg/jj-links-open.git
cd jj-links-open
npm install
npm run dev
```

Open the local URL printed by the development server. Without Cloudflare credentials, the application uses the synthetic redirects and analytics in `data/`.

Run the release checks with:

```bash
npm test
npm run build
```

## Connect your Cloudflare account

JJ Links currently supports exactly two short-link hostnames. Copy `.env.example` to `.dev.vars` for local development and provide:

```dotenv
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_LIST_ID=...
CLOUDFLARE_RULESET_ID=...
JJ_LINKS_SOURCE_HOSTS=go.example.com,ai.example.com
JJ_LINKS_OWNER_EMAIL=you@example.com
```

Create a Cloudflare API token limited to the account and zone you operate. The complete feature set requires:

- Account Filter Lists: Edit
- Account Rulesets: Read
- Zone Analytics: Read

Store the token as a server-side secret. Never put it in `.env.example`, a client-side variable, a screenshot, an issue or a commit.

See [Deployment](docs/DEPLOYMENT.md) for D1 setup, authentication, first synchronization and production verification.

## Safety model

JJ Links can modify an entire Bulk Redirect List, so the safe path matters:

1. Writes require an authenticated owner and a same-origin request.
2. New links are rejected on case-insensitive collision.
3. Updates require an explicit confirmation.
4. The current full list is stored as an immutable D1 snapshot before replacement.
5. JJ Links waits for Cloudflare's asynchronous operation to finish.
6. It rereads and reconciles the complete list.
7. It verifies the changed public URL and a redirect on the other configured host.

The application intentionally does not sit between visitors and their redirect destinations.

## Architecture

```text
owner browser
     |
     v
JJ Links application -----> Cloudflare API
     |                         |
     v                         v
Cloudflare D1          Bulk Redirect List
                               |
visitor ---- short URL --------+----> destination
```

Read [Architecture](docs/ARCHITECTURE.md) for data flow, trust boundaries and trade-offs.

## Data and privacy

- `data/redirects.csv` and `data/legacy-history.json` are synthetic preview fixtures.
- Real inventory is read from Cloudflare at runtime.
- D1 stores analytics, inventory cache, audit events and pre-update snapshots.
- The owner email and Cloudflare token belong in deployment secrets.
- A public Git repository is not a backup location for real redirect exports.

## Project status

Version `1.0.0` is the first public reference release. It reflects a working personal deployment, but remains intentionally small: one owner, one Cloudflare account, one Bulk Redirect List and two source hostnames.

Issues and pull requests are welcome. Please read [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md) first.

## License

[MIT](LICENSE). Use it, change it, ship it and make it yours.

Created by [Joakim Jardenberg](https://github.com/jardenberg) as a small gift to everyone who wants their links back under their own control.
