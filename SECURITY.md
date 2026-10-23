# Security policy

## Supported version

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository instead.

Include the affected route or component, reproduction steps, impact and any suggested mitigation. Please do not access data that is not yours or test against someone else's deployment.

## Deployment responsibilities

JJ Links is an administrative interface with permission to modify an entire Cloudflare Bulk Redirect List. Operators must:

- keep the repository and all example files free of real credentials and private redirect data;
- store the Cloudflare token only as a server-side secret;
- scope the token to the minimum account and zone required;
- restrict the deployed application to its intended owner or operators;
- protect every deployed hostname with a Cloudflare Access application and an allow policy for the exact owner's email;
- set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `JJ_LINKS_OWNER_EMAIL`. The Worker independently verifies the Access JWT signature, issuer, audience, required timestamps and owner email before serving assets or API data;
- never add an Access Bypass/Everyone policy or a production sample-authentication bypass. Incoming email/identity headers are not proof of authentication;
- migrate D1 before enabling writes; the write guard and snapshots depend on it;
- avoid editing the list through other tools while JJ Links is writing it;
- review dependency and platform updates before deploying them.

Bundled redirect and analytics fixtures are synthetic. Attributed community examples link to their creators' public material; they do not include private redirect inventories or deployment credentials. Read-only sample mode is restricted to a loopback development server without a Cloudflare API token. It is compiled out of production builds. A production installation with incomplete Access settings shows a locked setup page and refuses API access.

CSV exports, pre-import snapshots and import previews contain full destinations and notes. Treat them as private data. The application keeps them in your D1 database; it does not upload them to this repository or an AI service. Opening a CSV in spreadsheet software can interpret formula-like notes: import columns as text. Import previews expire after 15 minutes, but this version does not automatically delete stored previews, audit events or snapshots. Include those records in your retention and backup policy.

The app serializes its own writes and refuses stale CSV previews. It cannot lock out external Cloudflare console/API writers. Avoid concurrent administration. A restore replaces the complete selected list and can remove links, so review its deletion preview and keep an independent export first.

If you accidentally commit a credential, rotate it first and then remove it from the complete Git history. Private redirect targets, notes and analytics are also sensitive even when no API token is present.

CI checks application and build dependencies using `npm audit --audit-level=high`, alongside authorization, write-recovery and CSV tests. A passing dependency check is not a complete security audit or proof that an installation is correctly configured.
