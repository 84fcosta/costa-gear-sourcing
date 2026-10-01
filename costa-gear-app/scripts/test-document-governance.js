const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

(async () => {
  const governanceCode = read("src/domain/documentGovernance.js");
  const governance = await import("data:text/javascript;base64," + Buffer.from(governanceCode).toString("base64"));

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
    "CG_PO_002_Xinyi_Receipt_2026-09-29.pdf"
  );

  assert.strictEqual(
    governance.governedPurchaseOrderDocumentName({
      fileName: "Purchase Contract.pdf",
      poNumber: 1,
      supplierName: "Danyang Jiepai Yize Auto Parts Factory",
      documentType: "CONTRACT",
      documentDate: "2026-06-15",
    }),
    "CG_PO_001_Yize_Contract_2026-06-15.pdf"
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

  const expenses = read("src/domain/expenseTracking.js");
  assert.match(expenses, /"Samples & Prototypes"/);
  assert.doesNotMatch(expenses, /"Inventory \/ Product Samples"/);
  assert.match(expenses, /Non-resale items bought for evaluation, testing or prototyping/);

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
