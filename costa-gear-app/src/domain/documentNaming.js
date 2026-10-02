export const DOCUMENT_NAMING_POLICY_VERSION = "2026.10.02";
export const DOCUMENT_RECORD_DIGITS = 4;

export const FORMAL_DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "ppt", "pptx",
]);

export const VISUAL_ASSET_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "heic", "heif",
]);

const SUPPLIER_NOISE = new Set([
  "auto", "automotive", "accessary", "accessories", "company", "co", "corp", "corporation",
  "danyang", "equipment", "factory", "guangzhou", "hainan", "inc", "information", "jiepai",
  "lechang", "limited", "ltd", "manufacturing", "manufacturer", "parts", "technology", "trading",
  "changzhou", "group",
]);

const NUMBERED_RECORD_FAMILIES = new Set(["SUP", "QUO", "PO", "EXP", "AST"]);
const FAMILY_CODES = new Set([
  "ADM", "AGR", "INS", "COM", "TAX", "BNK", "FIN", "REV", "RPT", "SOP", "TPL", "PRD",
]);

const DATE_PATTERN = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const VERSION_PATTERN = /^V\d{2}$/;

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

function trailingNumericId(value) {
  const raw = String(value ?? "").trim();
  if (/^\d+$/.test(raw)) return raw;
  return raw.match(/(?:^|[-_])(\d+)$/)?.[1] || "";
}

export function sequentialRecordKey(family, value, width = DOCUMENT_RECORD_DIGITS) {
  const normalizedFamily = String(family || "").trim().toUpperCase();
  if (!NUMBERED_RECORD_FAMILIES.has(normalizedFamily)) {
    throw new Error(`Unsupported sequential document family: ${normalizedFamily || "(blank)"}.`);
  }

  const raw = String(value ?? "").trim();
  const familyMatch = raw.match(new RegExp("^" + normalizedFamily + "[-_]?(\\d+)$", "i"));
  const numeric = familyMatch?.[1] || trailingNumericId(raw);
  if (!numeric) {
    throw new Error(`A numeric ${normalizedFamily} identifier is required for governed document naming.`);
  }
  return normalizedFamily + numeric.padStart(width, "0");
}

export function supplierRecordKey(value) {
  return sequentialRecordKey("SUP", value);
}

export function quotationRecordKey(value) {
  return sequentialRecordKey("QUO", value);
}

export function purchaseOrderRecordKey(value) {
  return sequentialRecordKey("PO", value);
}

export function expenseRecordKey(value) {
  return sequentialRecordKey("EXP", value);
}

export function assetRecordKey(value) {
  return sequentialRecordKey("AST", value);
}

