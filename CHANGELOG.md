# Changelog

All notable changes to JJ Links Open are recorded here. Newest releases come first.

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
