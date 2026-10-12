const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const legacy = read("src/LegacyApp.js");
const pricing = read("src/domain/pricingIntelligence.js");
const intelligence = read("src/components/PricingIntelligenceWorkspace.js");

assert.match(legacy, /Pricing Strategy/);
assert.match(legacy, /Landed Cost Base/);
assert.match(legacy, /Gross Margin %/);
assert.match(legacy, /Margin Floor %/);
assert.match(legacy, /Cost linked/);
assert.match(legacy, /loadPricingData\(\)/);
assert.match(legacy, /buildPricingIntelligence\(data\)/);
assert.match(legacy, /calculateGrossMarginPct\(value, pricingContext\.unitCost\)/);
assert.match(legacy, /calculateSellPriceForMargin\(pricingContext\.unitCost, margin\)/);
assert.match(legacy, /Linked to Target Sell Price/);
assert.match(legacy, /Independent minimum used by Pricing Intelligence/);
assert.match(legacy, /No reliable landed cost is available yet/);

assert.match(pricing, /export function calculateGrossMarginPct/);
assert.match(pricing, /export function calculateSellPriceForMargin/);
assert.match(pricing, /Number\(price\) - Number\(cost\)/);
assert.match(pricing, /Number\(cost\) \/ \(1 - margin \/ 100\)/);

assert.match(intelligence, /Margin Floor %/);
assert.match(intelligence, /independent minimum-margin guardrail/);
assert.doesNotMatch(intelligence, /"Target Margin %"/);

const cost = 13;
const price = 55.9;
const margin = (price - cost) / price * 100;
assert.ok(Math.abs(margin - 76.744186) < 0.0001);
const priceAt40 = cost / (1 - 40 / 100);
assert.ok(Math.abs(priceAt40 - 21.666667) < 0.0001);

process.stdout.write("Product pricing strategy guard passed.\n");
