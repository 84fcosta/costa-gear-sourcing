const SUPPLIER_NOISE = new Set([
  "auto", "automotive", "accessary", "accessories", "company", "co", "corp", "corporation",
  "danyang", "equipment", "factory", "guangzhou", "hainan", "inc", "information", "jiepai",
  "lechang", "limited", "ltd", "manufacturing", "manufacturer", "parts", "technology", "trading",
  "changzhou", "group",
]);

export function supplierShortName(name) {
  const tokens = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[A-Za-z0-9]+/g) || [];
  const meaningful = tokens.filter(token => !SUPPLIER_NOISE.has(token.toLowerCase()));
  const selected = (meaningful.length ? meaningful : tokens).slice(0, 2);
  const joined = selected.map(token => token.replace(/[^A-Za-z0-9]+/g, "")).filter(Boolean).join("");
  return joined || "Supplier";
}

export function cleanDocumentNamePart(value, fallback = "Document", maxLength = 56) {
  const cleaned = String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " And ")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return cleaned || fallback;
}

function sequentialKey(family, value, width) {
  const raw = String(value ?? "").trim();
  const withoutFamily = raw.replace(new RegExp("^" + family + "[-_]?", "i"), "");
  const numeric =
    (/^\d+$/.test(withoutFamily) ? withoutFamily : "") ||
    raw.match(/(?:^|[-_])(\d+)$/)?.[1] ||
    "";
  if (numeric) return family + numeric.padStart(width, "0");
  const cleaned = cleanDocumentNamePart(withoutFamily || raw, "Record", 20);
  return family + cleaned;
}

export function supplierRecordKey(value) {
  return sequentialKey("SUP", value, 3);
}

export function purchaseOrderRecordKey(value) {
  return sequentialKey("PO", value, 3);
}

export function expenseRecordKey(value) {
  return sequentialKey("EXP", value, 4);
}

export function assetRecordKey(value) {
  return sequentialKey("AST", value, 3);
}

export function quotationRecordKey(value) {
  return sequentialKey("QUO", value, 3);
}

export function extensionFromFileName(fileName) {
  const match = String(fileName || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? "." + match[1].toLowerCase() : "";
}
