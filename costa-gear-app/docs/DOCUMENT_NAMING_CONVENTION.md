# Costa Gear Document Naming Convention

## Purpose

This standard applies to **documents** managed by Costa Gear Operations or stored in the active Costa Gear OneDrive repository.

Photos, product images, marketing creatives, logos and other visual assets are **not** governed by this formal document naming standard. They only need a clear human-readable name for now.

## Core rule

Official documents use:

`<RecordKeyOrFamily>_<Context>_<DocumentType>[_<Description>][_<Version>]_<Date>.<ext>`

General principles:

1. Do **not** prefix filenames with `CG`. Every file in this repository already belongs to Costa Gear, so the prefix does not add classification value.
2. When a document is tied to a structured business record, use that record key first.
3. Record family and sequential ID stay together: `PO001`, `SUP003`, `QUO001`, `EXP0025`, `AST001`.
4. Do not encode the same information twice. A record number must not also contain the document date or supplier number when those fields already appear elsewhere.
5. Use one document date, at the end, in ISO format `YYYY-MM-DD`.
6. Use short controlled document-type names.
7. Use underscores between semantic fields. Keep existing hyphens that are part of an official business identifier or acronym.
8. Preserve the source extension in lowercase.
9. External platform IDs such as Alibaba order numbers, receipt numbers or payment IDs remain metadata/content and are not added to the filename unless no Costa Gear record exists.
10. If two legitimate documents resolve to the same name, append `_02`, `_03`, etc. immediately before the extension.
11. Version `V##` is used only where version control is meaningful, such as policies, SOPs, templates and maintained administrative documents.
12. Archive files normally preserve the filename they had when active. Legacy archive material is not mass-renamed solely for cosmetic compliance.

---

## 00_ADMIN

### Business / legal documents

Destination:
`00_ADMIN/Business_Legal/`

Family:
`ADM`

Pattern:
`ADM_<DocumentType>[_<Description>][_<Version>]_<Date>.<ext>`

Examples:
- `ADM_Business_Registration_Summary_V01_2026-06-04.pdf`
- `ADM_PSR_Confirmation_2026-06-03.pdf`
- `ADM_Statement_of_Registration_FM1108673_2026-06-01.pdf`

### Agreements

Destination:
`00_ADMIN/Agreements/`

Family:
`AGR`

Pattern:
`AGR_<Counterparty>_<Description>[_<Version>]_<Date>.<ext>`

Example:
- `AGR_PrintVendor_Brand_Packaging_Agreement_2026-09-20.pdf`

### Insurance / compliance

Destination:
`00_ADMIN/Insurance_Compliance/`

Families:
- `INS` for insurance documents
- `COM` for non-tax compliance documents

Patterns:
- `INS_<Provider>_<DocumentType>_<Date>.<ext>`
- `COM_<AuthorityOrSubject>_<DocumentType>_<Date>.<ext>`

Tax registrations and tax filings belong under Finance / Tax instead of Admin.

---

## 01_FINANCE

### Expenses

Destination:
`01_FINANCE/Expenses/<YYYY>/`

Record key:
`EXP####`

Pattern:
`EXP####_<Vendor>_<Description>_<Date>.<ext>`

Example:
- `EXP0025_Vercel_Inc_AI_credit_2026-09-13.pdf`

This module is for operating and administrative expenses. Inventory purchased for resale is not an Expense document workflow.

### Assets (CCA)

Destination:
`01_FINANCE/Expenses/<YYYY>/`

Record key:
`AST###`

The asset record key is derived from the asset code. Example: `A-001` becomes `AST001`.

Pattern:
`AST###_<Vendor>_<AssetName>_<Date>.<ext>`

Example:
- `AST001_Costco_ca_Laptop_MS_Surface_13in_2025-10-28.pdf`

### Tax

Destination:
`01_FINANCE/Tax/`

Family:
`TAX`

Pattern:
`TAX_<ProgramOrJurisdiction>_<DocumentType>_<Date>.<ext>`

Examples:
- `TAX_GST-HST_Registration_2026-06-04.pdf`
- `TAX_PST_Application_2026-06-01.pdf`

### Banking

Destination:
`01_FINANCE/Banking/`

Family:
`BNK`

Pattern:
`BNK_<Institution>_<DocumentType>_<Date>.<ext>`

Example:
- `BNK_RBC_Statement_2026-09-30.pdf`

For statements, use the statement-end date as the filename date.

### Revenue documents not tied to an individual Sale record

Destination:
`01_FINANCE/Revenue/`

Family:
`REV`

Pattern:
`REV_<Source>_<DocumentType>_<Date>.<ext>`

If the document belongs to a specific Sales record, use the Sales record reference instead of `REV`.

### Generated finance reports

Family:
`RPT`

Patterns:
- `RPT_Expenses_FY<YYYY>_<GeneratedDate>.xlsx`
- `RPT_Assets_CCA_FY<YYYY>_<GeneratedDate>.xlsx`
- `RPT_Tax_FY<YYYY>_<GeneratedDate>.xlsx`

The fiscal year and generation date are different fields and therefore are not considered duplicate information.

---

## 02_PRODUCTS

### Supplier pre-purchase documents

Destination:
`02_PRODUCTS/Suppliers_Sourcing/SUP-###_<SupplierShort>/`

Record key:
`SUP###`

