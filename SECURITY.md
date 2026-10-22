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
- set `JJ_LINKS_OWNER_EMAIL` as defense in depth;
- retain D1 before enabling update operations, because updates replace the complete list;
- review dependency and platform updates before deploying them.

The public repository contains synthetic data only. If you accidentally commit operational data or a credential, rotate the credential first and then remove the data from the complete Git history.
