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

  assert.strictEqual(naming.DOCUMENT_RECORD_DIGITS, 4);
  assert.strictEqual(naming.supplierRecordKey("SUP-003"), "SUP0003");
  assert.strictEqual(naming.quotationRecordKey("QUO3"), "QUO0003");
  assert.strictEqual(naming.purchaseOrderRecordKey(2), "PO0002");
  assert.strictEqual(naming.expenseRecordKey(25), "EXP0025");
  assert.strictEqual(naming.assetRecordKey("A-001"), "AST0001");

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
    "PO0002_Xinyi_Receipt_2026-09-29.pdf"
  );

  assert.strictEqual(
    governance.governedPurchaseOrderDocumentName({
      fileName: "Purchase Contract.pdf",
      poNumber: 1,
      supplierName: "Danyang Jiepai Yize Auto Parts Factory",
      documentType: "CONTRACT",
      documentDate: "2026-06-15",
    }),
    "PO0001_Yize_Contract_2026-06-15.pdf"
  );

  assert.strictEqual(
    naming.reportFileName({
      report: "Expenses",
      period: "FY2026",
      generatedDate: "2026-10-02",
    }),
    "RPT_Expenses_FY2026_2026-10-02.xlsx"
  );

  assert.strictEqual(
    naming.sopFileName({
      process: "Receiving",
      title: "Inventory_Receiving",
      version: 1,
      extension: "pdf",
    }),
    "SOP_Receiving_Inventory_Receiving_V01.pdf"
  );

  assert.strictEqual(
    naming.templateFileName({
      process: "Sourcing",
      name: "Supplier_Quotation_Import",
      version: 1,
      extension: "xlsx",
    }),
    "TPL_Sourcing_Supplier_Quotation_Import_V01.xlsx"
  );

  assert.deepStrictEqual(
    naming.analyzeOfficialDocumentName("PO0002_Xinyi_Receipt_2026-09-29.pdf"),
    { typeCode: "PO", compliant: true, issue: null }
  );
  assert.deepStrictEqual(
    naming.analyzeOfficialDocumentName("CG_PO0002_Xinyi_Receipt_2026-09-29.pdf"),
    { typeCode: "PO0002", compliant: false, issue: "Redundant CG prefix" }
  );
  assert.strictEqual(naming.analyzeOfficialDocumentName("Installed Driver Side.jpg").compliant, null);
  assert.strictEqual(naming.analyzeOfficialDocumentName("PO002_Xinyi_Receipt_2026-09-29.pdf").compliant, false);
  assert.strictEqual(naming.analyzeOfficialDocumentName("SOP_Receiving_Inventory_Receiving_V01.pdf").compliant, true);
  assert.strictEqual(naming.analyzeOfficialDocumentName("TPL_Sourcing_Supplier_Quotation_Import_V01.xlsx").compliant, true);

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
  assert.match(supplierDocs, /quotationRecordKey/);
  assert.match(supplierDocs, /supplierRecordKey/);
  assert.match(supplierDocs, /"Source" : "Import"/);
  assert.doesNotMatch(supplierDocs, /CG_QUO_/);
  assert.doesNotMatch(supplierDocs, /CG_SUP_/);

  const oneDrive = read("src/services/oneDriveAppFolderService.js");
  assert.match(oneDrive, /expenseRecordKey/);
  assert.match(oneDrive, /assetRecordKey/);
  assert.doesNotMatch(oneDrive, /CG_EXP_/);
  assert.doesNotMatch(oneDrive, /CG_AST_/);

  const indexService = read("src/services/oneDriveDocumentIndexService.js");
  assert.match(indexService, /analyzeOfficialDocumentName/);
  assert.match(indexService, /99_ARCHIVE/);

  const expenses = read("src/domain/expenseTracking.js");
  assert.match(expenses, /"Samples & Prototypes"/);
  assert.doesNotMatch(expenses, /"Inventory \/ Product Samples"/);
  assert.match(expenses, /Non-resale items bought for evaluation, testing or prototyping/);
  assert.match(expenses, /reportFileName/);

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

  const policy = read("docs/DOCUMENT_NAMING_CONVENTION.md");
  assert.match(policy, /authoritative document naming standard/);
  assert.match(policy, /SUP0001/);
  assert.match(policy, /QUO0001/);
  assert.match(policy, /PO0001/);
  assert.match(policy, /EXP0001/);
  assert.match(policy, /AST0001/);
  assert.match(policy, /Do \*\*not\*\* add a generic `CG_` prefix/);

  process.stdout.write("Document governance regression test passed.\n");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
