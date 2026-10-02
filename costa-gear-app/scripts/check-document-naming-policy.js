const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcRoot = path.join(root, "src");

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

const forbidden = [
  { pattern: /CG_PO_/g, reason: "PO document names must begin PO####, not CG_PO_..." },
  { pattern: /CG_SUP_/g, reason: "Supplier document names must begin SUP####, not CG_SUP_..." },
  { pattern: /CG_QUO_/g, reason: "Quotation document names must begin QUO####, not CG_QUO_..." },
  { pattern: /CG_EXP_/g, reason: "Expense document names must begin EXP####, not CG_EXP_..." },
  { pattern: /CG_AST_/g, reason: "Asset document names must begin AST####, not CG_AST_..." },
  { pattern: /Costa_Gear_Expenses_/g, reason: "Generated finance reports must use RPT_..." },
  { pattern: /Costa_Gear_Assets_CCA_/g, reason: "Generated finance reports must use RPT_..." },
  { pattern: /Costa_Gear_Tax_Report_/g, reason: "Generated finance reports must use RPT_..." },
  { pattern: /CGQ-SUP/g, reason: "New internal quotation references must use QUO####." },
];

const exclusions = new Set([
  // Legacy/archive migration code may need to recognize historical names as input.
  "src/services/legacyBrandMarketingMigrationService.js",
  "src/services/legacyCloseoutMigrationService.js",
  "src/services/activeDocumentNamingPreviewService.js", // must recognize legacy names as migration input
]);

const violations = [];
for (const file of walk(srcRoot)) {
  const rel = relative(file);
  if (exclusions.has(rel)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const rule of forbidden) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(source))) {
      violations.push({
        file: rel,
        token: match[0],
        reason: rule.reason,
      });
      if (!rule.pattern.global) break;
    }
  }
}

const required = [
  ["src/domain/documentGovernance.js", /purchaseOrderRecordKey/],
  ["src/services/supplierDocumentService.js", /quotationRecordKey/],
  ["src/services/supplierDocumentService.js", /supplierRecordKey/],
  ["src/services/oneDriveAppFolderService.js", /expenseRecordKey/],
  ["src/services/oneDriveAppFolderService.js", /assetRecordKey/],
  ["src/services/oneDriveDocumentIndexService.js", /analyzeOfficialDocumentName/],
  ["src/domain/expenseTracking.js", /reportFileName/],
  ["src/domain/supplierQuotationWorkbook.js", /templateFileName/],
];

for (const [rel, pattern] of required) {
  const absolute = path.join(root, rel);
  const source = fs.readFileSync(absolute, "utf8");
  if (!pattern.test(source)) {
    violations.push({
      file: rel,
      token: String(pattern),
      reason: "Document-related code must use the central naming framework.",
    });
  }
}

const policy = fs.readFileSync(path.join(root, "docs", "DOCUMENT_NAMING_CONVENTION.md"), "utf8");
for (const text of [
  "SUP0001",
  "QUO0001",
  "PO0001",
  "EXP0001",
  "AST0001",
  "SOP_<Process>_<Title>_V##",
  "TPL_<Process>_<Name>_V##",
]) {
  if (!policy.includes(text)) {
    violations.push({
      file: "docs/DOCUMENT_NAMING_CONVENTION.md",
      token: text,
      reason: "Authoritative policy is missing a required invariant.",
    });
  }
}

if (violations.length) {
  console.error("Document naming policy violations:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.token} — ${violation.reason}`);
  }
  process.exit(1);
}

process.stdout.write("Document naming policy guard passed.\n");
