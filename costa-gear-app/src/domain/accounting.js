import { buildPerformanceAnalytics } from "./performanceAnalytics";
import { parseAppDate } from "./appDate";
import {
  EXPENSE_CATEGORIES,
  calcBusinessCost,
  calcDeductible,
  calcEstimatedCca,
} from "./expenseTracking";
import { dispositionCost, dispositionTypeMeta } from "./inventoryDisposition";

export const ACCOUNTING_SCENARIO = "Baseline";
export const MONTHS = [
  { number: 1, key: "jan", short: "Jan", label: "January" },
  { number: 2, key: "feb", short: "Feb", label: "February" },
  { number: 3, key: "mar", short: "Mar", label: "March" },
  { number: 4, key: "apr", short: "Apr", label: "April" },
  { number: 5, key: "may", short: "May", label: "May" },
  { number: 6, key: "jun", short: "Jun", label: "June" },
  { number: 7, key: "jul", short: "Jul", label: "July" },
  { number: 8, key: "aug", short: "Aug", label: "August" },
  { number: 9, key: "sep", short: "Sep", label: "September" },
  { number: 10, key: "oct", short: "Oct", label: "October" },
  { number: 11, key: "nov", short: "Nov", label: "November" },
  { number: 12, key: "dec", short: "Dec", label: "December" },
];

export const DISPOSITION_EXPENSE_CATEGORIES = [
  "Prototype / Product Development",
  "Inventory Write-off / Loss",
];

export const ACCOUNTING_EXPENSE_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...DISPOSITION_EXPENSE_CATEGORIES,
];

const OPERATING_EXPENSE_LINES = ACCOUNTING_EXPENSE_CATEGORIES.map(category => ({
  code: `expense:${category}`,
  label: category,
  group: "Operating Expenses",
  kind: "expense",
  category,
  forecastable: true,
}));

export const ACCOUNTING_FORECAST_LINES = [
  { code: "revenue", label: "Sales Revenue", group: "Income Statement", kind: "income", forecastable: true },
  { code: "cogs", label: "COGS", group: "Income Statement", kind: "expense", forecastable: true },
  { code: "direct_selling_costs", label: "Direct Selling Costs", group: "Income Statement", kind: "expense", forecastable: true },
  ...OPERATING_EXPENSE_LINES,
  { code: "inventory_purchases", label: "Inventory Purchases", group: "Cash & Capital Plan", kind: "cash", forecastable: true },
  { code: "capital_assets", label: "Capital Asset Purchases", group: "Cash & Capital Plan", kind: "cash", forecastable: true },
  { code: "owner_draws", label: "Owner Draws", group: "Cash & Capital Plan", kind: "cash", forecastable: true },
];

const COMPLETED = new Set(["Completed"]);
const POSTED = new Set(["Posted"]);

const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const num = value => finite(value) ? Number(value) : 0;
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function yearOf(value) {
  const date = parseAppDate(value);
  return date ? date.getFullYear() : null;
}

function monthOf(value) {
  const date = parseAppDate(value);
  return date ? date.getMonth() + 1 : null;
}

function blankMonth(month) {
  return {
    month,
    revenue: 0,
    cogs: 0,
    cogsComplete: true,
    missingCostUnits: 0,
    directSellingCosts: 0,
    operatingExpenses: 0,
    expensesByCategory: Object.fromEntries(ACCOUNTING_EXPENSE_CATEGORIES.map(category => [category, 0])),
    inventoryPurchases: 0,
    inventoryPurchaseCostComplete: true,
    inventoryDispositionCost: 0,
    receivingDamageExpense: 0,
    prototypeExpense: 0,
    inventoryWriteoffExpense: 0,
    capitalAssets: 0,
    manualOwnerContributions: 0,
    ownerDraws: 0,
    derivedOwnerFunding: 0,
    grossProfit: 0,
    netBusinessIncome: 0,
  };
}

function actualLineValue(month, line) {
  if (line.code === "revenue") return month.revenue;
  if (line.code === "cogs") return month.cogs;
  if (line.code === "direct_selling_costs") return month.directSellingCosts;
  if (line.code === "inventory_purchases") return month.inventoryPurchases;
  if (line.code === "capital_assets") return month.capitalAssets;
  if (line.code === "owner_draws") return month.ownerDraws;
  if (line.category) return month.expensesByCategory[line.category] || 0;
  return 0;
}

