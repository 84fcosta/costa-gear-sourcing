const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const service = read("src/services/productTaxonomyService.js");
assert.match(service, /deleteProductType/);
assert.match(service, /delete_unused_product_type/);

const manager = read("src/components/ProductTaxonomyManager.js");
assert.match(manager, /removeProductType/);
assert.match(manager, /Delete unused Product Type/);
assert.match(manager, /<Trash2/);
assert.match(manager, /tab === "types"/);

const sql = read("database/delete-unused-product-types.sql");
assert.match(sql, /delete_unused_product_type/);
assert.match(sql, /Reassign those products before deleting it/);
assert.match(sql, /delete from public\.product_types/);

process.stdout.write("Unused Product Type delete guard passed.\n");