Pattern:
`SUP###_<SupplierShort>_<DocumentType>[_<Description>]_<Date>.<ext>`

Controlled types:
- `Catalog`
- `Price_List`
- `Technical`
- `Other_PrePurchase`

Examples:
- `SUP003_Yize_Catalog_Wrangler_JL_2026-09-16.pdf`
- `SUP003_Yize_Price_List_2026-09-16.xlsx`
- `SUP011_Yuhang_Technical_Roof_Rack_2026-09-04.pdf`

Supplier Intake is **pre-purchase only**. Contracts, receipts and invoices for an existing purchase belong to Buying > PO Documents.

### Supplier quotations

Each Costa Gear quotation receives one simple global sequential reference:

`QUO###`

The internal quotation number does **not** contain the supplier number or date. Supplier and date are already separate document fields.

Patterns:
- `QUO###_<SupplierShort>_Source_<Date>.<ext>`
- `QUO###_<SupplierShort>_Import_<Date>.xlsx`

Examples:
- `QUO001_Yize_Source_2026-06-15.xlsx`
- `QUO002_LechangXinDongsui_Source_2026-09-09.pdf`
- `QUO002_LechangXinDongsui_Import_2026-09-09.xlsx`
- `QUO003_Xinyi_Import_2026-09-29.xlsx`

`Source` is the supplier-original document. `Import` is the standardized Costa Gear workbook.

Supplier-provided quotation numbers remain metadata in `supplier_quote_ref`; they are not used as the Costa Gear document key.

### Product-specific formal documents

Product photos and reference images do not require formal naming.

If a formal document is stored for a specific product, use:

`PRD_<SKU>_<DocumentType>[_<Description>]_<Date>.<ext>`

Example:
- `PRD_CG-RB-01_Installation_Instructions_2026-09-10.pdf`

The `CG-` inside the SKU remains because it is part of the official product identifier, not a general filename prefix.

### Quotation import template

Reusable template:
- `TPL_Supplier_Quotation_Import.xlsx`

---

## 03_OPERATIONS

### Purchase Orders

Destination:
`03_OPERATIONS/Purchase_Orders/`

The folder remains flat. Supplier subfolders are not created.

Record key:
`PO###`

Pattern:
`PO###_<SupplierShort>_<DocumentType>_<Date>.<ext>`

Controlled types:
- `Contract`
- `Receipt`
- `Invoice`
- `Credit_Refund`
- `Other`

Examples:
- `PO001_Yize_Contract_2026-06-15.pdf`
- `PO001_Yize_Receipt_2026-06-23.pdf`
- `PO002_Xinyi_Invoice_2026-09-29.pdf`

### Logistics / shipment documents

There is currently no formal shipment-document upload channel. When one is introduced, the shipment's Costa Gear reference should be the record key.

Pattern:
`<ShipmentRef>_<DocumentType>_<Date>.<ext>`

Examples:
- `SHP-20260930-DC220C_Bill_of_Lading_2026-10-28.pdf`
- `SHP-20260930-DC220C_Freight_Invoice_2026-10-28.pdf`

Do not add another `SHP_` prefix when the shipment reference already begins with `SHP-`.

### SOPs

Destination:
`03_OPERATIONS/SOPs/`

Family:
`SOP`

Pattern:
`SOP_<Process>_<Title>_V##_YYYY-MM-DD.<ext>`

Example:
- `SOP_Receiving_Inventory_Receiving_V01_2026-10-02.pdf`

---

## 04_SALES_MARKETING

### Sales documents

There is currently no formal Sales-document upload workflow. If a document belongs to a specific Sale record, use the existing Sale reference as the record key.

Pattern:
`<SaleRef>_<DocumentType>_<Date>.<ext>`

Example:
- `SALE-20261001-8759_Receipt_2026-10-01.pdf`

### Marketing images, product creatives, logos and photos

No formal document naming convention applies at this stage.

Use a descriptive human-readable filename that clearly tells the user what the asset is. Product/SKU association may be included when helpful.

### Brand or website formal documents

Formal documents such as brand guidelines may use:

`BRD_<DocumentType>[_<Version>]_<Date>.<ext>`

Example:
- `BRD_Brand_Guidelines_V01_2026-08-18.pdf`

Vendor invoices for website, hosting or marketing services still belong in Expenses, not Marketing_Content.

---

## 05_TEMPLATES

Family:
`TPL`

Pattern:
`TPL_<Process>_<DocumentName>[_V##]_<Date>.<ext>`

For evergreen system-generated templates where date/version adds no value, a stable name is acceptable.

Example:
- `TPL_Supplier_Quotation_Import.xlsx`

---

## 99_ARCHIVE

Archive is a preservation area, not an active business-process repository.

Rules:
- Documents moved from an active controlled folder retain their official filename.
- Legacy historical documents are not mass-renamed solely to match a newer standard.
- If a legacy document is reactivated into an operational folder, it adopts the current active naming convention at that point.
- Photos/images remain outside the formal document naming standard.

---

## Internal staging

Files in the Supplier Intake `_INTAKE` area are temporary technical artifacts, not official business records.

New staging files use:
`INTAKE_<timestamp>_<safe-original-name>.<ext>`

Legacy `CG_INTAKE_...` staging files remain recognized for cleanup compatibility but are not an official naming pattern.
