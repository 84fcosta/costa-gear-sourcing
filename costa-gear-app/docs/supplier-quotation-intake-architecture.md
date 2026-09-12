# Supplier Quotation Intake Architecture

## Objective

Keep one streamlined supplier quotation workflow across Costa Gear Operations and future ChatGPT-assisted intake.

## Canonical responsibilities

### Suppliers

Purpose: supplier master data and general sourcing documents only.

Allowed document examples:
- Catalog
- Price List
- Technical Document
- Other Sourcing Document

Formal quotation originals and standardized Costa Gear quotation workbooks do not enter through Supplier Documents.

### Supplier Quotations

This is the single formal quotation intake and lifecycle workspace.

Responsibilities:
1. Validate an existing Costa Gear supplier.
2. Import the standardized Costa Gear quotation structure.
3. Preserve every supplier quotation line.
4. Archive the Costa Gear import workbook.
5. Archive the supplier original quotation.
6. Match or create Product Master records.
7. Finalize matched lines into comparable quote records.
8. Create one Buying Draft from selected finalized lines.

### Quote Register

Purpose: downstream comparison/history register backed by the public.quotes table.

Rules:
- Formal quotation lines are created by Supplier Quotations.
- Formal quotation-derived quote rows are not edited or deleted from Quote Register.
- Historical standalone quote rows are retained and may remain editable until migrated.
- Quote Register is not a formal quotation intake path.

### Decision Lab / Product Cost Snapshot / Exports

These are downstream consumers of comparable quote records.
They do not create formal supplier quotations.

## Canonical application services

- supplierQuotationIntakeService.js
  - orchestrates standardized formal quotation creation and workbook archiving.

- supplierQuotationRepository.js
  - owns formal quotation database operations through Supabase RPCs.

- supplierDocumentService.js
  - owns supplier folder resolution, governed naming, duplicate protection, OneDrive upload, document metadata and indexing.

## Future ChatGPT integration

Do not create a separate ChatGPT-specific OneDrive implementation.

Before enabling direct ChatGPT archival, move the document upload primitives behind one authenticated backend intake service. Then:

Costa Gear Operations -> canonical backend intake
ChatGPT secure action -> canonical backend intake

The backend must reuse the same rules for:
- Supplier validation
- SUP-ID folder resolution
- Folder creation
- Governed document naming
- Duplicate detection
- OneDrive upload
- supplier_documents metadata
- onedrive_items indexing
- Quotation/source document role uniqueness

The ChatGPT integration must never:
- create a second supplier when a match is uncertain
- create an alternate supplier folder hierarchy
- write quotation files into Supplier Documents general upload
- bypass supplier_quotations / supplier_quotation_lines
- create comparable quotes directly before formal quotation finalization
