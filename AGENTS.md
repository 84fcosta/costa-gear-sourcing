# Costa Gear repository instructions

## Document naming is a governed application invariant

Before creating or changing any feature that uploads, renames, exports, migrates or indexes a business document, read:

- `costa-gear-app/docs/DOCUMENT_NAMING_CONVENTION.md`
- `costa-gear-app/docs/DOCUMENT_GOVERNANCE.md`
- `costa-gear-app/src/domain/documentNaming.js`

Do not create local/hard-coded filename conventions in components or services. Reuse the central naming helpers and update the policy, executable rules and regression tests together when a naming rule intentionally changes.

The build runs `scripts/check-document-naming-policy.js` and `scripts/test-document-governance.js`. A document-related change is incomplete if those guards do not pass.

Key current invariants:

- no generic `CG_` prefix for formal documents;
- numbered document record families use four digits: `SUP####`, `QUO####`, `PO####`, `EXP####`, `AST####`;
- quotation internal IDs are global `QUO####` values; supplier-provided references belong in `supplier_quote_ref`;
- formal document dates use `YYYY-MM-DD` at the end, except SOPs and templates, which end in `V##`;
- photos/images/marketing creatives are not subject to the formal document naming convention;
- active archive/staging content is excluded from current naming compliance until reactivated.

Do not rename historical OneDrive documents in bulk without a reviewed Current Name → Proposed Name migration preview.

## Legacy document migration is closed

The legacy repository migration was completed on 2026-10-02. Normal operations use **Document Governance** for active repository compliance; do not re-enable the old Legacy Migration workspace as part of routine document handling.

The historical `legacy_document_migration_queue` is retained as an audit trail. The one-time legacy catalog migration date decision (2026-06-15) remains documented in the naming policy for traceability, but it must not be used as a runtime default for future supplier documents.
