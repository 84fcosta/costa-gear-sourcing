# Costa Gear Document Naming Convention

**Policy version:** 2026.10.02

This file is the authoritative document naming standard for Costa Gear Operations.

The executable implementation lives in:
- `src/domain/documentNaming.js`
- `src/domain/documentGovernance.js`

The build-time enforcement lives in:
- `scripts/test-document-governance.js`
- `scripts/check-document-naming-policy.js`

Any future feature that uploads, renames, exports or migrates a formal document must use the central naming helpers instead of creating a new naming rule locally.

## 1. Scope

This standard applies to formal business documents such as PDFs, spreadsheets, word-processing files, reports, contracts, invoices, receipts, tax records, SOPs and templates.

Photos, product images, marketing creatives, logos and other visual assets are not governed by this formal convention. They only require a clear human-readable name until a separate media naming policy is adopted.

Archive and temporary intake/staging files are excluded from active naming compliance. When an archived document is reactivated into an operational folder, it adopts the current standard.

## 2. Core principles

1. Do **not** add a generic `CG_` prefix. Every file in this repository already belongs to Costa Gear.
2. Numbered operational record families use **four digits** consistently:
   - `SUP0001`
   - `QUO0001`
   - `PO0001`
   - `EXP0001`
   - `AST0001`
3. Record family and number form one token. Use `PO0001`, not `PO_0001`.
4. Use the Costa Gear record key first whenever the document belongs to a structured app record.
5. Do not repeat supplier, date, record type or external platform IDs inside the record number.
6. Use one document date, at the end, in `YYYY-MM-DD` format, unless the family is version-controlled instead of date-controlled.
7. Use underscores between semantic filename fields.
8. Preserve the file extension in lowercase.
9. External IDs such as Alibaba order, receipt or payment numbers remain metadata/content. They are not appended to a filename when a Costa Gear record ID exists.
10. If two legitimate files resolve to the same governed filename, append `_02`, `_03`, etc. immediately before the extension.
11. Version-controlled documents use `V01`, `V02`, etc. Never use FINAL, COPY or REVISED as version identifiers.
12. Supplier master folder IDs may remain in their existing `SUP-003` form. Formal filenames normalize the same supplier number to `SUP0003`.

## 3. Numbered business records

### Supplier documents

**Business stage:** pre-purchase sourcing  
**App entry point:** Supplier Intake  
**Destination:** `02_PRODUCTS/Suppliers_Sourcing/SUP-###_<SupplierShort>/`

Pattern:

`SUP####_<Supplier>_<Type>[_<Description>]_<Date>.<ext>`

Controlled types:
- `Catalog`
- `Price_List`
- `Technical`
- `Other_PrePurchase`

Examples:
- `SUP0003_Yize_Catalog_Wrangler_JL_2026-09-16.pdf`
- `SUP0003_Yize_Price_List_2026-09-16.xlsx`
- `SUP0011_Yuhang_Technical_Roof_Rack_2026-09-04.pdf`

Contracts, receipts and invoices for an existing purchase do **not** belong in Supplier Intake.

### Supplier quotations

**Business stage:** supplier offer / quotation  
**App entry point:** Supplier Intake and Supplier Quotations  
**Destination:** supplier sourcing folder

Costa Gear internal quotation ID:

`QUO####`

The internal ID is a single global sequential number. It does not contain supplier number, date or a per-day sequence.

Patterns:
- `QUO####_<Supplier>_Source_<Date>.<ext>`
- `QUO####_<Supplier>_Import_<Date>.xlsx`

Examples:
- `QUO0001_Yize_Source_2026-06-15.xlsx`
- `QUO0002_LechangXinDongsui_Source_2026-09-09.pdf`
- `QUO0002_LechangXinDongsui_Import_2026-09-09.xlsx`
- `QUO0003_Xinyi_Import_2026-09-29.xlsx`

`Source` = supplier-original document.  
`Import` = standardized Costa Gear workbook.

The supplier's own quotation reference is stored separately as `supplier_quote_ref`. The previous Costa Gear quotation reference is retained as `legacy_quote_ref` for audit traceability.

### Purchase Order documents

**Business stage:** committed inventory purchase  
**App entry point:** Buying > PO Documents  
**Destination:** `03_OPERATIONS/Purchase_Orders/`

The folder remains flat. Supplier subfolders are not created.

Pattern:

`PO####_<Supplier>_<Type>_<Date>.<ext>`

Controlled types:
- `Contract`
- `Receipt`
- `Invoice`
- `Credit_Refund`
- `Other`

Examples:
- `PO0001_Yize_Contract_2026-06-15.pdf`
- `PO0001_Yize_Receipt_2026-06-23.pdf`
- `PO0002_Xinyi_Invoice_2026-09-29.pdf`

### Expenses

**Business stage:** operating/admin spending  
**App entry point:** Expenses  
**Destination:** `01_FINANCE/Expenses/<YYYY>/`

Pattern:

`EXP####_<Vendor>_<Description>_<Date>.<ext>`

Example:
- `EXP0025_Vercel_AI_Credit_2026-09-13.pdf`

Inventory purchased for resale belongs to Buying, not Expenses.

### Assets (CCA)

**Business stage:** capital asset acquisition  
**App entry point:** Expenses > Assets  
**Destination:** `01_FINANCE/Expenses/<YYYY>/`

Pattern:

`AST####_<Vendor>_<Asset>_<Date>.<ext>`

