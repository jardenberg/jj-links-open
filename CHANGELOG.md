# Changelog

All notable changes to JJ Links Open are recorded here. Newest releases come first.

## [1.1.1] - 2026-10-23

### Added

- An attributed "JJ Links in the wild" README section featuring Johannes Sundlo's public thank-you video, with a clickable thumbnail and a summary of his reported use.

### Changed

- Update release labels for this documentation-only patch. Redirect, authentication and data-handling behavior are unchanged.

## [1.1.0] - 2026-10-22

### Added

- Standard Cloudflare Workers, D1 and Access deployment, with owner-only Cloudflare sign-in and a Deploy to Cloudflare entry point.
- Application verification of Access signatures, issuer, audience, expiry and the configured owner on every request.
- CSV download, merge preview and complete-backup restore with explicit review, a typed restore confirmation and a pre-import snapshot.
- Stale-preview protection, idempotent bulk writes, downloadable pre-import backups and paged public verification.
- A read-only local sample that needs no credentials.
- A named-list connection chooser that checks the enabling rule and configured short domains without changing Cloudflare configuration.

### Changed

- Replace the Sites-specific runtime and authentication adapter with a standard Worker API and React/Vite client.
- Keep the private operational edition separate at 1.0.2.
- Use a patched esbuild throughout the build toolchain.

### Fixed

- Resume an interrupted CSV import using its original saved request, including a response lost after Cloudflare confirmed it.
- Keep list selection stable throughout an import and reject previews that exceed D1's complete-row size limit.
- Keep setup, CSV and creation controls usable on narrow phone screens.
- Preserve scheme-qualified and root source URLs through display, copying and editing, and allow an empty-list backup only through explicitly confirmed restore.

### Upgrade note

- This public edition now requires Cloudflare Access configuration. Existing Sites installations should stay on their established private code or the 1.0.2 tag until deliberately migrated.

## [1.0.2] - 2026-10-22

### Security

- Enforce the configured owner on the server-rendered dashboard as well as the APIs; live access fails closed without an owner.
- Serialize list writes in D1 and persist request fingerprints and responses, so concurrent or interrupted requests cannot silently repeat writes.
- Limit public probes to configured source hosts and bound their network wait.

### Fixed

- Restrict 30-day metrics to the current 30 UTC calendar dates while retaining older history.
- Parse Cloudflare GraphQL's data envelope and include 301, 302, 307 and 308 responses.
- Preserve existing status, matching and query options when editing a destination or note.
- Compare the complete saved list with the intended configuration and detect outside edits before replacement.
- Preserve successful save feedback through refresh failures and offer status checks for ambiguous writes.
- Preserve the pre-update audit snapshot reference.

### Changed

- Add regression tests using real SQLite constraints and mocked Cloudflare protocol responses, plus TypeScript checking in CI.
- Document the required Sites authentication boundary, local-only sample sign-in, database migrations, manual analytics refresh and safe recovery limits.

## [1.0.1] - 2026-10-22

### Fixed

- Retry public redirect verification with bounded exponential backoff after a confirmed Cloudflare write.
- Treat successful Cloudflare list readback as creation or update success even while edge propagation is pending.
- Show a truthful “verification is still propagating” confirmation instead of a false failure.
- Close the create/edit flow after confirmed readback, preventing accidental duplicate retries; server-side idempotency and collision checks remain in force.

## [1.0.0] - 2026-10-22

### Added

- Public, clean-room release of the JJ Links dashboard under the MIT License.
- Searchable Cloudflare Bulk Redirect inventory for two configurable short domains.
- Rolling Cloudflare request analytics stored in D1.
- Safe create workflow with collision checks and public-response verification.
- Guarded updates with immutable D1 snapshots, full-list reconciliation and cross-host regression checks.
- Owner authentication, same-origin write protection, audit events and system health checks.
- Synthetic example redirects and legacy analytics for local preview.

### Security

- No production redirect mappings, analytics, account identifiers, deployment identifiers or credentials are included.
- Runtime credentials remain server-side and are excluded by `.gitignore`.
