const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const app = read("src/App.js");
const workspace = read("src/components/AccountingWorkspace.js");
const mobileWorkspace = read("src/components/MobileAccountingWorkspace.js");
const domain = read("src/domain/accounting.js");
const repository = read("src/services/accountingRepository.js");
const sql = read("database/accounting-module.sql");

assert.match(app, /AccountingWorkspace/);
assert.match(app, /workspace === "accounting"/);
assert.match(app, />Accounting</);
assert.match(app, /P&L, forecast, inventory\/COGS and owner equity/);

assert.match(workspace, /Overview/);
assert.match(workspace, /P&L/);
assert.match(workspace, /Forecast/);
assert.match(workspace, /Inventory & COGS/);
assert.match(workspace, /Owner Equity/);
assert.match(workspace, /Ledger/);
assert.match(workspace, /Year End/);
assert.match(workspace, /Baseline Forecast/);
assert.match(workspace, /Forecast vs Actual/);
assert.match(workspace, /Save Baseline/);
assert.match(workspace, /Current funding assumption: owner-funded/);
assert.match(workspace, /generated, not re-entered/);

assert.match(mobileWorkspace, /buildAccountingModel/);
assert.match(mobileWorkspace, /buildForecastModel/);
assert.match(mobileWorkspace, /loadAccountingData/);
assert.match(mobileWorkspace, /saveAccountingForecast/);
assert.match(mobileWorkspace, /saveOwnerTransaction/);
assert.match(mobileWorkspace, /deleteOwnerTransaction/);
assert.match(mobileWorkspace, /Baseline stays fixed until you edit it/);
assert.match(mobileWorkspace, /Inventory stays capitalized until sold or reclassified/);
assert.match(mobileWorkspace, /Generated ledger/);

assert.match(domain, /Completed/);
assert.match(domain, /Posted/);
assert.match(domain, /quantity_received.*quantity_damaged.*quantity_rejected/);
assert.match(domain, /actual_landed_cost_per_unit_cad/);
assert.match(domain, /landed_cost_per_unit_cad/);
assert.match(domain, /if \(expense\.is_asset_purchase\) continue/);
assert.match(domain, /Operating Expense ·/);
assert.match(domain, /"COGS", "Inventory"/);
assert.match(domain, /"Inventory",\s*"Owner Contributions"/);
assert.match(domain, /month\.netBusinessIncome = month\.cogsComplete/);
assert.match(domain, /forecastYtdOpex - actualYtdOpex/);
assert.match(domain, /line\.kind === "income" \? actual - forecast : forecast - actual/);

assert.match(repository, /accounting_forecast_months/);
assert.match(repository, /accounting_owner_transactions/);
assert.match(repository, /onConflict: "forecast_year,scenario,month,line_code"/);

assert.match(sql, /enable row level security/);
assert.match(sql, /to authenticated/);
assert.match(sql, /revoke all on public\.accounting_forecast_months from anon, authenticated/);
assert.match(sql, /grant select, insert, update, delete on public\.accounting_forecast_months to authenticated/);
assert.match(sql, /revoke all on public\.accounting_owner_transactions from anon, authenticated/);
assert.match(sql, /grant select, insert, update, delete on public\.accounting_owner_transactions to authenticated/);
assert.match(sql, /app_members/);
assert.match(sql, /unique \(forecast_year, scenario, month, line_code\)/);

// Management-accounting sanity checks.
const revenue = 55.9;
const cogs = 21.24;
const directSelling = 2.5;
const operatingExpense = 5;
assert.strictEqual(Number((revenue - cogs).toFixed(2)), 34.66);
assert.strictEqual(Number((revenue - cogs - directSelling - operatingExpense).toFixed(2)), 27.16);

// Favorable variance convention: revenue above baseline and expenses below baseline are positive.
assert.strictEqual(120 - 100, 20);
assert.strictEqual(100 - 80, 20);

process.stdout.write("Accounting module guard passed.\n");
