# Deployment

JJ Links was designed for an owner-private deployment on Cloudflare Workers with D1 and Sign in with ChatGPT. Other deployment targets are possible, but must provide equivalent server-side secrets, identity headers and a D1 binding.

## 1. Prepare Cloudflare

1. Put both source hostnames behind proxied Cloudflare DNS records.
2. Create a Bulk Redirect List and populate at least one known-good redirect for each hostname.
3. Create and enable an account Bulk Redirect Rule for that list.
4. Create a D1 database and apply `drizzle/0000_fair_christian_walker.sql`.
5. Create a narrowly scoped API token for the selected account and zone.

Cloudflare documents the list and rule setup in [Create Bulk Redirects](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/create-dashboard/).

## 2. Configure runtime values

Set the values shown in `.env.example`. Treat `CLOUDFLARE_API_TOKEN` as a secret. `JJ_LINKS_OWNER_EMAIL` should match the authenticated email that the hosting layer provides in `oai-authenticated-user-email`.

Bind the D1 database as `DB`.

## 3. Build and deploy

```bash
npm ci
npm test
npm run build
```

Deploy the generated Worker using your Cloudflare Workers or compatible Sites workflow. Do not make the dashboard public merely because the repository is public. Restrict the application to the intended owner before adding credentials.

## 4. Verify before enabling writes

- Anonymous visits are rejected.
- A signed-in non-owner is rejected.
- The owner can see only the two configured hostnames.
- Inventory count matches the Cloudflare list.
- System health observes the enabled list rule.
- Known paths on both hosts return redirects.
- Analytics can be read and written to D1.
- Creating a disposable test redirect succeeds and is publicly verified.
- Updating that test redirect creates a D1 snapshot before the list replacement.

## Rollback

The dashboard is not in the redirect-serving path, so taking it offline does not stop redirects. To undo a configuration change, retrieve the latest appropriate payload from `config_snapshots`, validate its count and digest, then replace the Cloudflare list through a separately authenticated administrative process.

Never automate rollback from an unreviewed snapshot.
