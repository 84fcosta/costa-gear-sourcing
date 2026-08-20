# Costa Gear MVP Operational Readiness

The application is considered **MVP operational / ready for live use** when all criteria below are met.

## Go-live criteria

- Production build compiles successfully and the production URL responds normally.
- Authentication remains invite-only and business tables remain protected by RLS.
- Core workflow is available end-to-end: Supplier Quotation -> Sourcing -> Buying -> Logistics -> Receiving/Inventory -> Sales.
- Supplier quotations are standardized outside the app using the Costa Gear Supplier Quote Formatter and imported through the official XLSX template.
- One supplier quotation is preserved as one quotation header with multiple lines; users are not required to re-enter each supplier item manually.
- Standardized quotation import validates required workbook sheets/columns, line quantities/prices, line totals, product subtotal and grand total before quotation finalization.
- Supplier SKU -> Costa Gear Product mappings are remembered and reused in future quotations from the same supplier.
- Quotation-level shipping remains at quotation level in the standardized workbook and is allocated in the app only for sourcing/landed-cost comparison. Actual logistics costs later replace the sourcing estimate.
- Finalizing a supplier quotation creates one comparable quote per matched line without duplicating an already-finalized quotation line.
- A finalized quotation can create one Buying Draft containing multiple selected quotation lines. Duplicate PO creation from the same quotation is blocked.
- Sourcing -> Buying creates PO headers and PO lines transactionally, so partial drafts are not left behind on failure.
- A Buying Draft cannot be created from a quote/quotation line without a complete landed-cost basis.
- The legacy USD/CAD 1.38 rate is never silently accepted by the automated single-quote Sourcing -> Buying handoff; the user must explicitly confirm it before proceeding.
- Purchase-order service rejects a missing/invalid FX rate instead of silently inserting a fallback.
- Legacy Export/RFQ is hidden from the MVP navigation. Decision Lab and standardized Supplier Quotations are the canonical supplier/pricing workflow.
- Database integrity checks show no orphan operational records or invalid posted/ordered states.
- No artificial purchase orders, shipments, receipts or sales are left in production after testing.
- Supabase Security Advisor has no new critical findings. The known Free-plan leaked-password-protection warning is documented separately.

## Standard supplier quotation workflow

1. Receive supplier quotation as Excel, PDF or image.
2. Use the separate Costa Gear Supplier Quote Formatter project in ChatGPT to generate `Costa_Gear_Supplier_Quote_Import_Template.xlsx`.
3. In the app, ensure the supplier exists in Sourcing -> Products & Quotes -> Suppliers.
4. Open Sourcing -> Supplier Quotations and upload the standardized XLSX.
5. Select the existing Costa Gear supplier and review the quotation preview before importing.
6. Resolve only unmatched Supplier SKU lines by selecting the Costa Gear product. The mapping is saved for future imports.
7. Confirm quotation validation, actual USD/CAD rate, shipping allocation basis and duty assumption, then Finalize Quotes.
8. Use Decision Lab when supplier comparison is required, or select the items being purchased directly from the finalized Supplier Quotation.
9. Create one Buying Draft containing all selected lines from that supplier quotation.
10. Continue the normal PO -> Shipment -> Import Costs -> Receiving -> Inventory -> Sales workflow without re-entering product lines.

## What is intentionally not required for MVP go-live

- AI/OCR/PDF interpretation inside the Costa Gear application. Document interpretation stays in the Supplier Quote Formatter workflow.
- Automated competitor-price monitoring.
- Marketplace/e-commerce integrations.
- Accounting integration.
- Advanced role-specific permissions beyond the current invite-only member model.
- Automated FX feeds.
- Legacy Export/RFQ modernization.

These are future enhancements only if actual operation demonstrates a need.

## First-live-transaction acceptance

The first real supplier purchase should be used as the final business acceptance test:

1. Format a real supplier quotation with Supplier Quote Formatter.
2. Import the standardized XLSX into Supplier Quotations.
3. Confirm quotation totals, product matching, FX and landed-cost assumptions, then finalize it.
4. Compare alternatives in Decision Lab when relevant and select the actual items to buy.
5. Create one multi-line Buying Draft and approve/order the PO when commercially confirmed.
6. Create the shipment from the PO and allocate actual freight/import costs.
7. Create receiving from the shipment and Post the receipt when goods arrive.
8. Confirm inventory quantity and actual landed cost.
9. Record the first real sale.
10. Confirm that available inventory and realized margin update as expected.

If these ten steps complete without a workflow/data correction, the MVP is considered **business-accepted** and feature development should stop. Subsequent work should be bug fixes or changes driven by real operating pain.
