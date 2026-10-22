# Architecture

## Goals

JJ Links provides a private management and analytics layer around Cloudflare Bulk Redirects while keeping Cloudflare's native redirect engine as the serving source of truth.

The design favors a small operational surface, explicit write safeguards and recoverability over multi-tenant abstraction.

## Components

| Component | Responsibility |
|---|---|
| Next.js/Vinext application | Owner interface and API routes |
| Cloudflare Bulk Redirect List | Live redirect configuration and serving lookup |
| Cloudflare account ruleset | Enables the selected list in the redirect phase |
| Cloudflare GraphQL Analytics API | Request counts by host, path and day |
| Cloudflare D1 | Analytics, audit events, inventory cache and configuration snapshots |
| Sign in with ChatGPT / Sites access | Primary owner authentication in the reference deployment |

## Read path

The dashboard reads the complete list and verifies that its count is unique and consistent with Cloudflare metadata. Refresh explicitly collects analytics into D1; page reads use the stored 30 UTC calendar dates. Older rows remain available in the database. A failed live inventory read uses the last D1 cache, or an empty inventory if none exists. Synthetic fixtures are only used when live access is unconfigured.

## Write path

Create operations append one item after collision validation. Update operations are deliberately more conservative because the Cloudflare list API replaces the complete list:

1. Atomically claim the request ID and the single list-write lock in D1.
2. Read and validate the current inventory.
2. Save the full pre-change list and SHA-256 digest to D1.
3. Submit the full replacement list.
4. Poll the Cloudflare bulk operation.
5. Reread and reconcile count, source and target.
6. Verify the public redirect response.
7. Probe a known item on the second hostname.
8. Store an audit event.

Writes are replayed from their persisted result. An uncertain submission retains its lock and is reconciled against the intended complete list; it is never automatically resubmitted. A process interrupted before submitting needs operator review if its state cannot be established. A second read catches outside changes before a full replacement, but Cloudflare supplies no atomic version precondition, so exclusive write ownership remains an operating requirement.

## Trust boundaries

- Browser input is untrusted and validated with Zod.
- Cloudflare credentials never enter browser code.
- Sites supplies the trusted visitor identity; the application applies the configured owner check on both the page and APIs. The code does not cryptographically authenticate headers from an arbitrary public HTTP client.
- Write routes require an exact same-origin `Origin` header.
- D1 is required for updates so that rollback evidence exists before a list replacement.
- The public short URLs are intentionally public; the dashboard inventory, analytics and administration interface are not.

## Deliberate constraints

- exactly two source hostnames;
- one owner and one Cloudflare account;
- one redirect list and one enabling ruleset;
- no redirect deletion workflow;
- Cloudflare request counts are not treated as proprietary human or unique-click metrics.

These constraints keep the safety model inspectable. Generalizing them is welcome when it does not weaken the write and rollback guarantees.
