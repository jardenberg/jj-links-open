# Contributing

Thoughtful fixes and small, inspectable improvements are welcome.

1. Fork the repository and create a focused branch.
2. Keep credentials, account IDs, real redirect exports and analytics out of commits and test fixtures.
3. Use Node.js 22.13 or later. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run privacy-check`, `npm run build` and `npm audit`. Stage new files before the privacy check so it includes them.
4. Explain the user-facing behavior, security implications and verification performed in the pull request.

Please open an issue before starting a large architectural change. Security reports belong in GitHub private vulnerability reporting, not public issues.

Keep tests synthetic. Never use a contributor's production redirect list for automated write tests. Authorization changes must retain negative tests for forged identity headers and invalid Access tokens. CSV changes must cover preview-only behavior, stale previews, saved-request replay and full before-state backups.

The public edition uses standard Cloudflare Workers, D1, Access and React/Vite. Do not reintroduce a proprietary hosting or authentication adapter. The release version lives in `lib/version.ts` and must agree with `package.json` and `CHANGELOG.md`.

By contributing, you agree that your contribution is licensed under the MIT License.
