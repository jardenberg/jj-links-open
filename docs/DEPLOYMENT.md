# Deployment

The supported reference deployment uses OpenAI Sites: it supplies the private access gate, Sign in with ChatGPT, trusted identity headers, encrypted runtime secrets and a D1 binding. This repository supplies the application, not those hosted services.

Do not publish the generated Worker directly to a public `workers.dev` URL and assume sign-in is working. A standalone port needs an authentication adapter that verifies identities and prevents direct access around it. That is not implemented here.

## Explore the local sample

```bash
npm ci
npm run dev
```

Open the printed loopback URL. Follow the local sign-in link; it uses the synthetic identity `seedy@sites.test`. No real ChatGPT sign-in happens, and no production credentials are needed. Use sample mode for inspection; use the private hosted deployment for live administration.

## Prepare your Cloudflare redirect estate

Both source hostnames must be in the configured Cloudflare zone.

1. Create proxied DNS records for the short hosts. For originless redirects Cloudflare documents `192.0.2.0` as a placeholder.
2. Create a Bulk Redirect List and add one known-good redirect on each hostname.
3. Create and enable an account Bulk Redirect Rule referencing that list.
4. Record the account, zone, list and enabling ruleset IDs privately.
5. Create a token restricted to that account and zone with Account Filter Lists Edit, Account Rulesets Read and Zone Analytics Read.

Follow Cloudflare's [Bulk Redirect setup](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/create-dashboard/) and [originless DNS guidance](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/#originless-setups). DNS setup and account permissions require your authority; the repository's example values do not configure them.

## Configure a new private Site

Use the supported Sites deployment tooling available to your AI coding assistant:

1. Create a new Site with an owner-only audience. Do not reuse another operator's Site identity.
2. Save its returned project ID in `.openai/hosting.json`, preserving `"d1": "DB"`.
3. Set the names listed in `.env.example` as server-side runtime values. Treat `CLOUDFLARE_API_TOKEN` as a secret. Set `JJ_LINKS_OWNER_EMAIL` to the email supplied by your authenticated account.
4. Push the exact source to the Site's configured source repository, build it and publish through Sites.
5. Apply all committed migrations in `drizzle/` in order. The Sites publication workflow applies them before the Worker is activated; confirm that both the original tables and `write_requests` exist.

The application deliberately refuses live access without an owner email. Writes also require a migrated D1 database.

For an isolated local test database, the generated Wrangler configuration is `dist/server/wrangler.json`. Use the local D1 migration workflow for that configuration; local and hosted databases are separate. Do not seed the public repository with your own production mappings.

## Build checks

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Then deploy the resulting build through the private Sites publication flow. A passing build does not establish that authentication or Cloudflare permissions work in production.

## Verify the actual deployment

- An anonymous visitor cannot read the page or data APIs.
- A signed-in account other than the configured owner cannot read inventory.
- The owner sees the real Cloudflare list count and both configured hosts.
- Known paths on both hosts return the saved status and destination.
- Refresh collects request analytics and stores them in D1.
- A test create saves one mapping; repeating its request ID replays the result without a second write.
- A test update preserves status and matching options, stores a snapshot and reconciles the complete list.

Refresh collects 301, 302, 307 and 308 responses. It may report a dataset, permission or row-limit error without making the live inventory disappear. This public edition does not install an unattended collection schedule. Request analytics may be sampled and do not identify unique people.

## Recovery

If creation is confirmed but the edge is still updating, JJ Links reports public verification pending and closes the form. It does not say that creation failed.

If the submission outcome itself is uncertain, keep the form and use **Check status**. Its saved request ID performs readback reconciliation without resubmitting. An uncertain request retains the D1 write lock. If reconciliation cannot establish the intended full list, stop other writes and have an operator inspect `write_requests.expected_json`, Cloudflare's operation state and the current list. Release an unresolved lock only after that review. Never delete the lock as an automatic retry strategy.

Updates replace the whole list. The application serializes its own writers and checks for outside edits before submitting, but Cloudflare does not provide an atomic compare-and-swap for this API. Avoid simultaneous writes through the console or other tools.

To roll back an incorrect update, retrieve the appropriate `config_snapshots` payload, verify its count and digest, then restore it through a separately authenticated administrative process. Review the exact mapping first. Taking the dashboard offline does not stop Cloudflare's redirect service.
