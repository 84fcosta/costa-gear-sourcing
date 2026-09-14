const fs = require("fs");
const path = require("path");

const service = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "supplierIntakeService.js"),
  "utf8"
);
const workspace = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "SupplierIntakeWorkspace.js"),
  "utf8"
);
const api = fs.readFileSync(
  path.join(__dirname, "..", "api", "supplier-intake-analyze.js"),
  "utf8"
);

const forbiddenInService = [
  "/api/supplier-intake-analyze",
  "uploadSupplierIntakeStagingFile",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
];

for (const token of forbiddenInService) {
  if (service.includes(token)) {
    throw new Error(`Supplier Intake deterministic service still references forbidden AI/staging token: ${token}`);
  }
}

const required = [
  "parseCostaGearSupplierQuotation",
  "uploadSupplierDocument",
  "Converted Costa Gear XLSX",
  "Confirm & Import Quotation",
];

for (const token of required) {
  if (!(service.includes(token) || workspace.includes(token))) {
    throw new Error(`Supplier Intake deterministic flow is missing required token: ${token}`);
  }
}

if (!api.includes("SUPPLIER_INTAKE_AI_SUSPENDED")) {
  throw new Error("Supplier Intake AI endpoint is not explicitly suspended.");
}

process.stdout.write("Supplier Intake no-AI smoke test passed.\n");
