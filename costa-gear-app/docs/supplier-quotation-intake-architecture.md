# Supplier Intake Architecture

## Objective

Costa Gear Operations has one operational entry point for every new supplier document:

**Supplier Intake**

The user uploads a supplier file once. Costa Gear classifies it, identifies the supplier, stores the original in the governed OneDrive supplier folder, and, when the document is a quotation, prepares the structured quotation data for Product Matching.

ChatGPT is no longer an operational step in the day-to-day intake workflow.

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
-> extract quotation header and every line
-> user reviews financial data
-> generate the canonical Costa Gear XLSX internally
-> create supplier_quotations + supplier_quotation_lines
-> archive supplier original + Costa Gear XLSX
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
1. Stage the original file temporarily in the governed OneDrive repository.
2. Analyze document type and supplier identity.
3. Reuse an existing supplier when confidence is sufficient.
4. Present a pre-filled supplier review when no reliable match exists.
5. Create the next SUP-ID only after user confirmation.
6. Move the original from staging into the supplier folder using governed naming.
7. For quotations, present extracted commercial values and lines for review.
8. Generate the canonical Costa Gear quotation workbook internally.
9. Create the formal quotation and archive both document roles.
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
- staging
- AI analysis request
- reviewed supplier creation
- general document save
- quotation workbook generation/import
- original quotation archive

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

AI extraction only.

It:
- requires an authenticated Costa Gear app member for POST
- reads a temporary signed OneDrive source URL
- treats document content as untrusted
- classifies the document
- identifies the supplier from the supplied Supplier Master
- extracts quotation data when applicable
- returns structured data only

It does not write suppliers, documents or quotations directly.

## OneDrive structure

No document-type subfolders are introduced.

```
02_PRODUCTS/
├── Product_Files/
└── Suppliers_Sourcing/
    ├── _INTAKE/                 temporary staging only
    ├── SUP-001_<ShortName>/
    ├── SUP-002_<ShortName>/
    └── ...
```

_INTake staging files are moved to their final supplier folder during successful intake. Abandoned CG_INTAKE files older than 48 hours are cleaned opportunistically.

## AI dependency and fallback

AI is used for supplier-native PDF/Excel/image classification and extraction.

Official Costa Gear quotation XLSX files remain locally parseable without AI and use the same Supplier Intake channel.

The AI credential stays server-side in Vercel. It must never be exposed in the browser.

## Non-negotiable rules

- Never create a second supplier automatically when the match is uncertain.
- Never create alternate supplier folder hierarchies.
- Never bypass supplier_quotations / supplier_quotation_lines for formal quotations.
- Never create comparable quotes directly before formal quotation finalization.
- Never invent supplier quote references, SKUs, quantities, prices or fitment data.
- Preserve the original supplier document.
- Preserve every quotation line.
