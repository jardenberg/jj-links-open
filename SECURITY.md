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
- set `JJ_LINKS_OWNER_EMAIL`; live access fails closed without it;
- use Sites as the trusted authentication boundary. The application must never accept identity headers directly from arbitrary callers. A raw Workers deployment is unsupported until that boundary is replaced with verified authentication;
- migrate D1 before enabling writes; the write guard and snapshots depend on it;
- avoid editing the list through other tools while JJ Links is writing it;
- review dependency and platform updates before deploying them.

The public repository contains synthetic data only. Local sample sign-in is a development simulation, not production authentication. Private service credentials grant access through the hosting boundary and must be treated as secrets.

If you accidentally commit a credential, rotate it first and then remove it from the complete Git history. Private redirect targets, notes and analytics are also sensitive even when no API token is present.

The automated dependency check in CI is `npm audit --omit=dev --audit-level=high`. That check does not assess every build-tool advisory or prove that the finished application is vulnerability-free.
