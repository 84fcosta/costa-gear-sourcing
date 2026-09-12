import { supabase } from "../supabase";
import {
  cleanOneDriveNamePart,
  deleteOneDriveItem,
  ensureOneDriveFolderPath,
  getOneDriveItemContentHashes,
  listOneDriveChildren,
  uploadFileToOneDriveFolder,
} from "./oneDriveAppFolderService";

export const SUPPLIER_DOCUMENT_TYPES = [
  { value: "CATALOG", label: "Catalog" },
  { value: "PRICE_LIST", label: "Price List" },
  { value: "TECHNICAL", label: "Technical Document" },
  { value: "OTHER_SOURCING", label: "Other Sourcing Document" },
];

export const QUOTATION_DOCUMENT_TYPES = [
  { value: "QUOTATION_SOURCE", label: "Supplier Original" },
  { value: "QUOTATION_IMPORT", label: "Costa Gear Import File" },
];

const SUPPLIER_ROOT_PATH = ["02_PRODUCTS", "Suppliers_Sourcing"];
const SUPPLIER_ROOT_INDEX_PATH = "COSTA GEAR/02_PRODUCTS/Suppliers_Sourcing";

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : "";
}

function baseName(name) {
  const extension = extensionFromName(name);
  return extension ? String(name).slice(0, -(extension.length + 1)) : String(name || "");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizedSupplierPrefix(supId) {
  return String(supId || "").trim().toLowerCase() + "_";
}

function supplierShortNameFromFolder(folderName, supId) {
  const prefix = String(supId || "") + "_";
  const name = String(folderName || "");
  return name.toLowerCase().startsWith(prefix.toLowerCase()) ? name.slice(prefix.length) : name;
}

export function suggestSupplierFolderShortName(supplierName) {
  const generic = new Set([
    "auto", "automotive", "accessory", "accessories", "part", "parts", "manufacturing",
    "manufacturer", "technology", "technologies", "equipment", "factory", "company",
    "co", "ltd", "limited", "inc", "incorporated", "corp", "corporation", "group",
  ]);
  const source = String(supplierName || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  const tokens = source.split(/\s+/).filter(Boolean).filter(token => !generic.has(token.toLowerCase()));
  const chosen = (tokens.length ? tokens.slice(0, 3) : ["Supplier"]).join("");
  return cleanOneDriveNamePart(chosen, "Supplier", 36).replace(/_/g, "");
}

async function loadSupplier(supplierId) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,sup_id,name,status")
    .eq("id", supplierId)
    .single();
  if (error) throw error;
  return data;
}

async function loadQuotation(quotationId) {
  if (!quotationId) return null;
  const { data, error } = await supabase
    .from("supplier_quotations")
    .select("id,supplier_id,quote_ref,supplier_quote_ref,quote_date,created_at")
    .eq("id", quotationId)
    .single();
  if (error) throw error;
  return data;
}

async function persistFolderLink(folder, supplier) {
  const now = new Date().toISOString();
  const row = {
    item_id: folder.id,
    parent_item_id: folder?.parentReference?.id || null,
    name: folder.name,
    path: `${SUPPLIER_ROOT_INDEX_PATH}/${folder.name}`,
    is_folder: true,
    extension: null,
    mime_type: null,
    size_bytes: Number(folder?.size || 0),
    web_url: folder?.webUrl || null,
    etag: folder?.eTag || null,
    created_datetime: folder?.createdDateTime || null,
    modified_datetime: folder?.lastModifiedDateTime || null,
    type_code: null,
    naming_compliant: null,
    naming_issue: null,
    linked_entity_type: "supplier",
    linked_entity_id: supplier.id,
    last_seen_at: now,
    is_deleted: false,
    indexed_at: now,
  };
  const { error } = await supabase.from("onedrive_items").upsert(row, { onConflict: "item_id" });
  if (error) throw error;
}

async function locateSupplierFolder(supplier) {
  const sourcingRoot = await ensureOneDriveFolderPath(SUPPLIER_ROOT_PATH);
  const children = await listOneDriveChildren(sourcingRoot.id);
  const prefix = normalizedSupplierPrefix(supplier.sup_id);
  const matches = children.filter(
    item => item?.folder && String(item.name || "").toLowerCase().startsWith(prefix)
  );

  if (matches.length > 1) {
    throw new Error(
      `More than one active OneDrive folder starts with ${supplier.sup_id}. Resolve the duplicate folders before uploading documents.`
    );
  }

  return { sourcingRoot, folder: matches[0] || null };
}

export async function getSupplierSourcingFolderStatus(supplierId) {
  const supplier = await loadSupplier(supplierId);
  const { folder } = await locateSupplierFolder(supplier);
  if (folder) {
    await persistFolderLink(folder, supplier);
    return {
      supplier,
      exists: true,
      folder,
      folderName: folder.name,
      shortName: supplierShortNameFromFolder(folder.name, supplier.sup_id),
      willCreate: false,
    };
  }

  const shortName = suggestSupplierFolderShortName(supplier.name);
  return {
    supplier,
    exists: false,
    folder: null,
    folderName: `${supplier.sup_id}_${shortName}`,
    shortName,
    willCreate: true,
  };
}

export async function resolveSupplierSourcingFolder(supplierId) {
  const status = await getSupplierSourcingFolderStatus(supplierId);
  if (status.folder) return status;

  const folder = await ensureOneDriveFolderPath([...SUPPLIER_ROOT_PATH, status.folderName]);
  await persistFolderLink(folder, status.supplier);
  return { ...status, exists: true, willCreate: true, folder };
}

function documentTypeSuffix(documentType) {
  if (documentType === "CATALOG") return "Catalog";
  if (documentType === "PRICE_LIST") return "Price_List";
  if (documentType === "TECHNICAL") return "Technical";
  if (documentType === "OTHER_SOURCING") return "Sourcing_Document";
  return "Document";
}

function appendSuffixIfMissing(description, suffix) {
  const normalized = String(description || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const normalizedSuffix = String(suffix || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized.includes(normalizedSuffix) ? description : `${description}_${suffix}`;
}

export function governedSupplierDocumentName({
  fileName,
  supplier,
  folderName,
  documentType,
  quotation = null,
  description = "",
  documentDate = null,
}) {
  const extension = extensionFromName(fileName);
  const ext = extension ? `.${extension}` : "";
  const shortName = cleanOneDriveNamePart(
    supplierShortNameFromFolder(folderName, supplier.sup_id),
    "Supplier",
    36
  );
  const supplierKey = cleanOneDriveNamePart(supplier.sup_id, "Supplier", 20);

  if (documentType === "QUOTATION_SOURCE" || documentType === "QUOTATION_IMPORT") {
    if (!quotation?.quote_ref) throw new Error("The quotation must have a Costa Gear reference before documents can be stored.");
    const quoteKey = cleanOneDriveNamePart(quotation.quote_ref, "Quotation", 48);
    const role = documentType === "QUOTATION_SOURCE" ? "Supplier_Source" : "Costa_Gear_Import";
    const date = cleanOneDriveNamePart(documentDate || quotation.quote_date || today(), today(), 10);
    return `CG_QUO_${quoteKey}_${shortName}_${role}_${date}${ext}`;
  }

  const rawDescription = String(description || baseName(fileName) || "Supplier_Document").trim();
  const suffix = documentTypeSuffix(documentType);
  const withSuffix = appendSuffixIfMissing(rawDescription, suffix);
  const desc = cleanOneDriveNamePart(withSuffix, suffix, 72);
  const datePart = documentDate ? `_${cleanOneDriveNamePart(documentDate, today(), 10)}` : "";
  return `CG_SUP_${supplierKey}_${shortName}_${desc}${datePart}${ext}`;
}

async function sha1Base64(file) {
  if (!file?.arrayBuffer || !globalThis.crypto?.subtle) return null;
  try {
    const bytes = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-1", bytes);
    const values = Array.from(new Uint8Array(digest));
    const binary = values.map(value => String.fromCharCode(value)).join("");
    return globalThis.btoa(binary);
  } catch (_) {
    return null;
  }
}

export async function listSupplierDocuments({ supplierId, quotationId = null } = {}) {
  if (!supplierId) return [];
  let query = supabase
    .from("supplier_documents")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  if (quotationId) query = query.eq("quotation_id", quotationId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function findQuotationRoleDocument(quotationId, documentType) {
  if (!quotationId || !["QUOTATION_SOURCE", "QUOTATION_IMPORT"].includes(documentType)) return null;
  const { data, error } = await supabase
    .from("supplier_documents")
    .select("*")
    .eq("quotation_id", quotationId)
    .eq("document_type", documentType)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function indexedDuplicateByHash(supplierId, sha1Hash) {
  if (!sha1Hash) return null;
  const { data, error } = await supabase
    .from("supplier_documents")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("sha1_hash", sha1Hash)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function indexedOneDriveDuplicateByHash(folderName, sha1Hash) {
  if (!sha1Hash || !folderName) return null;
  const { data, error } = await supabase
    .from("onedrive_items")
    .select("item_id,name,path,web_url,sha1_hash")
    .eq("is_folder", false)
    .eq("is_deleted", false)
    .eq("sha1_hash", sha1Hash)
    .like("path", `${SUPPLIER_ROOT_INDEX_PATH}/${folderName}/%`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function indexUploadedFile({ upload, folder, supplier, quotation, documentType, sha1Hash }) {
  const now = new Date().toISOString();
  const typeCode = documentType.startsWith("QUOTATION_") ? "QUO" : "SUP";
  const row = {
    item_id: upload.itemId,
    parent_item_id: upload.parentItemId || folder.id,
    name: upload.fileName,
    path: `${SUPPLIER_ROOT_INDEX_PATH}/${folder.name}/${upload.fileName}`,
    is_folder: false,
    extension: extensionFromName(upload.fileName) || null,
    mime_type: upload.mimeType || null,
    size_bytes: upload.sizeBytes || 0,
    web_url: upload.webUrl || null,
    etag: upload.eTag || null,
    created_datetime: upload.createdDateTime || null,
    modified_datetime: upload.modifiedDateTime || null,
    type_code: typeCode,
    naming_compliant: true,
    naming_issue: null,
    linked_entity_type: quotation ? "supplier_quotation" : "supplier",
    linked_entity_id: quotation?.id || supplier.id,
    last_seen_at: now,
    is_deleted: false,
    indexed_at: now,
    sha1_hash: sha1Hash || null,
  };
  const { error } = await supabase.from("onedrive_items").upsert(row, { onConflict: "item_id" });
  if (error) throw error;
}

export async function uploadSupplierDocument({
  file,
  supplierId,
  quotationId = null,
  documentType,
  description = "",
  documentDate = null,
  replace = false,
}) {
  if (!file) throw new Error("Choose a file before uploading.");
  if (!supplierId) throw new Error("Select an existing Costa Gear supplier before uploading.");
  if (!documentType) throw new Error("Select a document type before uploading.");

  const [folderStatus, quotation] = await Promise.all([
    resolveSupplierSourcingFolder(supplierId),
    loadQuotation(quotationId),
  ]);
  const { supplier, folder } = folderStatus;

  if (quotation && quotation.supplier_id !== supplier.id) {
    throw new Error("The quotation does not belong to the selected supplier.");
  }

  const existingRole = await findQuotationRoleDocument(quotationId, documentType);
  const localSha1 = await sha1Base64(file);
  const [duplicate, indexedFileDuplicate] = await Promise.all([
    indexedDuplicateByHash(supplier.id, localSha1),
    indexedOneDriveDuplicateByHash(folder.name, localSha1),
  ]);

  if (duplicate && duplicate.id !== existingRole?.id) {
    const error = new Error(`This exact file is already registered as ${duplicate.file_name}.`);
    error.code = "DUPLICATE_SUPPLIER_DOCUMENT";
    error.existingDocument = duplicate;
    throw error;
  }

  if (
    indexedFileDuplicate &&
    indexedFileDuplicate.item_id !== existingRole?.onedrive_item_id
  ) {
    const error = new Error(
      `This exact file already exists in ${folder.name} as ${indexedFileDuplicate.name}. It was not uploaded again.`
    );
    error.code = "DUPLICATE_ONEDRIVE_FILE";
    error.existingItem = indexedFileDuplicate;
    throw error;
  }

  if (existingRole && !replace) {
    if (localSha1 && existingRole.sha1_hash === localSha1) {
      return { document: existingRole, duplicate: true, folder: folderStatus };
    }
    const error = new Error(
      `${documentType === "QUOTATION_SOURCE" ? "Supplier Original" : "Costa Gear Import File"} already exists for this quotation. Use Replace to update it.`
    );
    error.code = "SUPPLIER_DOCUMENT_ROLE_EXISTS";
    error.existingDocument = existingRole;
    throw error;
  }

  const governedName = governedSupplierDocumentName({
    fileName: file.name,
    supplier,
    folderName: folder.name,
    documentType,
    quotation,
    description,
    documentDate,
  });

  const sameNameReplacement = Boolean(
    replace && existingRole && String(existingRole.file_name).toLowerCase() === governedName.toLowerCase()
  );

  let upload = null;
  try {
    upload = await uploadFileToOneDriveFolder({
      file,
      parentId: folder.id,
      fileName: governedName,
      replace: sameNameReplacement,
    });

    let officialHash = localSha1;
    try {
      const hashes = await getOneDriveItemContentHashes(upload.itemId);
      officialHash = hashes.sha1Hash || localSha1;
    } catch (_) {}

    const payload = {
      supplier_id: supplier.id,
      quotation_id: quotation?.id || null,
      document_type: documentType,
      description: description || null,
      document_date: documentDate || quotation?.quote_date || null,
      original_file_name: file.name,
      file_name: upload.fileName,
      mime_type: upload.mimeType || file.type || null,
      size_bytes: upload.sizeBytes ?? file.size ?? 0,
      sha1_hash: officialHash,
      onedrive_item_id: upload.itemId,
      onedrive_web_url: upload.webUrl || null,
      updated_at: new Date().toISOString(),
    };

    let document;
    if (existingRole) {
      const { data, error } = await supabase
        .from("supplier_documents")
        .update(payload)
        .eq("id", existingRole.id)
        .select()
        .single();
      if (error) throw error;
      document = data;
    } else {
      const { data, error } = await supabase
        .from("supplier_documents")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      document = data;
    }

    await indexUploadedFile({
      upload,
      folder,
      supplier,
      quotation,
      documentType,
      sha1Hash: officialHash,
    });

    if (existingRole && existingRole.onedrive_item_id !== upload.itemId) {
      try {
        await deleteOneDriveItem(existingRole.onedrive_item_id);
        await supabase
          .from("onedrive_items")
          .update({ is_deleted: true, indexed_at: new Date().toISOString() })
          .eq("item_id", existingRole.onedrive_item_id);
      } catch (_) {}
    }

    return { document, duplicate: false, folder: folderStatus };
  } catch (error) {
    if (upload?.itemId && (!existingRole || upload.itemId !== existingRole.onedrive_item_id)) {
      try { await deleteOneDriveItem(upload.itemId); } catch (_) {}
    }
    throw error;
  }
}

export function supplierDocumentTypeLabel(value) {
  return [...SUPPLIER_DOCUMENT_TYPES, ...QUOTATION_DOCUMENT_TYPES].find(item => item.value === value)?.label || value;
}
