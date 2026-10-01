const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "src", "components", "SupplierIntakeWorkspace.js");
const source = fs.readFileSync(target, "utf8");

const required = [
  "documentConfirmed",
  "Confirm & Save to OneDrive",
  "Review & confirm",
  "Use Supplier Intake for pre-purchase sourcing documents only.",
  "Contracts, receipts and invoices for an existing purchase order belong in Buying → PO Documents.",
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Supplier Intake confirmation guard is missing required token: ${token}`);
  }
}

const forbidden = [
  "autoSaveGeneralIfSafe",
  "saved automatically to",
  "Create Supplier & Continue",
];

for (const token of forbidden) {
  if (source.includes(token)) {
    throw new Error(`Supplier Intake confirmation guard detected forbidden auto-save behavior: ${token}`);
  }
}

process.stdout.write("Supplier Intake confirmation smoke test passed.\n");
