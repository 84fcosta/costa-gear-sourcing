process.env.TZ = "America/Vancouver";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const helperPath = path.join(__dirname, "..", "src", "domain", "appDate.js");
const helperCode = fs.readFileSync(helperPath, "utf8");
const dashboard = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "OperationalDashboard.js"),
  "utf8"
);
const performance = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "performanceAnalytics.js"),
  "utf8"
);
const salesWorkspace = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "SalesWorkspace.js"),
  "utf8"
);
const mobileSalesWorkspace = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "MobileSalesWorkspace.js"),
  "utf8"
);
const mobileQuickSale = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "MobileQuickSale.js"),
  "utf8"
);

(async () => {
  const api = await import("data:text/javascript;base64," + Buffer.from(helperCode).toString("base64"));

  const oct1 = api.parseAppDate("2026-10-01");
  const sep1 = api.parseAppDate("2026-09-01");
  assert.strictEqual(oct1.getFullYear(), 2026);
  assert.strictEqual(oct1.getMonth(), 9);
  assert.strictEqual(oct1.getDate(), 1);
  assert.strictEqual(sep1.getMonth(), 8);
  assert.strictEqual(sep1.getDate(), 1);

  // 2026-10-18T03:30Z is still Oct 17 in Vancouver. Sales defaults must use
  // the local calendar day instead of slicing the UTC ISO timestamp.
  const eveningVancouver = new Date("2026-10-18T03:30:00Z");
  assert.strictEqual(api.localDateInputValue(eveningVancouver), "2026-10-17");

  // Reproduce the Costa Gear sales history that exposed the bug.
  const sales = [
    ["2026-08-25", 430],
    ["2026-09-01", 250],
    ["2026-09-06", 50],
    ["2026-09-21", 80],
    ["2026-10-01", 45],
  ];
  const byMonth = {};
  for (const [soldDate, revenue] of sales) {
    const d = api.parseAppDate(soldDate);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    byMonth[key] = (byMonth[key] || 0) + revenue;
  }
  assert.deepStrictEqual(byMonth, {
    "2026-08": 430,
    "2026-09": 380,
    "2026-10": 45,
  });

  assert.match(dashboard, /parseAppDate\(orderDate\(order\)\)/);
  assert.doesNotMatch(dashboard, /new Date\(orderDate\(order\)\)/);
  assert.match(performance, /return parseAppDate\(value\)/);
  for (const source of [salesWorkspace, mobileSalesWorkspace, mobileQuickSale]) {
    assert.match(source, /localDateInputValue/);
    assert.doesNotMatch(source, /toISOString\(\)\.slice\(0,\s*10\)/);
  }

  process.stdout.write("Dashboard and Sales local-date regression test passed.\n");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
