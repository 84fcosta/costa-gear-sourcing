const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspace = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "ReceivingInventoryWorkspace.js"),
  "utf8"
);

assert.match(workspace, /const persistDirtyLines=async\(\)=>/);
assert.match(workspace, /items\.filter\(i=>dirtyLineIds\.has\(i\.id\)\)/);
assert.match(workspace, /await updateReceiptItem\(i\.id/);
assert.match(workspace, /Post & Sync saves any pending row changes automatically before synchronizing/);

const saveStart = workspace.indexOf("const save=async()=>");
assert.ok(saveStart >= 0, "save handler is missing");

const saveBlock = workspace.slice(saveStart, workspace.indexOf("const updateLine=", saveStart));
const persistIndex = saveBlock.indexOf("await persistDirtyLines()");
const receiptIndex = saveBlock.indexOf("await updateReceipt(selectedId,form)");
const syncIndex = saveBlock.indexOf('if(form.status==="Posted")await syncStatuses()');

assert.ok(persistIndex >= 0, "Post & Sync must persist dirty receipt lines");
assert.ok(receiptIndex > persistIndex, "receipt header must save after dirty lines");
assert.ok(syncIndex > receiptIndex, "status synchronization must run after line and receipt saves");

process.stdout.write("Receiving Post & Sync pending-line save guard passed.\n");
