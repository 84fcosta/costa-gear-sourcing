const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const drive = read("src/services/oneDriveAppFolderService.js");
assert.match(drive, /error\.status = response\.status/);
assert.match(drive, /error\.code = body\?\.error\?\.code/);
assert.match(drive, /error\?\.status === 404/);
assert.match(drive, /error\?\.code === "itemNotFound"/);
assert.match(drive, /alreadyMissing: true/);

const repository = read("src/services/expenseRepository.js");
assert.match(repository, /select\("id,expense_id,asset_id"\)/);
assert.match(repository, /receipt_status: "Missing"/);
assert.match(repository, /tax_ready: false/);

const workspace = read("src/components/ExpenseWorkspace.js");
assert.match(workspace, /The OneDrive file was already missing\. Stale attachment metadata was removed\./);

process.stdout.write("Expense stale attachment cleanup guard passed.\n");
