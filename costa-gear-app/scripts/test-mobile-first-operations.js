const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const app = read("src/App.js");
assert.match(app, /MobileDashboard/);
assert.match(app, /MobileProductCatalog/);
assert.match(app, /MobileQuickSale/);
assert.match(app, /MobileExpenseWorkspace/);
assert.match(app, />Home<\/span>/);
assert.match(app, />Products<\/span>/);
assert.match(app, />Sell<\/span>/);
assert.match(app, />Expenses<\/span>/);
assert.match(app, /Install Costa Gear/);

const mobileDashboard = read("src/components/MobileDashboard.js");
assert.match(mobileDashboard, /\["month", "Month"\]/);
assert.match(mobileDashboard, /\["3M", "3M"\]/);
assert.match(mobileDashboard, /\["6M", "6M"\]/);
assert.match(mobileDashboard, /\["YTD", "YTD"\]/);
assert.match(mobileDashboard, /\["All", "All"\]/);
assert.match(mobileDashboard, /Sales & Gross Profit/);
assert.match(mobileDashboard, /Previous month/);
assert.match(mobileDashboard, /Next month/);
assert.match(mobileDashboard, /Rolling 3-month view/);
assert.match(mobileDashboard, /end - 1/);
assert.match(mobileDashboard, /end \+ 1/);
assert.match(mobileDashboard, /Gross Margin/);

const products = read("src/components/MobileProductCatalog.js");
assert.match(products, /main_image_item_id/);
assert.match(products, /market_reference_cad/);
assert.match(products, /target_sell_price_cad/);
assert.match(products, /Landed Cost/);
assert.match(products, /Sell This Product/);
assert.match(products, /ProductLightbox/);
assert.match(products, /Tap to enlarge/);
assert.match(products, /Zoom in/);
assert.match(products, /Zoom out/);
assert.match(products, /Previous photo/);
assert.match(products, /Next photo/);
assert.match(products, /role="dialog"/);
assert.match(products, /Product A-Z/);
assert.match(products, /SKU A-Z/);
assert.match(products, /Stock: Low to High/);
assert.match(products, /Stock: High to Low/);
assert.match(products, /Recently Updated/);
assert.match(products, /searchRelevance/);
assert.match(products, /cg:mobile-products-sort/);
assert.match(products, /readCatalogSession\("cg:mobile-products-sort", "name"\)/);
assert.match(products, /query\.trim\(\) \? "Relevance" : "Sort"/);

const sale = read("src/components/MobileQuickSale.js");
assert.match(sale, /Complete Sale/);
assert.match(sale, /landed-cost|Landed Cost/i);
assert.match(sale, /status: "Completed"/);

const expense = read("src/components/MobileExpenseWorkspace.js");
assert.match(expense, /capture="environment"/);
assert.match(expense, /uploadBusinessDocument/);
assert.match(expense, /Save Expense/);

const manifest = JSON.parse(read("public/site.webmanifest"));
assert.strictEqual(manifest.display, "standalone");
assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);

const sw = read("public/sw.js");
assert.match(sw, /costa-gear-shell-v1/);

process.stdout.write("Mobile-first Costa Gear operations guard passed.\n");
