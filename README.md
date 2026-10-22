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

## The easiest setup: ask an AI assistant

You do not need to be an engineer or a GitHub expert to get JJ Links running. A capable AI coding assistant with access to a browser and terminal can inspect this repository, explain the few account-level choices and guide you through most of the setup.

You will still need to own or control the domains, sign in to Cloudflare, approve security-sensitive changes and decide where the private dashboard should live. The AI should never ask you to paste API tokens into chat or commit them to GitHub.

Copy this prompt into ChatGPT, Claude or another capable coding assistant:

```text
Help me set up my own private JJ Links dashboard from this repository:
https://github.com/jardenberg/jj-links-open

My goal is to manage two branded short-link domains through Cloudflare Bulk
Redirects, with a private dashboard, request analytics, safe create/update
workflows and rollback snapshots.

Please inspect the repository and guide me through the complete setup. Assume I
am comfortable making decisions but do not want to operate Git, a terminal or
Cloudflare configuration without guidance.

Explain each human step briefly in plain language, including why it is needed.
Do as much of the implementation and verification as your available tools allow.

Security requirements:
- Never ask me to paste an API token, password or secret into the conversation.
- Use a narrowly scoped Cloudflare token and store it only as a server-side secret.
- Keep the dashboard private and add the owner-email check as defense in depth.
- Never commit my real redirect export, analytics, account IDs or deployment IDs
  to a public repository.
- Get my explicit confirmation before changing DNS, access permissions, repository
  visibility or an existing production redirect list.

Start by asking only for the information you genuinely need, such as my two short
domains, whether I already have a Cloudflare Bulk Redirect List and where I want
the dashboard hosted. Use the synthetic sample data until the private runtime is
ready.

Before calling the setup complete, run the tests and production build, verify that
an anonymous visitor cannot access the dashboard, verify one known redirect on
each domain, confirm the live inventory count, and give me a short rollback and
credential-rotation checklist.
```

Different assistants have different access to browsers, terminals and Cloudflare. If yours cannot perform a step directly, it should tell you exactly where to click and what result to look for rather than guessing that the step succeeded.

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

Created by the JJ AI Team, with some help from [Joakim Jardenberg](https://github.com/jardenberg), as a small gift to everyone who wants their links back under their own control.
