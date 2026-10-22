# Architecture

```text
owner browser → Cloudflare Access email login
                        ↓ signed JWT
                 Worker verifies owner
                    /           \
             React assets     private APIs
                                  |
                     Cloudflare Bulk Redirect API
                                  |
                           D1 state and backups

visitor → Cloudflare Bulk Redirects → destination
```

Workers hosts the API and static React application. Every request, including an asset request, reaches the Worker before assets are served. Access signs in the visitor; the Worker independently verifies the JWT and configured owner.

There is no Sites adapter, OpenAI session, external app consent flow or AI model call. The only local sample identity exists in a loopback development build without a Cloudflare API token.

## Identity boundary

Only a verified Access token supplies the user identity. Browser-provided internal or old Sites identity headers are discarded and replaced before an API handler is called. Issuer, application audience, signature algorithm, expiry and owner email are checked. API writes also require an exact same-origin Origin header.

## Read and write paths

Inventory reads paginate the complete list and validate count and unique sources. Refresh explicitly collects Cloudflare analytics; ordinary page reads use the stored 30 UTC dates.

D1 atomically claims request IDs and serializes list writes. Completed requests replay their stored response. Uncertain submissions retain the lock and are reconciled against the expected full list without another write.

Single-link updates preserve unrelated options, save an immutable full-list snapshot, check for outside edits, poll the Cloudflare operation and compare the complete readback. Cloudflare provides no atomic version precondition for this list workflow; avoid simultaneous writes through the console or other tools.

## CSV transaction

The server parses and validates the complete CSV, constructs a merge or restore result and stores a 15-minute preview tied to the actor and selected list. Applying it rechecks the list, creates a rollback snapshot and uses the same serialized write guard. A stale preview cannot overwrite newer work.

Public checks run in pages of ten to keep each request bounded. Verification status is separate from confirmed configuration. The import ID can be resumed in the same tab after refresh; CSV contents and rollback snapshots stay server-side.

## Storage and limits

- D1 stores configuration cache, analytics, audit events, snapshots, import previews and selected-list metadata.
- API tokens stay in Cloudflare runtime secrets.
- The first standalone edition supports one owner, one account/zone, two source hosts and CSV workflows of up to 1,000 live items / 1 MB per file.
- Existing private operational deployments are independent and can retain their established hosting.
