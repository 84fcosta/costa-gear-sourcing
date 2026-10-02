const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

(async () => {
  const namingCode = read("src/domain/documentNaming.js");
  const namingUrl = "data:text/javascript;base64," + Buffer.from(namingCode).toString("base64");
  const naming = await import(namingUrl);
  const governanceCode = read("src/domain/documentGovernance.js")
    .replace('"./documentNaming"', '"' + namingUrl + '"');
  const governance = await import("data:text/javascript;base64," + Buffer.from(governanceCode).toString("base64"));

  assert.strictEqual(naming.supplierRecordKey("SUP-003"), "SUP003");
  assert.strictEqual(naming.purchaseOrderRecordKey(2), "PO002");
  assert.strictEqual(naming.expenseRecordKey(25), "EXP0025");
  assert.strictEqual(naming.assetRecordKey("A-001"), "AST001");
  assert.strictEqual(naming.quotationRecordKey("QUO3"), "QUO003");

  assert.strictEqual(
    governance.supplierDocumentShortName("Danyang Jiepai Yize Auto Parts Factory"),
    "Yize"
  );
  assert.strictEqual(
    governance.supplierDocumentShortName("Hainan Xinyi Information Technology Co Ltd"),
    "Xinyi"
  );

  assert.strictEqual(
    governance.governedPurchaseOrderDocumentName({
      fileName: "Receipt.pdf",
      poNumber: 2,
      supplierName: "Hainan Xinyi Information Technology Co Ltd",
      documentType: "RECEIPT",
      documentDate: "2026-09-29",
    }),
    "PO002_Xinyi_Receipt_2026-09-29.pdf"
  );

  assert.strictEqual(
    governance.governedPurchaseOrderDocumentName({
      fileName: "Purchase Contract.pdf",
      poNumber: 1,
      supplierName: "Danyang Jiepai Yize Auto Parts Factory",
      documentType: "CONTRACT",
      documentDate: "2026-06-15",
    }),
    "PO001_Yize_Contract_2026-06-15.pdf"
  );

  assert.strictEqual(
    governance.detectPostPurchaseDocument({ fileName: "TA_CONTRACT_1790703352348.pdf" }),
    "CONTRACT"
  );
  assert.strictEqual(
    governance.detectPostPurchaseDocument({ fileName: "Receipt_316341371001023049.pdf" }),
    "RECEIPT"
  );
  assert.strictEqual(
    governance.detectPostPurchaseDocument({ fileName: "supplier_proforma_invoice.xlsx" }),
    null
  );

  const supplierDocs = read("src/services/supplierDocumentService.js");
  assert.match(supplierDocs, /return \`\$\{supplierKey\}_\$\{shortName\}_\$\{typeToken\}/);
  assert.match(supplierDocs, /return \`\$\{quoteKey\}_\$\{shortName\}_\$\{role\}/);
  assert.doesNotMatch(supplierDocs, /`CG_/);
  assert.match(supplierDocs, /"Source" : "Import"/);

  const oneDrive = read("src/services/oneDriveAppFolderService.js");
  assert.match(oneDrive, /\$\{key\}_\$\{vendor\}_\$\{description\}/);
  assert.doesNotMatch(oneDrive, /`CG_/);

  const namingStandard = read("docs/DOCUMENT_NAMING_CONVENTION.md");
  assert.match(namingStandard, /Do \*\*not\*\* prefix filenames with \`CG\`/);
  assert.match(namingStandard, /QUO###/);
  assert.doesNotMatch(namingStandard, /CG_PO###/);

  const legacyAdmin = read("src/services/legacyDocumentMigrationService.js");
  assert.doesNotMatch(legacyAdmin, /CG_(?:EXP|BNK|REV|BUD)/);

  const legacySupplier = read("src/services/legacyProductSupplierMigrationService.js");
  assert.doesNotMatch(legacySupplier, /const parts = \["CG"/);

  const expenses = read("src/domain/expenseTracking.js");
  assert.match(expenses, /"Samples & Prototypes"/);
  assert.doesNotMatch(expenses, /"Inventory \/ Product Samples"/);
  assert.match(expenses, /Non-resale items bought for evaluation, testing or prototyping/);
  assert.match(expenses, /RPT_Expenses_FY/);
  assert.match(expenses, /RPT_Assets_CCA_FY/);
  assert.match(expenses, /RPT_Tax_FY/);

  const expenseUi = read("src/components/ExpenseWorkspace.js");
  assert.match(expenseUi, /Receipt \/ Invoice/);
  assert.match(expenseUi, /Inventory purchase documents belong to Buying → PO Documents/);

  const intake = read("src/services/supplierIntakeService.js");
  assert.match(intake, /Other Pre-Purchase Document/);
  assert.match(intake, /BUYING_PO_DOCUMENTS/);

  const intakeUi = read("src/components/SupplierIntakeWorkspace.js");
  assert.match(intakeUi, /Pre-purchase supplier document channel/);
  assert.match(intakeUi, /Use Buying → PO Documents/);

  const poService = read("src/services/purchaseOrderDocumentService.js");
  assert.match(poService, /"03_OPERATIONS", "Purchase_Orders"/);
  assert.match(poService, /purchase_order_documents/);

  const buying = read("src/components/BuyingDecisionWorkspace.js");
  assert.match(buying, /PurchaseOrderDocumentsPanel/);

  process.stdout.write("Document governance regression test passed.\n");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
