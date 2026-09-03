import * as XLSX from "xlsx";

export const EXPENSE_CATEGORIES = [
  "Software & Subscriptions",
  "Website & Hosting",
  "Office Supplies",
  "Equipment (CCA)",
  "Advertising & Marketing",
  "Business Registration & Fees",
  "Professional Services",
  "Banking & Financial Fees",
  "Communication (Internet/Phone)",
  "Home Office",
  "Travel & Meals",
  "Inventory / Product Samples",
  "Other",
];

export const PAYMENT_METHODS = [
  "Credit Card",
  "Debit Card",
  "Bank Transfer",
  "Cash",
  "PayPal",
  "Other",
];

export const CCA_CLASSES = [
  { classCode: "Class 8", rate: 20, label: "Furniture, fixtures, some tools and general equipment" },
  { classCode: "Class 10", rate: 30, label: "Vehicles and some automotive equipment" },
  { classCode: "Class 12", rate: 100, label: "Small tools, software and some low-cost assets" },
  { classCode: "Class 50", rate: 55, label: "Computer hardware and systems software" },
  { classCode: "Class 53", rate: 50, label: "Manufacturing and processing equipment" },
  { classCode: "Custom", rate: 0, label: "Manual rate" },
];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function makeEmptyExpense(year = new Date().getFullYear()) {
  return {
    expense_date: today(),
    vendor: "",
    description: "",
    category: "Software & Subscriptions",
    total_amount: "",
    business_use_pct: 100,
    payment_method: "Credit Card",
    payment_reference: "",
    receipt_status: "Missing",
    notes: "",
    tax_year: year,
    is_asset_purchase: false,
    linked_asset_id: null,
    tax_ready: false,
  };
}

export function makeEmptyAsset(year = new Date().getFullYear()) {
  return {
    asset_code: "",
    asset_name: "",
    purchase_date: today(),
    vendor: "",
    cost: "",
    cca_class: "Class 50",
    cca_rate: 55,
    business_use_pct: 100,
    notes: "",
    tax_year: year,
    status: "Active",
    linked_expense_id: null,
  };
}

export function money(value) {
  return Number(value || 0).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}

export function pct(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

export function calcDeductible(total, businessPct) {
  const amount = Number(total || 0);
  const use = Number(businessPct || 0) / 100;
  return Number((amount * use).toFixed(2));
}

export function calcBusinessCost(cost, businessPct) {
  return calcDeductible(cost, businessPct);
}

export function calcEstimatedCca(asset) {
  const businessCost = calcBusinessCost(asset?.cost, asset?.business_use_pct);
  const rate = Number(asset?.cca_rate || 0) / 100;
  return Number((businessCost * rate * 0.5).toFixed(2));
}

export function documentUrl(document) {
  return document?.onedrive_web_url || document?.legacy_url || null;
}

export function documentsForExpense(documents, expenseId) {
  return (documents || []).filter((document) => document.expense_id === expenseId);
}

export function documentsForAsset(documents, assetId) {
  return (documents || []).filter((document) => document.asset_id === assetId);
}

function firstDocumentLink(documents, predicate) {
  const document = (documents || []).find(predicate);
  return documentUrl(document) || "";
}

function workbookSheet(rows, columns) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = columns.map((wch) => ({ wch }));
  return sheet;
}

function downloadWorkbook(workbook, filename) {
  XLSX.writeFile(workbook, filename);
}

