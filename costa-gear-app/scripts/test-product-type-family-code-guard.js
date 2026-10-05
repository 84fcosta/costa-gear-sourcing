const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const service = read("src/services/productTaxonomyService.js");
assert.match(service, /cleanFamilyCode/);
assert.match(service, /\.eq\("family_code", cleanFamilyCode\)/);
assert.match(service, /already assigned to Product Type/);

const sql = read("database/guard-product-type-family-code.sql");
assert.match(sql, /trg_product_types_guard_family_code/);
assert.match(sql, /guard_product_type_family_code/);
assert.match(sql, /Family Code % is already assigned to Product Type/);
assert.match(sql, /Door Hinge Step/);
assert.match(sql, /CG-HS-01/);
assert.doesNotMatch(sql, /unique\s+\([^)]*family_code/i);

process.stdout.write("Product Type family-code guard passed.\n");
