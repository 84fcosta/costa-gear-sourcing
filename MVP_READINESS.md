# Costa Gear MVP Operational Readiness

The application is considered **MVP operational / ready for live use** when all criteria below are met.

## Go-live criteria

- Production build compiles successfully and the production URL responds normally.
- Authentication remains invite-only and business tables remain protected by RLS.
- Core workflow is available end-to-end: Sourcing -> Buying -> Logistics -> Receiving/Inventory -> Sales.
- Sourcing -> Buying creates the PO header and first PO line transactionally, so partial drafts are not left behind on failure.
- A Buying Draft cannot be created from Decision Lab without a complete landed-cost basis.
- The legacy USD/CAD 1.38 rate is never silently accepted by the automated Sourcing -> Buying handoff; the user must explicitly confirm it before proceeding.
- Purchase-order service rejects a missing/invalid FX rate instead of silently inserting a fallback.
- Legacy Export/RFQ is hidden from the MVP navigation. Decision Lab is the canonical supplier/pricing decision source.
- Database integrity checks show no orphan operational records or invalid posted/ordered states.
- No artificial purchase orders, shipments, receipts or sales are created for testing production.
- Supabase Security Advisor has no new critical findings. The known Free-plan leaked-password-protection warning is documented separately.

## What is intentionally not required for MVP go-live

- Automated competitor-price monitoring.
- Marketplace/e-commerce integrations.
- Accounting integration.
- Advanced role-specific permissions beyond the current invite-only member model.
- Automated FX feeds.
- Legacy Export/RFQ modernization.

These are future enhancements only if actual operation demonstrates a need.

## First-live-transaction acceptance

The first real transaction should be used as the final business acceptance test:

1. Confirm/update a real supplier quote and its FX, shipping and duty basis.
2. Use Decision Lab to create the Buying Draft.
3. Approve/order the PO when commercially confirmed.
4. Create the shipment and allocate freight/import costs.
5. Post receiving when goods arrive.
6. Confirm the inventory quantity and landed cost.
7. Record the first real sale.
8. Confirm that inventory and realized margin update as expected.

If these eight steps complete without a workflow/data correction, the MVP is considered **business-accepted** and feature development should stop. Subsequent work should be bug fixes or changes driven by real operating pain.
