# Supplier Intake Architecture

## Objective

Costa Gear Operations has one operational entry point for every new supplier document:

**Supplier Intake**

The user selects a supplier file once. Costa Gear reviews it locally using deterministic rules, suggests the supplier/document type where evidence is available, and waits for explicit user confirmation before storing anything in OneDrive.

AI is suspended from the operational Supplier Intake workflow. Supplier quotation data comes from the standardized Costa Gear XLSX, which is parsed locally in the browser.

## Canonical workflow

Supplier file
-> Supplier Intake
-> classify document
-> identify existing supplier or review/create a supplier
-> governed OneDrive storage

If the file is a catalog, price list, technical document or other sourcing document:
-> register supplier document metadata
-> complete

If the file is a quotation:
-> keep the supplier original local until confirmation
-> require/load the converted Costa Gear quotation XLSX
-> parse quotation header and every line locally from that workbook
-> user reviews supplier and financial data
-> create supplier_quotations + supplier_quotation_lines
-> archive the confirmed Costa Gear XLSX
-> archive the supplier original when provided
-> Product Matching
-> Finalize
-> Buying Draft

## Canonical UI responsibilities

### Supplier Intake

The only primary upload channel for new supplier files.

Accepted intake formats include:
- PDF
- Excel
- CSV/text
- common images

Responsibilities:
1. Keep the selected file local until explicit user confirmation.
2. Suggest document type from deterministic filename/local metadata rules.
3. Suggest an existing supplier from Supplier ID/name/alias evidence when available.
4. Require user confirmation of supplier, document type, document label and document date before storage.
5. Create the next SUP-ID only after user confirmation when a supplier is genuinely new.
6. Store the confirmed file directly in the governed supplier folder using the naming convention.
7. For quotations, require the converted Costa Gear quotation XLSX as the structured source.
8. Parse the Costa Gear XLSX locally and present quotation header/lines for review.
9. Create the formal quotation and archive the confirmed XLSX plus supplier original when provided.
10. Route the user directly to Product Matching.

### Suppliers

Supplier master data and supplier document register.

The Docs action is a register/history view, not a second upload channel.

### Supplier Quotations

Downstream quotation lifecycle workspace.

Responsibilities:
- quotation history
- Supplier Original / Costa Gear Import File visibility and controlled replacement
- Product Matching
- create Product Master records when required
- Finalize
- Buying Draft

It does not provide a separate new quotation upload form.

### Quote Register

Downstream comparison/history register backed by public.quotes.

Rules:
- formal quotation-derived quote rows are read-only here
- historical standalone quotes are preserved until explicitly migrated
- no new formal quotation intake occurs here

### Decision Lab / Product Cost Snapshot / Exports

Downstream consumers of comparable quote records only.

## Canonical services

### supplierIntakeService.js

Orchestrates the single intake workflow:
- deterministic local document review
- deterministic supplier suggestion
- reviewed supplier creation
- general document save after confirmation
- local Costa Gear XLSX parsing/import
- supplier original archive after confirmation

### supplierDocumentService.js

The only governed supplier document persistence logic:
- supplier validation
- supplier folder resolution
- folder creation
- governed filename
- duplicate detection
- OneDrive move/upload
- supplier_documents metadata
- onedrive_items indexing
- quotation document role uniqueness

### supplierQuotationIntakeService.js

Owns formal quotation creation plus Costa Gear workbook archive.

### supplierQuotationRepository.js

Owns supplier quotation database operations and lifecycle RPCs.

### supplier-intake-analyze Vercel API

AI processing is suspended.

GET returns the current deterministic-mode status. POST returns `SUPPLIER_INTAKE_AI_SUSPENDED` and never calls AI Gateway. This guard prevents stale clients from creating AI spend.

## OneDrive structure

No document-type subfolders are introduced.

```
02_PRODUCTS/
├── Product_Files/
└── Suppliers_Sourcing/
    ├── SUP-001_<ShortName>/
    ├── SUP-002_<ShortName>/
    └── ...
```

The current intake flow does not use OneDrive staging. A file is stored only after confirmation. The historical `_INTAKE` folder may remain temporarily for cleanup/backward compatibility but is not part of the active workflow.

## AI dependency

Supplier Intake has no active AI dependency.

For catalogs and other supplier documents, supplier/document suggestions are deterministic and must be confirmed by the user.

For quotations, supplier-native PDF/Excel/image files are preserved as originals. The converted Costa Gear XLSX is the structured source for quotation fields and lines. If the supplier original is selected first, the app asks for the converted XLSX before import. If the converted XLSX is selected first, the supplier original can be attached before confirmation.

The previous Vercel AI Gateway endpoint is intentionally suspended so accidental requests cannot incur AI usage.

## Non-negotiable rules

- Never create a second supplier automatically when the match is uncertain.
- Never create alternate supplier folder hierarchies.
- Never bypass supplier_quotations / supplier_quotation_lines for formal quotations.
- Never create comparable quotes directly before formal quotation finalization.
- Never invent supplier quote references, SKUs, quantities, prices or fitment data.
- Preserve the original supplier document.
- Preserve every quotation line.
