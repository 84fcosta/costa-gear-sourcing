import * as XLSX from "xlsx";

const QUOTATION_HEADERS = [
  "Supplier Name","Supplier Quote Ref","Quote Date","Currency","Incoterm","Shipping Method",
  "Shipping Total","Shipping Currency","Product Subtotal","Grand Total","Transit Time Days",
  "Dispatch Lead Time Days","Packaging","Payment Terms","Notes","Validation Status",
];

const ITEM_HEADERS = [
  "Line","Supplier SKU","Supplier Description","Unit","Qty","Unit Price","Supplier Line Total",
  "Calculated Line Total","Line Validation","Original Notes","CG SKU","Match Status",
];

const requiredQuotation = ["Supplier Quote Ref", "Currency"];
const requiredItems = ["Line", "Supplier Description", "Qty", "Unit Price"];

const clean = value => value === null || value === undefined ? "" : String(value).trim();
const numeric = value => {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : "";
};

function findHeaderRow(rows, expected) {
  return rows.findIndex(row => expected.every(header => row.some(cell => clean(cell) === header)));
}

function rowObject(headers, row) {
  return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]));
}

function assertColumns(headers, required, sheetName) {
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`${sheetName} sheet is missing required columns: ${missing.join(", ")}. Use the official Costa Gear template.`);
}

function excelDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
  }
  const text = clean(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0,10);
}

export async function parseCostaGearSupplierQuotation(file) {
  if (!file) throw new Error("Choose a Costa Gear quotation XLSX file.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const qSheet = workbook.Sheets.Quotation;
  const iSheet = workbook.Sheets.Items;
  if (!qSheet || !iSheet) throw new Error("The workbook must contain the Quotation and Items sheets from the official Costa Gear template.");

  const qRows = XLSX.utils.sheet_to_json(qSheet, { header: 1, defval: "", raw: true });
  const iRows = XLSX.utils.sheet_to_json(iSheet, { header: 1, defval: "", raw: true });
  const qHeaderIndex = findHeaderRow(qRows, ["Supplier Name", "Supplier Quote Ref"]);
  const iHeaderIndex = findHeaderRow(iRows, ["Line", "Supplier SKU", "Supplier Description"]);
  if (qHeaderIndex < 0 || iHeaderIndex < 0) throw new Error("This file does not match the Costa Gear Supplier Quote Import Template.");

  const qHeaders = qRows[qHeaderIndex].map(clean);
  const iHeaders = iRows[iHeaderIndex].map(clean);
  assertColumns(qHeaders, requiredQuotation, "Quotation");
  assertColumns(iHeaders, requiredItems, "Items");

  const qDataRow = qRows.slice(qHeaderIndex + 1).find(row => row.some(cell => clean(cell) !== ""));
  if (!qDataRow) throw new Error("The Quotation sheet does not contain a quotation row.");
  const q = rowObject(qHeaders, qDataRow);

  const lineRows = iRows.slice(iHeaderIndex + 1)
    .filter(row => row.some(cell => clean(cell) !== ""))
    .map(row => rowObject(iHeaders, row))
    .filter(row => clean(row["Line"]) !== "" || clean(row["Supplier SKU"]) !== "" || clean(row["Supplier Description"]) !== "");

  if (!lineRows.length) throw new Error("The Items sheet contains no quotation lines.");

  const header = {
    supplierName: clean(q["Supplier Name"]),
    quoteRef: clean(q["Supplier Quote Ref"]),
    quoteDate: excelDate(q["Quote Date"]),
    currency: clean(q["Currency"]) || "USD",
    incoterm: clean(q["Incoterm"]),
    shippingMethod: clean(q["Shipping Method"]),
    shippingTotal: numeric(q["Shipping Total"]),
    shippingCurrency: clean(q["Shipping Currency"]) || clean(q["Currency"]) || "USD",
    productSubtotal: numeric(q["Product Subtotal"]),
    grandTotal: numeric(q["Grand Total"]),
    transitTimeDays: numeric(q["Transit Time Days"]),
    dispatchLeadTimeDays: numeric(q["Dispatch Lead Time Days"]),
    packaging: clean(q["Packaging"]),
    paymentTerms: clean(q["Payment Terms"]),
    notes: clean(q["Notes"]),
    validationStatus: clean(q["Validation Status"]) || "NOT CHECKED",
  };

  const lines = lineRows.map((row, index) => ({
    line: numeric(row["Line"]) || index + 1,
    supplierSku: clean(row["Supplier SKU"]),
    description: clean(row["Supplier Description"]),
    unit: clean(row["Unit"]),
    quantity: numeric(row["Qty"]),
    unitPrice: numeric(row["Unit Price"]),
    supplierLineTotal: numeric(row["Supplier Line Total"]),
    calculatedLineTotal: numeric(row["Calculated Line Total"]),
    lineValidation: clean(row["Line Validation"]) || "NOT CHECKED",
    notes: clean(row["Original Notes"]),
    cgSku: clean(row["CG SKU"]),
    matchStatus: clean(row["Match Status"]) || "UNMATCHED",
  }));

  const invalid = lines.filter(l => !l.quantity || l.unitPrice === "" || l.unitPrice < 0);
  if (invalid.length) throw new Error(`${invalid.length} line(s) have missing/invalid Qty or Unit Price. Review the formatted workbook before importing.`);

  const unexpectedQ = qHeaders.filter(h => h && !QUOTATION_HEADERS.includes(h));
  const unexpectedI = iHeaders.filter(h => h && !ITEM_HEADERS.includes(h));
  return { header, lines, warnings: [...unexpectedQ.map(h => `Unexpected Quotation column: ${h}`), ...unexpectedI.map(h => `Unexpected Items column: ${h}`)] };
}