export function exportExpenses(expenses, documents, year) {
  const rows = expenses.map((expense) => ({
    Date: expense.expense_date,
    Vendor: expense.vendor,
    Description: expense.description,
    Category: expense.category,
    "Total CAD": Number(expense.total_amount || 0),
    "Business Use %": Number(expense.business_use_pct || 0),
    "Deductible CAD": calcDeductible(expense.total_amount, expense.business_use_pct),
    "Payment Method": expense.payment_method,
    "Payment Reference": expense.payment_reference,
    "Receipt Status": expense.receipt_status,
    "Receipt Link": firstDocumentLink(documents, (document) => document.expense_id === expense.id),
    "Asset Purchase": expense.is_asset_purchase ? "Yes" : "No",
    "Tax Ready": expense.tax_ready ? "Yes" : "No",
    Notes: expense.notes,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    workbookSheet(rows, [12, 28, 36, 26, 12, 14, 14, 18, 18, 16, 42, 14, 12, 42]),
    "Expenses"
  );
  downloadWorkbook(workbook, `Costa_Gear_Expenses_${year}_${today()}.xlsx`);
}

export function exportAssets(assets, documents, year) {
  const rows = assets.map((asset) => ({
    "Asset ID": asset.asset_code,
    "Asset Name": asset.asset_name,
    "Purchase Date": asset.purchase_date,
    Vendor: asset.vendor,
    "Cost CAD": Number(asset.cost || 0),
    "CCA Class": asset.cca_class,
    "CCA Rate %": Number(asset.cca_rate || 0),
    "Business Use %": Number(asset.business_use_pct || 0),
    "Business Cost CAD": calcBusinessCost(asset.cost, asset.business_use_pct),
    "Estimated First-Year CCA CAD": calcEstimatedCca(asset),
    Status: asset.status,
    "Receipt Link": firstDocumentLink(documents, (document) => document.asset_id === asset.id),
    Notes: asset.notes,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    workbookSheet(rows, [13, 32, 14, 26, 12, 12, 12, 14, 16, 24, 12, 42, 42]),
    "Assets CCA"
  );
  downloadWorkbook(workbook, `Costa_Gear_Assets_CCA_${year}_${today()}.xlsx`);
}

export function exportTaxReport(expenses, assets, documents, year) {
  const regularExpenses = expenses.filter((expense) => !expense.is_asset_purchase);
  const categoryRows = EXPENSE_CATEGORIES.map((category) => {
    const items = regularExpenses.filter((expense) => expense.category === category);
    return {
      Category: category,
      "Total CAD": items.reduce((sum, expense) => sum + Number(expense.total_amount || 0), 0),
      "Deductible CAD": items.reduce(
        (sum, expense) => sum + calcDeductible(expense.total_amount, expense.business_use_pct),
        0
      ),
    };
  }).filter((row) => row["Total CAD"] || row["Deductible CAD"]);

  const expenseRows = expenses.map((expense) => ({
    Date: expense.expense_date,
    Vendor: expense.vendor,
    Description: expense.description,
    Category: expense.category,
    "Total CAD": Number(expense.total_amount || 0),
    "Business Use %": Number(expense.business_use_pct || 0),
    "Deductible CAD": calcDeductible(expense.total_amount, expense.business_use_pct),
    "Payment Method": expense.payment_method,
    "Receipt Status": expense.receipt_status,
    "Receipt Link": firstDocumentLink(documents, (document) => document.expense_id === expense.id),
    "Asset Purchase": expense.is_asset_purchase ? "Yes" : "No",
    "Tax Ready": expense.tax_ready ? "Yes" : "No",
    Notes: expense.notes,
  }));

  const assetRows = assets.map((asset) => ({
    "Asset ID": asset.asset_code,
    "Asset Name": asset.asset_name,
    "Purchase Date": asset.purchase_date,
    Vendor: asset.vendor,
    "Cost CAD": Number(asset.cost || 0),
    "CCA Class": asset.cca_class,
    "CCA Rate %": Number(asset.cca_rate || 0),
    "Business Use %": Number(asset.business_use_pct || 0),
    "Business Cost CAD": calcBusinessCost(asset.cost, asset.business_use_pct),
    "Estimated First-Year CCA CAD": calcEstimatedCca(asset),
    Status: asset.status,
    "Receipt Link": firstDocumentLink(documents, (document) => document.asset_id === asset.id),
    Notes: asset.notes,
  }));

  const regularDeductible = regularExpenses.reduce(
    (sum, expense) => sum + calcDeductible(expense.total_amount, expense.business_use_pct),
    0
  );
  const estimatedCca = assets.reduce((sum, asset) => sum + calcEstimatedCca(asset), 0);
  const totals = [
    { Metric: "Total expenses entered", "Amount CAD": expenses.reduce((sum, expense) => sum + Number(expense.total_amount || 0), 0) },
    { Metric: "Deductible regular expenses, excluding asset purchases", "Amount CAD": regularDeductible },
    { Metric: "Asset purchases", "Amount CAD": assets.reduce((sum, asset) => sum + Number(asset.cost || 0), 0) },
    { Metric: "Estimated first-year CCA claim", "Amount CAD": estimatedCca },
    { Metric: "Estimated tax deduction total", "Amount CAD": regularDeductible + estimatedCca },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, workbookSheet(totals, [56, 18]), "Tax Summary");
  XLSX.utils.book_append_sheet(workbook, workbookSheet(categoryRows, [34, 14, 16]), "By Category");
  XLSX.utils.book_append_sheet(
    workbook,
    workbookSheet(expenseRows, [12, 28, 36, 26, 12, 14, 14, 18, 16, 42, 14, 12, 42]),
    "Expense Details"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    workbookSheet(assetRows, [13, 32, 14, 26, 12, 12, 12, 14, 16, 24, 12, 42, 42]),
    "Assets CCA"
  );

  downloadWorkbook(workbook, `Costa_Gear_Tax_Report_${year}_${today()}.xlsx`);
}
