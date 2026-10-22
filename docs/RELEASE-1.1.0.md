# 1.1.0 release and verification

This record covers [v1.1.0](https://github.com/jardenberg/jj-links-open/releases/tag/v1.1.0). Implementation and verification are tracked in [release PR #9](https://github.com/jardenberg/jj-links-open/pull/9).

## Scope

The public edition runs on Cloudflare Workers, D1 and Access without OpenAI Sites. It adds CSV configuration export, reviewed merge and complete-backup restore. The separate private operational repository and deployment are not migrated by this release.

Deliberate first-version limits: one owner, one account/zone, exactly two short hosts, one selected Bulk Redirect List, 1 MB files and at most 1,000 resulting links. The complete stored preview is also bounded below D1's row-size limit. Analytics and backups are not automatically pruned. External Cloudflare writers remain outside the application's write lock.

## Executed checks

| Task | Surface | Observed result |
| --- | --- | --- |
| Reject forged identity and invalid tokens | Production Worker tests with real RSA-signed JWTs | APIs and assets require the correct issuer, audience, signature, expiry and owner |
| Pick the intended list | Connection API with synthetic Cloudflare responses | Validates enabled rule and hosts; reads only; cannot switch while a write is pending |
| Preview a merge | Browser, local sample | One added, one changed, three retained, no removals; sample cannot apply |
| Preview a restore | Browser, local sample | One added, one changed, three removals; explicit `RESTORE 4` confirmation shown |
| Download a backup | Browser, local sample | CSV downloaded and all four complete configurations inspected |
| Apply and replay a batch | Real SQLite with mocked Cloudflare protocol | One full-list write, complete before-state backup, same-ID replay without another write |
| Recover an interrupted request | Real SQLite with mocked Cloudflare protocol | Resumes saved responses and pending claims without duplicating the write |
| Reject stale, wrong-list or oversized imports | Automated regression tests | Refused before Cloudflare mutation, including a list-selection race and complete-row size limit |
| Use a narrow screen | Browser, 320px and 390px | No page-width overflow; connection, CSV and creation controls remain available |
| Keyboard modal recovery | Browser, 320px | Escape closes the connection panel and restores trigger focus |
| Deploy a separate Worker and D1 | Cloudflare test resources | All four migrations applied; Worker published; locked setup visible before Access configuration |
| Reject anonymous inventory access before setup | Direct deployed HTTP requests | API returns 503; forged email headers disclose no inventory or app assets |
| Protect the complete deployed Worker | Cloudflare Access configuration and direct HTTP | Owner-only email policy covers all traffic; anonymous page, dashboard API, export and asset requests return 302 to Access, even with forged email headers |
| Sign in as the owner | Deployed Worker in Chrome | Existing Cloudflare sign-in succeeds; protected dashboard displays version 1.1.0 |
| Use authenticated CSV tools | Deployed Worker in Chrome | Export downloads; synthetic merge preview proposes one addition, one change and three retained links, with no removals or live writes |

The local suite includes 25 regression tests. Type checking, lint, production build and dependency audit passed. Full dependency audit reported zero vulnerabilities at the time of verification. These results do not establish universal reliability or human ease of setup.

## Evidence boundaries

The owner approved activation of Zero Trust Free, including Cloudflare's required overage-billing authorization. The default Cloudflare identity provider was retained rather than adding an email-code provider. The application independently verifies the resulting signed token and owner email.

Live browser checks use synthetic sample links behind real Access authentication. No real redirect token or operational list was installed in the test deployment. Bulk configuration writes, replay, snapshots and rollback were exercised with real SQLite and mocked Cloudflare protocol responses, not by mutating production redirects. Repeat the installation checklist for your own account before relying on it.

GitHub's required `verify` check passed on the release branch. It includes tests, type checking, privacy check, lint, production build, Wrangler dry run and full dependency audit.

The Cloudflare deployment button and migration script follow [Cloudflare's supported template flow](https://developers.cloudflare.com/workers/platform/deploy-buttons/). The isolated live deployment used Wrangler; it does not establish that every account's first-run button or billing screens behave identically.

## Rollback and handover

The previous public source release is `v1.0.2`. This edition is a deliberate hosting/authentication migration, not an in-place upgrade of a Sites deployment. Keep an established private installation on its current code unless separately migrating it.

Application rollback restores the prior Worker deployment. Redirect rollback uses the downloaded configuration CSV, a fresh restore preview and explicit confirmation. Neither action substitutes for the other.

See [setup](DEPLOYMENT.md), [CSV recovery](CSV.md), [architecture](ARCHITECTURE.md) and [security](../SECURITY.md).
