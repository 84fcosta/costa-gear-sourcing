const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const migration = read("database/inventory-disposition-accounting.sql");
const domain = read("src/domain/inventoryDisposition.js");
const analytics = read("src/domain/performanceAnalytics.js");
const accounting = read("src/domain/accounting.js");
const dialog = read("src/components/InventoryDispositionDialog.js");
const desktopInventory = read("src/components/ReceivingInventoryWorkspace.js");
const mobileInventory = read("src/components/MobileInventoryWorkspace.js");
const sales = read("src/components/SalesWorkspace.js");
const mobileSales = read("src/components/MobileSalesWorkspace.js");
const quickSale = read("src/components/MobileQuickSale.js");
const dashboardRepo = read("src/services/dashboardRepository.js");
const salesRepo = read("src/services/salesRepository.js");
const performanceRepo = read("src/services/performanceRepository.js");
const pricingRepo = read("src/services/pricingRepository.js");
const demandRepo = read("src/services/demandPlanningRepository.js");

assert.match(migration, /create table if not exists public\.inventory_dispositions/);
assert.match(migration, /create table if not exists public\.inventory_disposition_lines/);
assert.match(migration, /create or replace function public\.create_inventory_disposition/);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = public, pg_temp/);
assert.match(migration, /members read inventory dispositions/);
assert.match(migration, /members read inventory disposition lines/);
assert.match(migration, /revoke all on public\.inventory_dispositions from anon, authenticated/);
assert.match(migration, /grant select on public\.inventory_dispositions to authenticated/);
assert.match(migration, /grant execute on function public\.create_inventory_disposition/);
assert.match(migration, /Landed cost is missing for an inventory lot required by this adjustment/);
assert.match(migration, /Insufficient available inventory/);
assert.match(migration, /Damaged \/ lost inventory must use Inventory Write-off accounting/);

assert.match(domain, /Prototype \/ Internal Use/);
assert.match(domain, /Damaged \/ Unsellable/);
assert.match(domain, /Inventory Write-off/);
assert.match(domain, /Capital Asset/);
assert.match(domain, /summarizeDispositionUnits/);
assert.match(domain, /dispositionLineQuantityByReceiptItem/);

assert.match(dialog, /Review Adjustment/);
assert.match(dialog, /Post Adjustment/);
assert.match(dialog, /Permanent inventory event/);
assert.match(dialog, /No new Owner Contribution or cash movement is created/);
assert.match(dialog, /Adjustment History/);
assert.match(dialog, /Recovery \/ Supplier Credit CAD/);

assert.match(desktopInventory, /Adjust Stock/);
assert.match(mobileInventory, /Adjust Stock/);
assert.match(desktopInventory, /Internal Use/);
assert.match(mobileInventory, /Internal Use/);
assert.match(desktopInventory, /Damaged Write-off/);
assert.match(mobileInventory, /Damaged Adj\./);

assert.match(analytics, /inventoryDispositions/);
assert.match(analytics, /disposedByReceiptItem/);
assert.match(analytics, /metric\.physicalOnHand = Math\.max\(0, metric\.receivedUnits - metric\.completedUnits - metric\.dispositionUnits\)/);
assert.match(analytics, /totalDispositionUnits/);

assert.match(accounting, /Prototype \/ Product Development/);
assert.match(accounting, /Inventory Write-off \/ Loss/);
assert.match(accounting, /"Inventory Adjustment"/);
assert.match(accounting, /"Inventory Recovery"/);
assert.match(accounting, /month\.inventoryDispositionCost \+= totalCost/);
assert.match(accounting, /month\.prototypeExpense \+= netCost/);
assert.match(accounting, /month\.inventoryWriteoffExpense \+= netCost/);
assert.match(accounting, /damagedQty = Math\.max\(0, num\(item\.quantity_damaged\)\)/);
assert.match(accounting, /"Receiving Damage"/);
assert.match(accounting, /month\.receivingDamageExpense \+= damagedAmount/);
assert.match(accounting, /month\.derivedOwnerFunding \+= damagedAmount/);

for (const source of [sales, mobileSales, quickSale]) {
  assert.match(source, /inventoryDispositions/);
  assert.match(source, /disposedQty/);
  assert.match(source, /disposedCost/);
}

for (const source of [dashboardRepo, salesRepo, performanceRepo, pricingRepo, demandRepo]) {
  assert.match(source, /inventory_dispositions/);
  assert.match(source, /inventory_disposition_lines/);
}

assert.match(desktopInventory, /Receiving Damage/);
assert.match(mobileInventory, /Damage Recorded at Receiving/);
assert.doesNotMatch(migration, /insert into public\.inventory_dispositions \([^)]*CG-/s);

process.stdout.write("Inventory disposition and Accounting guard passed.\n");
