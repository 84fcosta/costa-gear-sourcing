const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const app = read("src/App.js");
assert.match(app, /window\.history\.pushState/);
assert.match(app, /MOBILE_MAIN_WORKSPACES/);
assert.match(app, /\["dashboard", "products", "sell", "expenses"\]/);
assert.match(app, /depth: workspace === "dashboard".*\? 0 : 1/);
assert.match(app, /topLevelDestination/);
assert.match(app, /resolved\.nextWorkspace === "dashboard" \? 0 : 1/);
assert.match(app, /currentDepth > targetDepth/);
assert.match(app, /window\.history\.go\(targetDepth - currentDepth\)/);
assert.match(app, /pendingMainNavigationRef/);
assert.match(app, /currentDepth === targetDepth/);
assert.match(app, /window\.history\.replaceState\(nextState/);
assert.match(app, /window\.history\.replaceState/);
assert.match(app, /addEventListener\("popstate"/);
assert.match(app, /scrollRestoration = "manual"/);
assert.match(app, /openMobileOverlay/);
assert.match(app, /closeMobileOverlay/);
assert.match(app, /mobileBack/);
assert.match(app, /overlay\?\.type === "more"/);
assert.match(app, /replaceOverlayEntry/);
assert.match(app, /context: nextContext/);
assert.match(app, /scrollY: window\.scrollY/);
assert.match(app, /depth: currentDepth \+ 1/);
assert.match(app, /topLevel: false/);
assert.match(app, /onOpenOverlay=\{openMobileOverlay\}/);
assert.match(app, /onCloseOverlay=\{closeMobileOverlay\}/);
assert.match(app, /onBack=\{mobileBack\}/);

const products = read("src/components/MobileProductCatalog.js");
assert.match(products, /mobileOverlay\?\.type === "product-sort"/);
assert.match(products, /mobileOverlay\?\.type === "product-photo"/);
assert.match(products, /onOpenOverlay\?\.\("product-photo"/);
assert.match(products, /onOpenOverlay\?\.\("product-sort"/);
assert.match(products, /onNavigate\?\.\("products", \{ productId \}\)/);
assert.match(products, /cg:mobile-products-query/);
assert.match(products, /cg:mobile-products-filter/);
assert.match(products, /cg:mobile-products-sort/);
assert.match(products, /cg:mobile-products-scroll/);
assert.doesNotMatch(products, /setSelectedId/);
assert.doesNotMatch(products, /setLightboxIndex/);

process.stdout.write("Mobile Android back-navigation guard passed.\n");
