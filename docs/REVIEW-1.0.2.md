# 1.0.2 review and release evidence

Review date: 2026-10-22. Scope: the private reference deployment and this sanitized public edition. This was an implementation and protocol review, not an independent penetration test.

## Findings addressed

| Area | Finding | Repair |
|---|---|---|
| Authorization | The page checked sign-in but did not apply the APIs' owner restriction | Shared server-side owner enforcement before inventory is read |
| Concurrent writes | Completed-request lookup allowed requests to overlap while still running | Atomic D1 request claim, unique list lock, persisted replay response |
| Interrupted writes | Network uncertainty could invite a second submission | Readback-only reconciliation; retain the lock if the outcome is unknown |
| Updates | Existing status and matching options could reset | Preserve unchanged settings and compare the complete expected list |
| Audit trail | The snapshot reference was lost by the audit upsert | Preserve the saved before-state on subsequent audit updates |
| Analytics | All stored dates were labelled 30 days | Filter reads to 30 UTC dates, retain older rows |
| Ranking | Recent request rankings could include legacy totals | Use recent and historical sources separately |
| Public analytics | REST response parsing was used for GraphQL | Parse data/errors and include temporary redirects |
| Save feedback | Refresh could replace confirmation of a successful write | Keep save feedback visible independently of refresh |
| Setup guide | Ordinary Workers hosting was implied to include sign-in | State the Sites dependency and standalone authentication work explicitly |

## Verification

- Automated tests use an actual in-memory SQLite database with both migrations.
- API tests simulate Cloudflare's request, asynchronous-operation and readback responses, exercising authentication, wrong-origin rejection, create, update, replay, snapshot and option preservation.
- Separate cases cover owner mismatch, missing owner configuration, simultaneous requests, uncertain submission, complete-list drift, 30-day boundaries and GraphQL errors.
- TypeScript checking, lint and the production build are release checks.
- Public source and reachable repository history were checked for operational domains, deployment IDs and common credential formats.
- Local sample sign-in and server rendering returned 200 with synthetic data and version 1.0.2. Browser preview returned a local 403 in the review environment; the protocol result does not prove browser setup on every machine.

## Limits retained

- Authentication still depends on the Sites host. A standalone Cloudflare deployment requires a verified identity adapter.
- The list lock coordinates JJ Links writers. Outside console/API writers can still race Cloudflare's final replacement; use one administrative writer at a time.
- An interrupted request that cannot be reconciled needs operator review before releasing its lock.
- The public edition collects analytics on Refresh. It does not provision a background schedule.
- The production-dependency npm audit is clean at review time. The full toolchain audit still reports upstream development-tool advisories in braces, legacy esbuild through Drizzle, and fflate through Vinext. Do not expose development servers publicly or feed them untrusted build input. No breaking downgrade was applied merely to silence the report.
- Automated testing cannot establish universal reliability or rule out every security defect.

## Rollback

Redeploy the prior application release, 1.0.1, if needed. The new write_requests table is additive and can remain in place. Application rollback does not roll back Cloudflare mappings. Restore mappings only from a reviewed snapshot after checking the current full list.