Example:
- `AST0001_Costco_Surface_Laptop_2025-10-28.pdf`

An existing asset code such as `A-001` normalizes to `AST0001` in the document filename.

## 4. Administrative and finance document families

These families do not receive artificial sequential IDs unless a dedicated app record exists.

### Admin / Corporate

Pattern:

`ADM_<Type>_<Description>_<Date>.<ext>`

Examples:
- `ADM_Business_Registration_Summary_2026-06-04.pdf`
- `ADM_PSR_Confirmation_2026-06-03.pdf`
- `ADM_Statement_of_Registration_FM1108673_2026-06-01.pdf`

### Agreements

Pattern:

`AGR_<Counterparty>_<Description>_<Date>.<ext>`

Example:
- `AGR_PrintVendor_Packaging_Agreement_2026-09-20.pdf`

### Insurance

Pattern:

`INS_<Provider>_<Type>_<Date>.<ext>`

Example:
- `INS_Intact_Liability_Policy_2026-07-01.pdf`

### Compliance

Pattern:

`COM_<AuthorityOrSubject>_<Type>_<Date>.<ext>`

Example:
- `COM_BC_Annual_Return_2026-12-01.pdf`

Tax documents belong to Finance / Tax rather than Admin compliance.

### Tax

Pattern:

`TAX_<ProgramOrJurisdiction>_<Type>_<Date>.<ext>`

Examples:
- `TAX_GST-HST_Registration_2026-06-04.pdf`
- `TAX_PST_Application_2026-06-01.pdf`

### Banking

Pattern:

`BNK_<Institution>_<Type>_<Date>.<ext>`

Example:
- `BNK_RBC_Statement_2026-09-30.pdf`

For statements, use the statement-end date.

### General Finance

Pattern:

`FIN_<Type>_<Description>_<Date>.<ext>`

Example:
- `FIN_Budget_Operating_2027_2026-11-15.xlsx`

### Revenue documents not tied to one Sale

Pattern:

`REV_<Source>_<Type>_<Date>.<ext>`

Example:
- `REV_Amazon_Settlement_2026-10-31.pdf`

If a document belongs to a specific Sale record, use that Sale reference instead.

## 5. App-generated reports

Pattern:

`RPT_<Report>_<Period>_<GeneratedDate>.<ext>`

Examples:
- `RPT_Expenses_FY2026_2026-10-02.xlsx`
- `RPT_Assets_CCA_FY2026_2026-10-02.xlsx`
- `RPT_Tax_FY2026_2026-10-02.xlsx`

The fiscal period and generation date are separate business facts and are intentionally both retained.

## 6. SOPs

SOPs use version control instead of a filename date.

Pattern:

`SOP_<Process>_<Title>_V##.<ext>`

Examples:
- `SOP_Receiving_Inventory_Receiving_V01.pdf`
- `SOP_Sourcing_Supplier_Intake_V02.pdf`

The effective/revision date belongs in document metadata/content.

## 7. Templates

Templates use version control instead of a filename date.

Pattern:

`TPL_<Process>_<Name>_V##.<ext>`

Examples:
- `TPL_Sourcing_Supplier_Quotation_Import_V01.xlsx`
- `TPL_Inventory_Receiving_Checklist_V01.xlsx`

## 8. Product-specific formal documents

Product photos and reference images are outside this formal convention.

If a formal document is associated with a specific product, use the official SKU:

`PRD_<SKU>_<Type>[_<Description>]_<Date>.<ext>`

Example:
- `PRD_CG-RB-01_Installation_Instructions_2026-09-10.pdf`

The `CG-` portion remains because it is part of the official product SKU.

## 9. Logistics and Sales records

Where an existing record reference already carries its family, do not add another family prefix.

Shipment example:
- `SHP-20260930-DC220C_Bill_of_Lading_2026-10-28.pdf`

Sale example:
- `SALE-20261001-8759_Receipt_2026-10-01.pdf`

## 10. Images and visual assets

No formal naming framework is currently required for:
- product photos
- installation photos
- Marketplace/Amazon creatives
- logos
- social graphics
- marketing images

Use a clear human-readable filename, optionally including a SKU when it helps identification.

Examples:
- `Running Board Installed Driver Side.jpg`
- `CG-RB-01 Bracket Detail.jpg`
- `Amazon Main Image.png`

## 11. Archive and staging

`99_ARCHIVE` is a preservation area, not an active-process repository. Existing archive filenames are not mass-renamed simply to meet a newer standard.

Supplier Intake staging files are temporary technical artifacts and use:

`INTAKE_<timestamp>_<safe-original-name>.<ext>`

Legacy `CG_INTAKE_...` files remain recognized for cleanup compatibility.

## 12. Legacy migration decisions

The historical supplier catalogs that were already in the active Costa Gear repository without a complete document date were approved for the migration date **2026-06-15**. This is a one-time migration decision for those legacy catalog files only. It is **not** a default date for future supplier documents, and new Supplier Intake documents still require their actual document date.

## 13. Change-control requirement

A naming change is not complete unless all of the following remain aligned:

1. this policy document;
2. `src/domain/documentNaming.js`;
3. the module-specific naming generator;
4. `oneDriveDocumentIndexService.js` compliance analysis;
5. naming regression tests;
6. the build-time policy checker;
7. database identity logic where the record ID is database-generated.

Do not introduce a new hard-coded formal document filename pattern in a component or service. Add or change the central framework first.
