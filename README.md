# JJ Links Open

**So many links, one single dashboard.**

JJ Links is a dashboard for branded short links served by [Cloudflare Bulk Redirects](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/). It gives one owner a searchable inventory, request analytics, guarded create and update workflows, system health, audit history and rollback snapshots without placing the dashboard in the redirect-serving path.

This repository is the clean public edition of a production tool. It contains synthetic examples only. No private redirects, analytics, account identifiers or deployment credentials are included.

**Hosting requirement:** the current implementation runs on OpenAI Sites with its private access policy, Sign in with ChatGPT and a D1 database. You can explore the sample locally. Deploying the Worker directly to an ordinary Cloudflare account requires an authentication adapter first; the sign-in service is supplied by Sites and is not included in this repository. [Deployment requirements](docs/DEPLOYMENT.md).

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

Local sign-in is a loopback-only development simulation using `seedy@sites.test`. It does not log in to a real ChatGPT account. Keep real production credentials out of sample mode.

Run the release checks with:

```bash
npm test
npm run typecheck
npm run build
```

## The easiest setup: ask an AI assistant

You do not need to operate GitHub or a terminal yourself. An AI coding assistant with repository, browser and terminal access can inspect this project and carry out the setup with you. An ordinary chat without those tools can explain the steps but cannot perform or verify the deployment.

You will still need to own or control the domains, sign in to Cloudflare, approve security-sensitive changes and decide where the private dashboard should live. The AI should never ask you to paste API tokens into chat or commit them to GitHub.

Copy this prompt into ChatGPT, Claude or another capable coding assistant:

```text
Help me set up my own private JJ Links dashboard from this repository:
https://github.com/jardenberg/jj-links-open

First read README.md, SECURITY.md and docs/DEPLOYMENT.md at the latest release.
This implementation currently depends on OpenAI Sites for trusted authentication.
Confirm that you have the necessary hosting tools before promising a deployment.
If I need ordinary Cloudflare hosting instead, explain the authentication work
required before doing it. Do not deploy a raw Worker that trusts browser-supplied
identity headers.

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

JJ Links currently supports exactly two short-link hostnames in one Cloudflare zone. Configure these values in the private Site's server-side runtime settings. Leave credentials empty when exploring the local sample:

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

Store the token as a server-side secret. Never put it in `.env.example`, a client-side variable, a screenshot, an issue or a commit. Owner identity is mandatory for live access, and D1 must be migrated before writes are enabled.

Use **Refresh** to collect Cloudflare analytics. Reading the page uses stored metrics; this public edition does not install a background schedule. Its 30-day figures cover the current UTC date and the previous 29 dates. Cloudflare analytics may be sampled and are request counts rather than unique people. Synthetic legacy history appears only in sample mode.

See [Deployment](docs/DEPLOYMENT.md) for D1 setup, authentication, first synchronization and production verification.

## Safety model

JJ Links can modify an entire Bulk Redirect List, so the safe path matters:

1. The page and data APIs require the configured owner; writes also require a same-origin request.
2. A D1 lock serializes changes and a saved request ID prevents a replay from executing again.
3. New links are rejected on case-insensitive collision.
4. Updates preserve existing options and save a full D1 snapshot before replacement.
5. JJ Links checks for outside edits and waits for Cloudflare's operation.
6. It compares every saved mapping, option and comment with the intended list.
7. It verifies the changed public URL with bounded retries.

If Cloudflare confirms the mapping before its edge has propagated, the UI reports that public verification is pending. If the submission itself has an uncertain outcome, use **Check status** in the same form. JJ Links retains the write lock until it can reconcile the saved list. It never automatically resubmits an uncertain change.

Use this app as the single writer while making changes. Cloudflare's full-list API has no atomic compare-and-swap operation; an outside writer can still race the final replacement. [Recovery and limitations](docs/DEPLOYMENT.md#recovery).

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

Current release: `1.0.2`. This is a small reference implementation backed by a working personal deployment: one owner, one Cloudflare account, one zone, one Bulk Redirect List and two source hostnames. It has automated regression coverage, but has not had an independent penetration test.

Issues and pull requests are welcome. Please read [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md) first.

## License

[MIT](LICENSE). Use it, change it, ship it and make it yours.

Created by the JJ AI Team, with some help from [Joakim Jardenberg](https://github.com/jardenberg), as a small gift to everyone who wants their links back under their own control.