export function extensionFromFileName(fileName) {
  const match = String(fileName || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? "." + match[1].toLowerCase() : "";
}

export function extensionToken(fileName) {
  return extensionFromFileName(fileName).replace(/^\./, "");
}

export function versionToken(value) {
  const numeric = trailingNumericId(value);
  if (!numeric) throw new Error("A numeric document version is required.");
  return "V" + numeric.padStart(2, "0");
}

function token(value, fallback = "", maxLength = 56) {
  if (value == null || String(value).trim() === "") return fallback;
  return cleanDocumentNamePart(value, fallback || "Document", maxLength);
}

export function composeDocumentName({
  recordKey,
  context = [],
  documentType = "",
  description = "",
  version = "",
  date = "",
  extension = "",
  requireDate = true,
}) {
  const parts = [token(recordKey, "Document", 48)];
  for (const item of context || []) {
    if (item != null && String(item).trim()) parts.push(token(item, "Context", 48));
  }
  if (documentType) parts.push(token(documentType, "Document", 48));
  if (description) parts.push(token(description, "Description", 72));
  if (version) parts.push(versionToken(version));
  if (requireDate) {
    if (!DATE_PATTERN.test(String(date || ""))) {
      throw new Error("A document date in YYYY-MM-DD format is required.");
    }
    parts.push(String(date));
  } else if (date) {
    if (!DATE_PATTERN.test(String(date))) throw new Error("Document date must use YYYY-MM-DD.");
    parts.push(String(date));
  }
  const ext = String(extension || "").replace(/^\./, "").toLowerCase();
  return parts.join("_") + (ext ? "." + ext : "");
}

export function familyDocumentName({
  family,
  context = [],
  documentType = "",
  description = "",
  version = "",
  date = "",
  extension = "",
  requireDate = true,
}) {
  const code = String(family || "").trim().toUpperCase();
  if (!FAMILY_CODES.has(code)) throw new Error(`Unsupported document family: ${code || "(blank)"}.`);
  return composeDocumentName({
    recordKey: code,
    context,
    documentType,
    description,
    version,
    date,
    extension,
    requireDate,
  });
}

export function reportFileName({ report, period, generatedDate, extension = "xlsx" }) {
  return familyDocumentName({
    family: "RPT",
    context: [report, period],
    date: generatedDate,
    extension,
  });
}

export function sopFileName({ process, title, version, extension }) {
  return familyDocumentName({
    family: "SOP",
    context: [process, title],
    version,
    extension,
    requireDate: false,
  });
}

export function templateFileName({ process, name, version, extension }) {
  return familyDocumentName({
    family: "TPL",
    context: [process, name],
    version,
    extension,
    requireDate: false,
  });
}

export function isFormalDocumentFile(fileName) {
  return FORMAL_DOCUMENT_EXTENSIONS.has(extensionToken(fileName).toLowerCase());
}

export function isVisualAssetFile(fileName) {
  return VISUAL_ASSET_EXTENSIONS.has(extensionToken(fileName).toLowerCase());
}

export function analyzeOfficialDocumentName(fileName) {
  if (!isFormalDocumentFile(fileName)) {
    return { typeCode: null, compliant: null, issue: null };
  }

  const extension = extensionFromFileName(fileName);
  const base = extension ? String(fileName).slice(0, -extension.length) : String(fileName || "");
  const parts = base.split("_").filter(Boolean);
  const first = parts[0] || "";

  if (/^CG$/i.test(first)) {
    return { typeCode: parts[1] || null, compliant: false, issue: "Redundant CG prefix" };
  }

  if (/^(SUP|QUO|PO|EXP|AST)_?\d+$/i.test(first)) {
    const match = first.toUpperCase().match(/^(SUP|QUO|PO|EXP|AST)_?(\d+)$/);
    const family = match?.[1] || null;
    const digits = match?.[2] || "";
    if (first.includes("_")) return { typeCode: family, compliant: false, issue: "Record family and ID must be one token" };
    if (digits.length !== DOCUMENT_RECORD_DIGITS) {
      return { typeCode: family, compliant: false, issue: `Sequential record IDs must use ${DOCUMENT_RECORD_DIGITS} digits` };
    }
  } else if (!FAMILY_CODES.has(first.toUpperCase()) && !/^(SALE|SHP)-/i.test(first)) {
    return { typeCode: first || null, compliant: false, issue: "Unknown or missing document family" };
  }

  if (/\s/.test(base)) {
    return { typeCode: first, compliant: false, issue: "Use underscores instead of spaces" };
  }

  if (parts.some(part => /^(FINAL|FINAL\d+|COPY|REVISED)$/i.test(part))) {
    return { typeCode: first, compliant: false, issue: "Use V01, V02... instead of FINAL/COPY/REVISED" };
  }

  const versions = parts.filter(part => /^V\d+$/i.test(part));
  if (versions.some(part => !VERSION_PATTERN.test(part.toUpperCase()))) {
    return { typeCode: first, compliant: false, issue: "Version must use two digits, e.g. V01" };
  }

  const family = (first.match(/^[A-Z]+/)?.[0] || first).toUpperCase();
  const requiresDate = !["SOP", "TPL"].includes(family);
  const dateIndexes = parts.map((part, index) => DATE_PATTERN.test(part) ? index : -1).filter(index => index >= 0);

  if (requiresDate) {
    if (!DATE_PATTERN.test(parts[parts.length - 1] || "")) {
      return { typeCode: family, compliant: false, issue: "Document date must be the final filename element" };
    }
    if (dateIndexes.length !== 1) {
      return { typeCode: family, compliant: false, issue: "Use one document date only" };
    }
  } else {
    if (dateIndexes.length) {
      return { typeCode: family, compliant: false, issue: "SOP and template names use version control instead of a filename date" };
    }
    if (!VERSION_PATTERN.test((parts[parts.length - 1] || "").toUpperCase())) {
      return { typeCode: family, compliant: false, issue: "SOP and template names must end with V01, V02..." };
    }
  }

  return { typeCode: family, compliant: true, issue: null };
}