function ledgerEntry(date, source, description, debit, credit, amount, ref = "") {
  return {
    id: `${source}:${ref}:${date}:${debit}:${credit}`,
    date,
    source,
    reference: ref || "",
    description,
    debit,
    credit,
    amount: round2(amount),
  };
}

export function currentPeriodMonthCount(year, now = new Date()) {
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  return now.getMonth() + 1;
}

export function buildAccountingModel(data, year, now = new Date()) {
  const operational = data?.operational || {};
  const expenses = data?.expenses || [];
  const assets = data?.assets || [];
  const ownerTransactions = data?.ownerTransactions || [];
  const monthly = MONTHS.map(({ number }) => blankMonth(number));
  const monthMap = new Map(monthly.map(row => [row.month, row]));
  const ledger = [];

  const orderItems = new Map();
  for (const item of operational.salesOrderItems || []) {
    if (!orderItems.has(item.sales_order_id)) orderItems.set(item.sales_order_id, []);
    orderItems.get(item.sales_order_id).push(item);
  }

  for (const order of operational.salesOrders || []) {
    if (!COMPLETED.has(order.status)) continue;
    const dateValue = order.sold_date || order.created_at;
    if (yearOf(dateValue) !== Number(year)) continue;
    const month = monthMap.get(monthOf(dateValue));
    if (!month) continue;

    const lines = orderItems.get(order.id) || [];
    let revenue = 0;
    let cogs = 0;
    let missingUnits = 0;
    for (const line of lines) {
      const qty = Math.max(0, num(line.quantity));
      revenue += Math.max(0, num(line.unit_sell_price_cad) * qty - num(line.discount_cad));
      if (finite(line.unit_cost_cad)) cogs += Number(line.unit_cost_cad) * qty;
      else missingUnits += qty;
    }

    const sellingCosts = num(order.payment_fee_cad) + num(order.outbound_shipping_cad) + num(order.other_costs_cad);
    month.revenue += revenue;
    month.cogs += cogs;
    month.directSellingCosts += sellingCosts;
    if (missingUnits > 0) {
      month.cogsComplete = false;
      month.missingCostUnits += missingUnits;
    }

    const date = String(dateValue || "").slice(0, 10);
    if (revenue > 0) ledger.push(ledgerEntry(date, "Sale", order.sale_ref || "Completed sale", "Business Cash / Clearing", "Sales Revenue", revenue, order.sale_ref));
    if (cogs > 0) ledger.push(ledgerEntry(date, "Sale", `${order.sale_ref || "Sale"} cost of goods sold`, "COGS", "Inventory", cogs, order.sale_ref));
    if (sellingCosts > 0) ledger.push(ledgerEntry(date, "Sale", `${order.sale_ref || "Sale"} direct selling costs`, "Direct Selling Costs", "Business Cash / Clearing", sellingCosts, order.sale_ref));
  }

  for (const expense of expenses) {
    if (expense.is_asset_purchase) continue;
    const dateValue = expense.expense_date || expense.created_at;
    if (yearOf(dateValue) !== Number(year)) continue;
    const month = monthMap.get(monthOf(dateValue));
    if (!month) continue;
    const businessAmount = calcDeductible(expense.total_amount, expense.business_use_pct);
    month.operatingExpenses += businessAmount;
    if (!Object.prototype.hasOwnProperty.call(month.expensesByCategory, expense.category)) {
      month.expensesByCategory[expense.category] = 0;
    }
    month.expensesByCategory[expense.category] += businessAmount;
    month.derivedOwnerFunding += businessAmount;
    if (businessAmount > 0) {
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Expense",
        `${expense.vendor || "Expense"} · ${expense.description || expense.category}`,
        `Operating Expense · ${expense.category}`,
        "Owner Contributions",
        businessAmount,
        expense.expense_number ? `EXP${String(expense.expense_number).padStart(3, "0")}` : expense.id
      ));
    }
  }

  const assetExpenseIds = new Set(assets.map(asset => asset.linked_expense_id).filter(Boolean));
  for (const asset of assets) {
    const dateValue = asset.purchase_date || asset.created_at;
    if (yearOf(dateValue) !== Number(year)) continue;
    const month = monthMap.get(monthOf(dateValue));
    if (!month) continue;
    const businessCost = calcBusinessCost(asset.cost, asset.business_use_pct);
    month.capitalAssets += businessCost;
    month.derivedOwnerFunding += businessCost;
    if (businessCost > 0) {
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Asset",
        asset.asset_name || "Capital asset",
        "Capital Assets",
        "Owner Contributions",
        businessCost,
        asset.asset_code || asset.id
      ));
    }
  }

  const receiptMap = new Map((operational.receipts || []).map(receipt => [receipt.id, receipt]));
  const poItemMap = new Map((operational.purchaseOrderItems || []).map(item => [item.id, item]));

  for (const item of operational.receiptItems || []) {
    const receipt = receiptMap.get(item.receipt_id);
    if (!receipt || !POSTED.has(receipt.status)) continue;
    const dateValue = receipt.received_date || receipt.created_at || item.created_at;
    if (yearOf(dateValue) !== Number(year)) continue;
    const month = monthMap.get(monthOf(dateValue));
    if (!month) continue;

    const sellableQty = Math.max(0, num(item.quantity_received) - num(item.quantity_damaged) - num(item.quantity_rejected));
    const damagedQty = Math.max(0, num(item.quantity_damaged));
    const plannedCost = poItemMap.get(item.purchase_order_item_id)?.landed_cost_per_unit_cad;
    const unitCost = finite(item.actual_landed_cost_per_unit_cad)
      ? Number(item.actual_landed_cost_per_unit_cad)
      : finite(plannedCost) ? Number(plannedCost) : null;

    if ((sellableQty > 0 || damagedQty > 0) && unitCost === null) {
      month.inventoryPurchaseCostComplete = false;
      continue;
    }

    if (sellableQty > 0) {
      const amount = sellableQty * unitCost;
      month.inventoryPurchases += amount;
      month.derivedOwnerFunding += amount;
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Receiving",
        `${receipt.receipt_ref || "Posted receipt"} · ${sellableQty} sellable unit${sellableQty === 1 ? "" : "s"}`,
        "Inventory",
        "Owner Contributions",
        amount,
        receipt.receipt_ref || item.id
      ));
    }

    if (damagedQty > 0) {
      const damagedAmount = damagedQty * unitCost;
      const category = "Inventory Write-off / Loss";
      month.operatingExpenses += damagedAmount;
      month.receivingDamageExpense += damagedAmount;
      month.inventoryWriteoffExpense += damagedAmount;
      month.expensesByCategory[category] = (month.expensesByCategory[category] || 0) + damagedAmount;
      month.derivedOwnerFunding += damagedAmount;
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Receiving Damage",
        `${receipt.receipt_ref || "Posted receipt"} · ${damagedQty} damaged unit${damagedQty === 1 ? "" : "s"} recorded at receiving`,
        `Operating Expense · ${category}`,
        "Owner Contributions",
        damagedAmount,
        receipt.receipt_ref || item.id
      ));
    }
  }

  let dispositionCapitalAssetCount = 0;
  let dispositionCapitalAssetValue = 0;

  for (const disposition of operational.inventoryDispositions || []) {
    if (disposition.status !== "Posted") continue;
    const dateValue = disposition.disposition_date || disposition.created_at;
    if (yearOf(dateValue) !== Number(year)) continue;
    const month = monthMap.get(monthOf(dateValue));
    if (!month) continue;

    const totalCost = round2(dispositionCost(disposition));
    const recovery = Math.min(totalCost, Math.max(0, num(disposition.recovery_amount_cad)));
    const netCost = round2(totalCost - recovery);
    month.inventoryDispositionCost += totalCost;
    const ref = disposition.disposition_ref || disposition.id;
    const reason = dispositionTypeMeta(disposition.disposition_type).label;

    if (disposition.accounting_treatment === "expense_now") {
      const category = "Prototype / Product Development";
      month.operatingExpenses += netCost;
      month.prototypeExpense += netCost;
      month.expensesByCategory[category] = (month.expensesByCategory[category] || 0) + netCost;
      if (netCost > 0) {
        ledger.push(ledgerEntry(
          String(dateValue || "").slice(0, 10),
          "Inventory Adjustment",
          `${reason} · ${disposition.quantity} unit${Number(disposition.quantity) === 1 ? "" : "s"}`,
          `Operating Expense · ${category}`,
          "Inventory",
          netCost,
          ref
        ));
      }
    } else if (disposition.accounting_treatment === "capital_asset") {
      month.capitalAssets += totalCost;
      dispositionCapitalAssetCount += 1;
      dispositionCapitalAssetValue += totalCost;
      if (totalCost > 0) {
        ledger.push(ledgerEntry(
          String(dateValue || "").slice(0, 10),
          "Inventory Adjustment",
          `${reason} · reclassified to capital asset`,
          "Capital Assets",
          "Inventory",
          totalCost,
          ref
        ));
      }
    } else {
      const category = "Inventory Write-off / Loss";
      month.operatingExpenses += netCost;
      month.inventoryWriteoffExpense += netCost;
      month.expensesByCategory[category] = (month.expensesByCategory[category] || 0) + netCost;
      if (netCost > 0) {
        ledger.push(ledgerEntry(
          String(dateValue || "").slice(0, 10),
          "Inventory Adjustment",
          `${reason} · ${disposition.quantity} unit${Number(disposition.quantity) === 1 ? "" : "s"}`,
          `Operating Expense · ${category}`,
          "Inventory",
          netCost,
          ref
        ));
      }
    }

    if (recovery > 0) {
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Inventory Recovery",
        `${reason} · supplier / recovery value`,
        "Business Cash / Supplier Recovery",
        "Inventory",
        recovery,
        ref
      ));
    }
  }

  for (const transaction of ownerTransactions) {
    const dateValue = transaction.transaction_date || transaction.created_at;
    if (yearOf(dateValue) !== Number(year)) continue;
    const month = monthMap.get(monthOf(dateValue));
    if (!month) continue;
    const amount = num(transaction.amount_cad);
    if (transaction.transaction_type === "Contribution") {
      month.manualOwnerContributions += amount;
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Owner",
        transaction.description || "Additional owner contribution",
        "Business Cash / Clearing",
        "Owner Contributions",
        amount,
        transaction.id
      ));
    } else if (transaction.transaction_type === "Draw") {
      month.ownerDraws += amount;
      ledger.push(ledgerEntry(
        String(dateValue || "").slice(0, 10),
        "Owner",
        transaction.description || "Owner draw",
        "Owner Draw",
        "Business Cash / Clearing",
        amount,
        transaction.id
      ));
    }
  }

  monthly.forEach(month => {
    month.revenue = round2(month.revenue);
    month.cogs = round2(month.cogs);
    month.directSellingCosts = round2(month.directSellingCosts);
    month.operatingExpenses = round2(month.operatingExpenses);
    month.inventoryPurchases = round2(month.inventoryPurchases);
    month.inventoryDispositionCost = round2(month.inventoryDispositionCost);
    month.receivingDamageExpense = round2(month.receivingDamageExpense);
    month.prototypeExpense = round2(month.prototypeExpense);
    month.inventoryWriteoffExpense = round2(month.inventoryWriteoffExpense);
    month.capitalAssets = round2(month.capitalAssets);
    month.manualOwnerContributions = round2(month.manualOwnerContributions);
    month.ownerDraws = round2(month.ownerDraws);
    month.derivedOwnerFunding = round2(month.derivedOwnerFunding);
    month.grossProfit = month.cogsComplete ? round2(month.revenue - month.cogs) : null;
    month.netBusinessIncome = month.cogsComplete
      ? round2(month.revenue - month.cogs - month.directSellingCosts - month.operatingExpenses)
      : null;
    Object.keys(month.expensesByCategory).forEach(category => {
      month.expensesByCategory[category] = round2(month.expensesByCategory[category]);
    });
  });

  const performance = buildPerformanceAnalytics(operational, now);
  const sum = key => round2(monthly.reduce((total, row) => total + num(row[key]), 0));
  const allSalesCosted = monthly.every(row => row.cogsComplete);
  const grossProfit = allSalesCosted ? round2(sum("revenue") - sum("cogs")) : null;
  const netBusinessIncome = allSalesCosted
    ? round2(sum("revenue") - sum("cogs") - sum("directSellingCosts") - sum("operatingExpenses"))
    : null;
  const derivedOwnerFunding = sum("derivedOwnerFunding");
  const manualOwnerContributions = sum("manualOwnerContributions");
  const ownerDraws = sum("ownerDraws");
  const ownerEquityMovement = netBusinessIncome === null
    ? null
    : round2(derivedOwnerFunding + manualOwnerContributions + netBusinessIncome - ownerDraws);

  const expenseCategoryTotals = Object.fromEntries(ACCOUNTING_EXPENSE_CATEGORIES.map(category => [
    category,
    round2(monthly.reduce((total, row) => total + num(row.expensesByCategory[category]), 0)),
  ]));

  const taxReadyExpenses = expenses.filter(expense => !expense.is_asset_purchase && expense.tax_ready).length;
  const regularExpenses = expenses.filter(expense => !expense.is_asset_purchase);
  const missingReceiptExpenses = regularExpenses.filter(expense => expense.receipt_status !== "Saved").length;
  const estimatedCca = round2(assets.reduce((total, asset) => total + calcEstimatedCca(asset), 0));

  ledger.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.source).localeCompare(String(a.source)));

  return {
    year: Number(year),
    monthly,
    ledger,
    performance,
    summary: {
      revenue: sum("revenue"),
      cogs: sum("cogs"),
      directSellingCosts: sum("directSellingCosts"),
      grossProfit,
      operatingExpenses: sum("operatingExpenses"),
      netBusinessIncome,
      inventoryPurchases: sum("inventoryPurchases"),
      inventoryDispositionCost: sum("inventoryDispositionCost"),
      receivingDamageExpense: sum("receivingDamageExpense"),
      prototypeExpense: sum("prototypeExpense"),
      inventoryWriteoffExpense: sum("inventoryWriteoffExpense"),
      capitalAssets: sum("capitalAssets"),
      inventoryValue: round2(performance.summary.totalInventoryValueCad || 0),
      availableUnits: Number(performance.summary.totalAvailableUnits || 0),
      uncostedInventoryUnits: Number(performance.summary.totalUncostedUnits || 0),
      allSalesCosted,
      missingSalesCostUnits: monthly.reduce((total, row) => total + Number(row.missingCostUnits || 0), 0),
      derivedOwnerFunding,
      manualOwnerContributions,
      ownerDraws,
      ownerEquityMovement,
      regularExpenseCount: regularExpenses.length,
      taxReadyExpenses,
      missingReceiptExpenses,
      assetCount: assets.length + dispositionCapitalAssetCount,
      dispositionCapitalAssetCount,
      dispositionCapitalAssetValue: round2(dispositionCapitalAssetValue),
      estimatedCca,
    },
    expenseCategoryTotals,
    ownerTransactions,
    assets,
    expenses,
    assetExpenseIds,
  };
}

