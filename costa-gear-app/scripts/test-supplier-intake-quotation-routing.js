const fs = require("fs");
const path = require("path");

const service = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "supplierIntakeService.js"),
  "utf8"
);
const ui = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "SupplierIntakeWorkspace.js"),
  "utf8"
);

const requiredService = [
  'import * as XLSX from "xlsx"',
  '["xlsx", "xls", "xlsm"].includes(extension)',
  "XLSX.utils.sheet_to_json",
  "const hasQuantity",
  "const hasUnitPrice",
  "const hasTotal",
  "const hasIncoterm",
  'return { value: "QUOTATION", confidence: explicitQuotation ? 0.98 : 0.9 }',
  'const inferred = inferDocumentType(evidence, file.name);',
];

for (const token of requiredService) {
  if (!service.includes(token)) {
    throw new Error(`Supplier spreadsheet quotation routing guard is missing: ${token}`);
  }
}

const quoteDecision = service.indexOf('return { value: "QUOTATION", confidence: explicitQuotation ? 0.98 : 0.9 }');
const priceListDecision = service.indexOf('return { value: "PRICE_LIST", confidence: 0.9 }');
if (quoteDecision < 0 || priceListDecision < 0 || quoteDecision > priceListDecision) {
  throw new Error("Transactional quotation detection must run before the Price List filename fallback.");
}

const navigation = ui.indexOf("onCompleteQuotation(result.quotation.id)");
const fallback = ui.indexOf('setComplete({\n        kind: "quotation"');
if (navigation < 0) {
  throw new Error("Completed quotation must navigate directly to Product Matching.");
}
if (fallback < 0 || navigation > fallback) {
  throw new Error("Automatic Product Matching navigation must occur before the fallback success screen.");
}

process.stdout.write("Supplier Intake quotation routing regression test passed.\n");
