const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const sql = read("database/supplier-quotation-variant-splits.sql");
assert.match(sql, /supplier_quotation_line_variants/);
assert.match(sql, /supplier_product_variant_mappings/);
assert.match(sql, /set_supplier_quotation_line_variants/);
assert.match(sql, /match_status='SPLIT'/);
assert.match(sql, /Variant quantities must total the supplier line quantity/);
assert.match(sql, /supplier_variant text/);
assert.match(sql, /create_buying_draft_from_quotation/);

const repoFile = read("src/services/supplierQuotationRepository.js");
assert.match(repoFile, /setSupplierQuotationLineVariants/);
assert.match(repoFile, /supplier_quotation_line_variants/);

const workspace = read("src/components/SupplierQuotationWorkspace.js");
assert.match(workspace, /Split Supplier Line into Variants/);
assert.match(workspace, /Save Variant Split/);
assert.match(workspace, /BuyingSelectionRow/);
assert.match(workspace, /match_status==="SPLIT"/);

process.stdout.write("Supplier quotation variant split guard passed.\n");
