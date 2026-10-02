const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const app = read("src/App.js");
assert.match(app, /DocumentGovernanceWorkspace/);
assert.match(app, /governance: \["Document Governance"/);
assert.match(app, /aria-label="Document Governance module"/);
assert.match(app, /workspace === "expenses" \? "active" : ""/);
assert.match(app, /workspace === "governance" \? "active" : ""/);
assert.ok((app.match(/cg-nav-divider/g) || []).length >= 2, "Expenses and Governance should be separated modules in the top navigation.");
assert.match(app, /<DocumentGovernanceWorkspace \/>/);
assert.doesNotMatch(app, /import LegacyMigrationWorkspace/);

const workspace = read("src/components/DocumentGovernanceWorkspace.js");
assert.match(workspace, /Repository Compliance/);
assert.match(workspace, /Refresh audit/);
assert.match(workspace, /No active naming exceptions/);
assert.match(workspace, /Legacy migration is closed/);
assert.match(workspace, /migrateActiveDocumentName/);

const service = read("src/services/documentGovernanceService.js");
assert.match(service, /syncOneDriveDocumentIndex/);
assert.match(service, /analyzeOfficialDocumentName/);
assert.match(service, /99_ARCHIVE/);
assert.match(service, /Suppliers_Sourcing\/_INTAKE/);
assert.match(service, /legacy_document_migration_queue/);

const namingPreview = read("src/services/activeDocumentNamingPreviewService.js");
assert.doesNotMatch(namingPreview, /LEGACY_SUPPLIER_CATALOG_APPROVED_DATE/);

process.stdout.write("Operational document governance workspace guard passed.\n");
