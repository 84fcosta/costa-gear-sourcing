# Costa Gear Document Naming Convention

## Scope

This standard applies to files that Costa Gear Operations uploads to OneDrive and renames automatically.

The official structure is:

`CG_<RecordKey>_<Context>_<DocumentTypeOrDescription>_<YYYY-MM-DD>.<ext>`

The **record family and its identifier stay together as one token**. Do not insert another underscore between them.

Examples:
- `PO001`, not `PO_001` and not `PO_PO001`
- `SUP003`, not `SUP_003` and not `SUP_SUP-003`
- `EXP0025`, not `EXP_0025`
- `AST001`, not `AST_A-001`
- `QUO012-20260929-01`, not `QUO_CGQ-SUP012-20260929-01`

## General rules

1. `CG_` is the Costa Gear namespace.
2. The next token is the business record key. Its type and identifier are never separated.
3. Include a short human-readable context when it materially helps identify a flat-file record, such as the supplier short name.
4. Use controlled document-type tokens rather than platform-specific names.
5. Use underscores between semantic fields and ISO date `YYYY-MM-DD`.
6. Preserve the original extension in lowercase.
7. Do not include external Alibaba order numbers, receipt numbers or other source-system IDs unless the business record has no Costa Gear identifier.
8. Do not repeat information already represented by the record family. For example, a PO receipt is `Receipt`, not `Supplier_Payment` or `PO_Payment`.
9. When two files would resolve to the same official name, append `_02`, `_03`, etc. before the extension.
10. Historical/archive files are not renamed automatically just to conform to a newer convention.

## Supplier Intake: pre-purchase supplier documents

Destination:
`02_PRODUCTS/Suppliers_Sourcing/SUP-###_<SupplierShort>/`

Record key:
`SUP###`

Pattern:
`CG_SUP###_<SupplierShort>_<DocumentType>[_<Descriptor>]_<Date>.<ext>`

Controlled types:
- `Catalog`
- `Price_List`
- `Technical`
- `Other_PrePurchase`

Examples:
- `CG_SUP003_Yize_Catalog_Wrangler_JL_2026-09-16.pdf`
- `CG_SUP003_Yize_Price_List_2026-09-16.xlsx`
- `CG_SUP011_ChangzhouYuhang_Technical_Roof_Rack_2026-09-04.pdf`

Supplier Intake is **pre-purchase only**. Contracts, receipts and invoices for an existing PO belong to Buying > PO Documents.

## Supplier Quotations

Destination:
same supplier sourcing folder as the supplier.

Costa Gear quotation references such as `CGQ-SUP012-20260929-01` are represented in filenames as:
`QUO012-20260929-01`

Patterns:
- `CG_QUO###-YYYYMMDD-##_ <SupplierShort>_Source_<Date>.<ext>`
- `CG_QUO###-YYYYMMDD-##_ <SupplierShort>_Import_<Date>.xlsx`

Remove the space after `##_ ` in actual filenames; it appears here only to make the pattern readable.

Examples:
- `CG_QUO012-20260929-01_Xinyi_Source_2026-09-29.pdf`
- `CG_QUO012-20260929-01_Xinyi_Import_2026-09-29.xlsx`

`Source` means the supplier original. `Import` means the standardized Costa Gear workbook.

## Buying: Purchase Order documents

Destination:
`03_OPERATIONS/Purchase_Orders/`

The folder remains flat. No supplier subfolders are created.

Record key:
`PO###`

Pattern:
`CG_PO###_<SupplierShort>_<DocumentType>_<Date>.<ext>`

Controlled types:
- `Contract`
- `Receipt`
- `Invoice`
- `Credit_Refund`
- `Other`

Examples:
- `CG_PO001_Yize_Contract_2026-06-15.pdf`
- `CG_PO001_Yize_Receipt_2026-06-23.pdf`
- `CG_PO002_Xinyi_Invoice_2026-09-29.pdf`

## Expenses

Destination:
`01_FINANCE/Expenses/<YYYY>/`

Record key:
`EXP####`

Pattern:
`CG_EXP####_<Vendor>_<Description>_<Date>.<ext>`

Example:
- `CG_EXP0025_Vercel_Inc_AI_credit_2026-09-13.pdf`

Expense uploads are for operating/admin expenses. Inventory purchases for resale belong to Buying, not Expenses.

## Assets (CCA)

Destination:
`01_FINANCE/Expenses/<YYYY>/`

Record key:
`AST###`

The record key is derived from the asset code, e.g. `A-001` becomes `AST001`.

Pattern:
`CG_AST###_<Vendor>_<AssetName>_<Date>.<ext>`

Example:
- `CG_AST001_Costco_ca_Laptop_MS_Surface_13in_2025-10-28.pdf`

## Product files

`02_PRODUCTS/Product_Files/<CG-SKU>/` is synchronized by the app but is **not currently an upload-and-rename channel**. Existing product-image naming remains separate from this document standard.

## Marketing, admin, tax, brand and archive files

Families such as `CG_MKT_`, `CG_ADM_`, `CG_TAX_`, `CG_BRN_` and `CG_RES_` are content/archive families rather than numbered operational records. They retain an underscore after the family code because they do not carry a sequential record ID immediately after the family token.

They are not changed by the operational upload naming standard.

## Internal intake staging

`CG_INTAKE_...` files under the historical `_INTAKE` folder are internal/legacy staging artifacts, not official business records. They are excluded from the operational naming convention and are not used as the permanent filename for confirmed documents.
