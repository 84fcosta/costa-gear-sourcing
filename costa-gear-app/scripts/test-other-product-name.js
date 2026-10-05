const assert = require("assert");
const fs = require("fs");
const path = require("path");

const sql = fs.readFileSync(
  path.join(__dirname, "..", "database", "hide-other-from-product-auto-name.sql"),
  "utf8"
);

assert.match(sql, /lower\(trim\(coalesce\(p_product_type,''\)\)\) = 'other'/);
assert.match(sql, /then null/);
assert.match(sql, /update public\.products/);
assert.match(sql, /where lower\(trim\(product_type\)\)='other'/);

process.stdout.write("Other Product Type naming guard passed.\n");
