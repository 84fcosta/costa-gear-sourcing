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

function digits(value) {
  const matches = String(value ?? "").match(/\d+/g);
  return matches ? matches.join("") : "";
}

function sequentialKey(family, value, width) {
  const numeric = digits(value);
  if (numeric) return family + numeric.padStart(width, "0").slice(-Math.max(width, numeric.length));
  return family + cleanDocumentNamePart(value, "Record", 20);
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
  let raw = String(value || "").trim();
  raw = raw.replace(/^CGQ[-_]?/i, "").replace(/^QUO[-_]?/i, "");
  const formal = raw.match(/^SUP[-_]?(\d+)[-_](\d{8})[-_](\d+)$/i);
  if (formal) {
    return "QUO" + String(Number(formal[1])).padStart(3, "0") + "-" + formal[2] + "-" + String(Number(formal[3])).padStart(2, "0");
  }
  const compact = raw.match(/^(\d+)[-_](\d{8})[-_](\d+)$/);
  if (compact) {
    return "QUO" + String(Number(compact[1])).padStart(3, "0") + "-" + compact[2] + "-" + String(Number(compact[3])).padStart(2, "0");
  }
  return "QUO" + cleanDocumentNamePart(raw, "Record", 40).replace(/^SUP[-_]?/i, "");
}

export function extensionFromFileName(fileName) {
  const match = String(fileName || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? "." + match[1].toLowerCase() : "";
}
