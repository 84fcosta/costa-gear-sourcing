const fs = require("fs");
const path = require("path");

const service = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "supplierQuotationIntakeService.js"),
  "utf8"
);
const intakeUi = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "SupplierIntakeWorkspace.js"),
  "utf8"
);

const requiredService = [
  "deleteSupplierQuotationDraft",
  "if (!workbookFile)",
  'documentType: "QUOTATION_IMPORT"',
  "await deleteSupplierQuotationDraft(quotation.id)",
  "was rolled back and was not released to Product Matching",
];

for (const token of requiredService) {
  if (!service.includes(token)) {
    throw new Error(`Quotation archive control is missing: ${token}`);
  }
}

if (/if\s*\(workbookFile\)\s*\{/.test(service)) {
  throw new Error("Costa Gear quotation XLSX must not be optional during canonical quotation import.");
}

if (!intakeUi.includes("Continue to Product Matching")) {
  throw new Error("Supplier Intake must still hand completed quotations to Product Matching.");
}

if (!intakeUi.includes("await finalizeQuotationSupplierIntake")) {
  throw new Error("Product Matching completion must remain downstream of quotation finalization.");
}

process.stdout.write("Supplier Intake quotation archive regression test passed.\n");
