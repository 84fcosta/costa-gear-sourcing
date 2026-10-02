const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const service = read("src/services/activeDocumentNamingPreviewService.js");
assert.match(service, /row\.proposal_state !== "ready"/);
assert.match(service, /ensureNoTargetCollision/);
assert.match(service, /analyzeOfficialDocumentName\(row\.proposed_name\)/);
assert.match(service, /automatic rollback also failed/);
assert.match(service, /moveOneDriveItem\(\{[\s\S]*newName: row\.source_name/);
assert.match(service, /migrateAllReadyActiveDocumentNames/);
assert.match(service, /deleteOrphanActivePurchaseDocument/);
assert.match(service, /assertOrphanDocumentStillSafe/);
assert.match(service, /Deleted as unlinked legacy purchase-order document/);

const ui = read("src/components/LegacyMigrationWorkspace.js");
assert.match(ui, /namingMigration: true/);
assert.match(ui, /Rename reviewed/);
assert.match(ui, /Needs review.*remain blocked/);
assert.match(ui, /Delete orphan/);
assert.match(ui, /deleteOrphanActivePurchaseDocument/);

process.stdout.write("Active document naming migration guard passed.\n");
