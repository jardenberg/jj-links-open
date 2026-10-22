# Set up your own JJ Links

The runtime is Cloudflare Workers + D1 + Access. There is no OpenAI account or Sites requirement.

## 1. Deploy the application and database

Use the **Deploy to Cloudflare** button in the README. Sign in to Cloudflare and GitHub when prompted, choose a name for your own Worker/source copy and create the D1 resource.

The template includes a placeholder D1 ID. Cloudflare's deployment flow replaces it with the newly provisioned database ID. Do not paste someone else's database ID.

Cloudflare Builds should use `npm run build` as the build command and `npm run deploy` as the deploy command. The latter applies every committed SQL migration to the `DB` binding before publishing the Worker. It uses `--keep-vars` so future deployments preserve settings entered in Cloudflare.

Your first visit shows a setup page until Access is configured. No redirect inventory is available anonymously.

## 2. Turn on email sign-in

For the default `workers.dev` hostname, open:

**Cloudflare → Workers & Pages → your Worker → Access.**

The current dashboard has a dedicated Access tab. Older layouts place this under **Settings → Domains & Routes → workers.dev → Enable Cloudflare Access**.

For a custom hostname, create a self-hosted Access application for that exact hostname in Cloudflare Zero Trust.

Configure the application:

- Login method: **One-time PIN**.
- Allow policy: **Emails → your exact email address**.
- Do not use an Everyone or Bypass policy.
- A one-day session duration is a reasonable starting point.

Copy the application's **AUD** value and the team's `your-team.cloudflareaccess.com` hostname. In the Worker's **Settings → Variables and Secrets**, add these non-secret runtime values:

| Setting | What to enter |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Your team hostname, such as `your-team.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | The application audience (AUD) value shown in Access |
| `JJ_LINKS_OWNER_EMAIL` | The same exact email allowed by the Access policy |

Save/deploy those settings. The application checks the token signature, issuer, audience, expiry and email itself. A direct Worker URL cannot bypass it merely by supplying an email header.

Cloudflare may require initial Zero Trust account setup before offering Access. The current setup screen offers a Free plan suitable for this single-owner use. Confirm the plan and team name with the account owner; never silently create an organization or accept a paid plan.

The Free activation flow can still require a stored payment method and explicit authorization for charges above included limits. A $0 checkout is not a promise of unconditional zero cost. Stop and ask the account owner before accepting that authorization. No additional Zero Trust features are needed for this dashboard.

Official instructions: [Access on workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 3. Connect your short-link account

Your two short hostnames must be in the configured Cloudflare zone.

Create a narrowly scoped API token for your selected account/zone with:

- **Account Filter Lists: Edit** for redirect configuration.
- **Account Rulesets: Read** for the enabling rule.
- **Zone Analytics: Read** for request metrics.

Enter the token directly as the Worker's encrypted `CLOUDFLARE_API_TOKEN` secret. Never paste it into an AI conversation or commit it.

Add three ordinary runtime values on the same settings page:

| Setting | What to enter |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from your domain's Cloudflare overview/API section |
| `CLOUDFLARE_ZONE_ID` | Zone ID from that same overview |
| `JJ_LINKS_SOURCE_HOSTS` | Exactly two hostnames, separated by a comma, for example `go.example.com,ai.example.com` |

Open the dashboard, choose **Connect Cloudflare**, and select the existing list by name. JJ Links finds and checks its enabling ruleset for you. Selecting it does not change DNS or list contents.

Advanced installations may instead pin both `CLOUDFLARE_LIST_ID` and `CLOUDFLARE_RULESET_ID` in Worker settings. If either is pinned, use settings rather than the list chooser to change it.

## If you have no redirect list yet

In Cloudflare, create a **Bulk Redirect List** and a **Bulk Redirect Rule** referencing it. Enable the rule. Use a dedicated list for the two short hosts.

Both hostnames need proxied DNS records. Cloudflare documents `192.0.2.0` as an originless placeholder for redirects. Treat a DNS change as an explicit migration decision; verify your old service and retain a rollback plan first.

Then select the new list in JJ Links and preview a configuration CSV. Do not import an analytics report as if it were a link manifest.

Official guidance: [Bulk Redirect setup](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/create-dashboard/) · [originless DNS](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/#originless-setups).

## Verify before relying on the installation

1. In a signed-out/private browser, the dashboard and API do not disclose inventory.
2. The allowed owner signs in with the Cloudflare email code.
3. A different email cannot read the dashboard.
4. The selected list and full count match Cloudflare.
5. Known paths on both short hosts return their saved destinations.
6. CSV export downloads the full configuration.
7. A sample CSV preview shows the expected changes without applying them.

A passing build is not proof that account permissions or sign-in work on the deployed hostname.

## Developer path

```bash
npm ci
npm run dev
npm run db:migrate:local
npm test
npm run typecheck
npm run build
```

Local sample mode is restricted to a loopback development server with no Cloudflare API token. Live administration always uses Access. To deploy manually, authenticate Wrangler, create/bind a D1 database in `wrangler.jsonc`, build, then run `npm run deploy`.

Do not run deployment commands from the private operational repository when installing this public edition.

## Recovery

A confirmed redirect write with delayed edge propagation is reported as saved with public verification pending. An uncertain submission keeps its write lock and uses readback-only reconciliation.

For CSV imports, reopen **Import / export** in the same browser tab to resume a saved/pending import. The browser stores only its opaque import ID; the plan and before-state remain in your D1 database.

If an operation cannot be reconciled, stop other writes and inspect its `write_requests` record, the saved snapshot and the Cloudflare operation. Release an unresolved lock only after establishing the exact outcome. Never clear locks as an automatic retry strategy.

Application rollback uses the previous Worker version. Configuration rollback uses a reviewed CSV snapshot and the restore preview. They are separate operations.
