const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("src/domain/listFilterVisibility.js");
const context = {};
vm.runInNewContext(source.replace(/export function/g, "function") + "\nthis.visibility = { setRowFilterVisibility, clearRowFilterVisibility, isRowFilterVisible };", context);
const { setRowFilterVisibility, clearRowFilterVisibility, isRowFilterVisible } = context.visibility;
const row = () => {
  const attrs = new Map();
  return { style: { display: "grid" }, getAttribute: key => attrs.get(key) ?? null, hasAttribute: key => attrs.has(key), setAttribute: (key, val) => attrs.set(key, val), removeAttribute: key => attrs.delete(key) };
};
const rows = Array.from({length:59}, row);
rows.forEach((node, index) => setRowFilterVisibility(node, index < 4));
assert.equal(rows.filter(isRowFilterVisible).length, 4);
rows.forEach(node => { node.style.display = "grid"; });
assert.equal(rows.filter(isRowFilterVisible).length, 4, "Layout refresh must not clear filter visibility");
rows.forEach(clearRowFilterVisibility);
assert.equal(rows.filter(isRowFilterVisible).length, 59, "Clear must restore all rows");
assert.match(read("src/desktop-sourcing-overrides.css"), /\[data-cg-filter-hidden="true"\]\s*\{\s*display:\s*none\s*!important/);
for (const component of ["DesktopProductMasterControls", "DesktopProductSnapshotControls", "DesktopSupplierControls", "DesktopInventoryPositionControls"]) {
  const code = read("src/components/" + component + ".js");
  assert.match(code, /setRowFilterVisibility\(/);
  assert.match(code, /clearRowFilterVisibility/);
  assert.match(code, /characterData: true/);
  assert.doesNotMatch(code, /(?:card|row)\.style\.display\s*=/);
}
const legacy = read("src/LegacyApp.js");
assert.match(legacy, /loading && !hasLoaded/);
assert.match(legacy, /onMasterDataLoaded\?\.\(/);
const sourcing = read("src/components/SourcingWorkspace.js");
assert.match(sourcing, /onMasterDataLoaded=\{setMasterData\}/);
for (const component of ["DesktopProductMasterControls", "DesktopProductSnapshotControls"]) {
  assert.match(read("src/components/" + component + ".js"), /masterData\?\.products/);
}
console.log("List filter persistence and visibility regression test passed.");