export function buildForecastModel(actualModel, forecastRecords = [], year, now = new Date()) {
  const forecastMap = new Map(
    (forecastRecords || []).map(row => [`${row.line_code}:${row.month}`, Number(row.amount_cad || 0)])
  );
  const monthCount = currentPeriodMonthCount(Number(year), now);
  const rows = ACCOUNTING_FORECAST_LINES.map(line => {
    const months = MONTHS.map(month => {
      const forecast = round2(forecastMap.get(`${line.code}:${month.number}`) || 0);
      const actual = round2(actualLineValue(actualModel.monthly[month.number - 1], line));
      const inActualPeriod = month.number <= monthCount;
      const variance = inActualPeriod
        ? round2(line.kind === "income" ? actual - forecast : forecast - actual)
        : null;
      return { ...month, forecast, actual, variance, inActualPeriod };
    });
    return {
      ...line,
      months,
      annualForecast: round2(months.reduce((sum, month) => sum + month.forecast, 0)),
      actualYtd: round2(months.filter(month => month.inActualPeriod).reduce((sum, month) => sum + month.actual, 0)),
      forecastYtd: round2(months.filter(month => month.inActualPeriod).reduce((sum, month) => sum + month.forecast, 0)),
    };
  }).map(row => ({
    ...row,
    varianceYtd: round2(row.kind === "income" ? row.actualYtd - row.forecastYtd : row.forecastYtd - row.actualYtd),
  }));

  const rowByCode = new Map(rows.map(row => [row.code, row]));
  const operatingExpenseRows = rows.filter(row => row.group === "Operating Expenses");
  const annualForecastRevenue = rowByCode.get("revenue")?.annualForecast || 0;
  const annualForecastCogs = rowByCode.get("cogs")?.annualForecast || 0;
  const annualForecastSelling = rowByCode.get("direct_selling_costs")?.annualForecast || 0;
  const annualForecastOpex = round2(operatingExpenseRows.reduce((sum, row) => sum + row.annualForecast, 0));
  const annualForecastNetIncome = round2(annualForecastRevenue - annualForecastCogs - annualForecastSelling - annualForecastOpex);

  const forecastYtdRevenue = rowByCode.get("revenue")?.forecastYtd || 0;
  const forecastYtdCogs = rowByCode.get("cogs")?.forecastYtd || 0;
  const forecastYtdSelling = rowByCode.get("direct_selling_costs")?.forecastYtd || 0;
  const forecastYtdOpex = round2(operatingExpenseRows.reduce((sum, row) => sum + row.forecastYtd, 0));
  const forecastYtdNetIncome = round2(forecastYtdRevenue - forecastYtdCogs - forecastYtdSelling - forecastYtdOpex);

  const actualYtdRevenue = rowByCode.get("revenue")?.actualYtd || 0;
  const actualYtdCogs = rowByCode.get("cogs")?.actualYtd || 0;
  const actualYtdSelling = rowByCode.get("direct_selling_costs")?.actualYtd || 0;
  const actualYtdOpex = round2(operatingExpenseRows.reduce((sum, row) => sum + row.actualYtd, 0));
  const actualYtdNetIncome = actualModel.summary.allSalesCosted
    ? round2(actualYtdRevenue - actualYtdCogs - actualYtdSelling - actualYtdOpex)
    : null;

  const monthlyExpenseComparison = MONTHS.map(month => {
    const forecast = round2(operatingExpenseRows.reduce((sum, row) => sum + row.months[month.number - 1].forecast, 0));
    const actual = round2(operatingExpenseRows.reduce((sum, row) => sum + row.months[month.number - 1].actual, 0));
    return { ...month, forecast, actual, inActualPeriod: month.number <= monthCount };
  });

  return {
    year: Number(year),
    monthCount,
    rows,
    rowByCode,
    operatingExpenseRows,
    monthlyExpenseComparison,
    summary: {
      annualForecastRevenue,
      annualForecastCogs,
      annualForecastSelling,
      annualForecastOpex,
      annualForecastNetIncome,
      forecastYtdRevenue,
      forecastYtdCogs,
      forecastYtdSelling,
      forecastYtdOpex,
      forecastYtdNetIncome,
      actualYtdRevenue,
      actualYtdCogs,
      actualYtdSelling,
      actualYtdOpex,
      actualYtdNetIncome,
      opexVarianceYtd: round2(forecastYtdOpex - actualYtdOpex),
      netIncomeVarianceYtd: actualYtdNetIncome === null ? null : round2(actualYtdNetIncome - forecastYtdNetIncome),
    },
  };
}

export function forecastRecordsFromDraft(year, draft, scenario = ACCOUNTING_SCENARIO) {
  const records = [];
  ACCOUNTING_FORECAST_LINES.forEach(line => {
    MONTHS.forEach(month => {
      records.push({
        forecast_year: Number(year),
        scenario,
        month: month.number,
        line_code: line.code,
        amount_cad: Math.max(0, Number(draft?.[line.code]?.[month.number] || 0)),
      });
    });
  });
  return records;
}

export function forecastDraftFromRecords(records = []) {
  const draft = {};
  ACCOUNTING_FORECAST_LINES.forEach(line => {
    draft[line.code] = {};
    MONTHS.forEach(month => {
      draft[line.code][month.number] = "";
    });
  });
  records.forEach(record => {
    if (!draft[record.line_code]) draft[record.line_code] = {};
    draft[record.line_code][Number(record.month)] = Number(record.amount_cad || 0) === 0 ? "" : String(record.amount_cad);
  });
  return draft;
}
