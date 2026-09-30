const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspace = fs.readFileSync(path.join(__dirname, "..", "src", "components", "ShipmentAllocationWorkspace.js"), "utf8");
const repository = fs.readFileSync(path.join(__dirname, "..", "src", "services", "shipmentRepository.js"), "utf8");

assert.match(workspace, /await updateShipment\(selectedId,\s*\{/);
assert.match(workspace, /await applyShipmentFreight\(selectedId\)/);
assert.match(workspace, /setItems\(await listShipmentItems\(selectedId\)\)/);
assert.doesNotMatch(workspace, /await persist\(\)/);
assert.doesNotMatch(workspace, /applyAllocationToQuotes/);
assert.doesNotMatch(workspace, /updateShipmentItem/);
assert.doesNotMatch(workspace, /landed cost refreshed/);

const addStart = repository.indexOf("export async function addShipmentItem");
const addEnd = repository.indexOf("export async function updateShipmentItem");
const updateEnd = repository.indexOf("export async function deleteShipmentItem");
const addItem = repository.slice(addStart, addEnd);
const updateItem = repository.slice(addEnd, updateEnd);
assert(addStart > 0 && addEnd > addStart && updateEnd > addEnd);
assert.doesNotMatch(addItem, /notes:/, "shipment_items has no notes column for INSERT");
assert.doesNotMatch(updateItem, /row\.notes/, "shipment_items has no notes column for UPDATE");
assert.match(repository, /export async function applyShipmentFreight/);
assert.match(repository, /supabase\.rpc\("apply_shipment_freight"/);
assert.match(repository, /export async function updateShipment\(id,record\)/);
assert.match(repository, /if\("notes" in record\)row\.notes=record\.notes\|\|null/, "Shipment header notes must remain supported");
console.log("Shipment freight single-write and schema guard passed.");
