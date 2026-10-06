const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const source = read("src/domain/structuredFitmentFilter.js")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ")
  + "\nmodule.exports={UNIVERSAL_FITMENT_CODE,buildProductFitmentMap,productMatchesStructuredFitment,productMatchesYearSearch,vehicleModelOptions,modelYearOptions};";

const sandbox = { module: { exports: {} }, exports: {}, Date };
vm.runInNewContext(source, sandbox);
const {
  buildProductFitmentMap,
  productMatchesStructuredFitment,
  productMatchesYearSearch,
  modelYearOptions,
} = sandbox.module.exports;

const vehicles = [
  { code:"WRANGLER_JL_2D", display_name:"Wrangler JL 2-Door", model_year_start:2018, model_year_end:null, sort_order:30, active:true },
  { code:"WRANGLER_JK_2D", display_name:"Wrangler JK 2-Door", model_year_start:2007, model_year_end:2018, sort_order:10, active:true },
  { code:"UNIVERSAL", display_name:"Universal", model_year_start:null, model_year_end:null, sort_order:90, active:true },
];

const rows = [
  { product_id:"ongoing", fitment_code:"WRANGLER_JL_2D", year_from:2018, year_to:null },
  { product_id:"ended", fitment_code:"WRANGLER_JK_2D", year_from:2007, year_to:2018 },
  { product_id:"universal", fitment_code:"UNIVERSAL", year_from:null, year_to:null },
];

const map = buildProductFitmentMap(rows, vehicles, 2026);
assert.strictEqual(productMatchesYearSearch(map.get("ongoing"), "2025"), true, "2018+ must match 2025");
assert.strictEqual(productMatchesYearSearch(map.get("ended"), "2025"), false, "2007-2018 must not match 2025");
assert.strictEqual(productMatchesYearSearch(map.get("universal"), "2025"), true, "Universal must match any model year");
assert.strictEqual(productMatchesYearSearch(map.get("ongoing"), "25"), false, "Only full model years are year searches");
assert.strictEqual(productMatchesStructuredFitment(map.get("universal"), "WRANGLER_JL_2D", "2025"), true, "Universal applies to a selected vehicle/year");
assert.strictEqual(productMatchesStructuredFitment(map.get("universal"), "UNIVERSAL", ""), true, "Universal filter must find Universal products");
assert.deepStrictEqual(Array.from(modelYearOptions(vehicles, "UNIVERSAL", 2026)), [], "Universal must not expose year selectors");
assert.deepStrictEqual(Array.from(modelYearOptions(vehicles, "WRANGLER_JL_2D", 2026)).slice(-3), [2025,2026,2027], "Ongoing model horizon must include next model year");

const mobileCatalog = read("src/components/MobileProductCatalog.js");
assert.match(mobileCatalog, /productMatchesYearSearch/);
assert.match(mobileCatalog, /product_fitments/);
assert.match(mobileCatalog, /vehicle_fitments/);

const desktopControls = read("src/components/DesktopProductMasterControls.js");
assert.match(desktopControls, /productMatchesYearSearch/);

const mobileMaster = read("src/components/MobileProductMaster.js");
assert.match(mobileMaster, /productMatchesYearSearch/);

const legacy = read("src/LegacyApp.js");
assert.match(legacy, /fitment\.code === "UNIVERSAL"/);
assert.match(legacy, /Universal does not require years/);

const quotation = read("src/components/SupplierQuotationWorkspace.js");
assert.match(quotation, /f\.code==="UNIVERSAL"/);
assert.match(quotation, /Universal does not require years/);

const sql = read("database/structured-fitment-universal-and-search.sql");
assert.match(sql, /'UNIVERSAL'/);
assert.match(sql, /if v_code='UNIVERSAL'/);
assert.match(sql, /CG-AW-01/);
assert.match(sql, /CG-TB-01/);

process.stdout.write("Structured fitment year search and Universal guard passed.\n");
