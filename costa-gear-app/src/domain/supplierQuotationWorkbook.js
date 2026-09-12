import * as XLSX from "xlsx";
import { ITEM_HEADERS, QUOTATION_HEADERS } from "./supplierQuotationImport";

const asValue = value => value === null || value === undefined ? "" : value;
const clean = value => value === null || value === undefined ? "" : String(value).trim();

function quotationRow({ supplierName, header }) {
  return [
    clean(supplierName || header?.supplierName),
    clean(header?.quoteRef),
    clean(header?.quoteDate),
    clean(header?.currency) || "USD",
    clean(header?.incoterm),
    clean(header?.shippingMethod),
    asValue(header?.shippingTotal),
    clean(header?.shippingCurrency) || clean(header?.currency) || "USD",
    asValue(header?.productSubtotal),
    asValue(header?.grandTotal),
    asValue(header?.transitTimeDays),
    asValue(header?.dispatchLeadTimeDays),
    clean(header?.packaging),
    clean(header?.paymentTerms),
    clean(header?.notes),
    clean(header?.validationStatus) || "AI EXTRACTED - REVIEW REQUIRED",
  ];
}

function itemRow(line, index) {
  return [
    line?.line || index + 1,
    clean(line?.supplierSku),
    clean(line?.description),
    clean(line?.unit),
    asValue(line?.quantity),
    asValue(line?.unitPrice),
    asValue(line?.supplierLineTotal),
    asValue(line?.calculatedLineTotal),
    clean(line?.lineValidation) || "AI EXTRACTED",
    clean(line?.notes),
    clean(line?.cgSku),
    clean(line?.matchStatus) || "UNMATCHED",
  ];
}

export function buildCostaGearSupplierQuotationWorkbook({
  supplierName,
  header,
  lines,
}) {
  const wb = XLSX.utils.book_new();

  const quotationSheet = XLSX.utils.aoa_to_sheet([
    QUOTATION_HEADERS,
    quotationRow({ supplierName, header }),
  ]);
  quotationSheet["!cols"] = [
    34, 22, 13, 10, 11, 18, 15, 16, 16, 14, 18, 24, 24, 24, 46, 26,
  ].map(wch => ({ wch }));

  const itemRows = (lines || []).map(itemRow);
  const itemsSheet = XLSX.utils.aoa_to_sheet([
    ITEM_HEADERS,
    ...itemRows,
  ]);
  itemsSheet["!cols"] = [
    8, 22, 54, 10, 9, 13, 18, 20, 18, 42, 16, 14,
  ].map(wch => ({ wch }));

  XLSX.utils.book_append_sheet(wb, quotationSheet, "Quotation");
  XLSX.utils.book_append_sheet(wb, itemsSheet, "Items");

  return wb;
}

export function buildCostaGearSupplierQuotationFile({
  supplierName,
  header,
  lines,
  fileName = "Costa_Gear_Supplier_Quotation_Import.xlsx",
}) {
  const wb = buildCostaGearSupplierQuotationWorkbook({ supplierName, header, lines });
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new File(
    [bytes],
    fileName,
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );
}
