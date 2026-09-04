import { supabase } from "../supabase";
import { scanOneDriveAppFolderTree } from "./oneDriveAppFolderService";

const TYPE_CODES = new Set([
  "ADM", "AGR", "INS", "POL", "TAX", "EXP", "REV", "BNK", "BUD",
  "BRN", "MKT", "WEB", "RES", "PRD", "SPC", "SUP", "QUO", "CST",
  "PO", "LOG", "STK", "SOP", "SAL", "CUS", "TMP", "AST",
]);

const TRANSACTIONAL_TYPES = new Set([
  "AGR", "TAX", "EXP", "REV", "BNK", "QUO", "PO", "LOG", "SAL", "AST",
]);

// Recognize plausible business/document dates, not arbitrary four-digit record keys like 0013.
// Supported filename date forms: YYYY, YYYY-MM and YYYY-MM-DD.
const DATE_PATTERN = /^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;
const VERSION_PATTERN = /^V\d{2}$/;

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : null;
}

function analyzeNaming(name, isFolder) {
  if (isFolder) return { typeCode: null, compliant: null, issue: null };

  const extension = extensionFromName(name);
  const base = extension ? name.slice(0, -(extension.length + 1)) : name;
  const parts = String(base || "").split("_").filter(Boolean);

  if (parts[0] !== "CG") return { typeCode: null, compliant: false, issue: "Missing CG prefix" };

  const typeCode = parts[1] || null;
  if (!TYPE_CODES.has(typeCode)) {
    return { typeCode, compliant: false, issue: "Unknown or missing document type code" };
  }

  if (parts.length < 4) {
    return { typeCode, compliant: false, issue: "Missing key or description" };
  }

  if (parts.some((part) => /^(FINAL|FINAL\d+|COPY|REVISED)$/i.test(part))) {
    return { typeCode, compliant: false, issue: "Use V01, V02... instead of FINAL/COPY/REVISED" };
  }

  const versionParts = parts.filter((part) => /^V\d+$/i.test(part));
  if (versionParts.some((part) => !VERSION_PATTERN.test(part.toUpperCase()))) {
    return { typeCode, compliant: false, issue: "Version must use two digits, e.g. V01" };
  }

  const dateIndexes = parts
    .map((part, index) => DATE_PATTERN.test(part) ? index : -1)
    .filter((index) => index >= 0);

  if (dateIndexes.length && dateIndexes.some((index) => index !== parts.length - 1)) {
    return { typeCode, compliant: false, issue: "Date must be the final filename element" };
  }

  if (TRANSACTIONAL_TYPES.has(typeCode) && !DATE_PATTERN.test(parts[parts.length - 1] || "")) {
    return { typeCode, compliant: false, issue: "Document date is required for this type" };
  }

  if (/\s/.test(base)) {
    return { typeCode, compliant: false, issue: "Use underscores instead of spaces" };
  }

  return { typeCode, compliant: true, issue: null };
}

function toIndexRow(item, now) {
  const isFolder = Boolean(item?.folder);
  const naming = analyzeNaming(item?.name || "", isFolder);
  return {
    item_id: item.id,
    parent_item_id: item?._isRoot ? null : item?.parentReference?.id || null,
    name: item?.name || "Unnamed",
    path: item?._relativePath || item?.name || "",
    is_folder: isFolder,
    extension: isFolder ? null : extensionFromName(item?.name),
    mime_type: item?.file?.mimeType || null,
    size_bytes: Number(item?.size || 0),
    web_url: item?.webUrl || null,
    etag: item?.eTag || null,
    created_datetime: item?.createdDateTime || null,
    modified_datetime: item?.lastModifiedDateTime || null,
    type_code: naming.typeCode,
    naming_compliant: naming.compliant,
    naming_issue: naming.issue,
    last_seen_at: now,
    is_deleted: false,
    indexed_at: now,
  };
}

function chunks(values, size = 100) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function setSyncState(values) {
  const { error } = await supabase
    .from("onedrive_sync_state")
    .upsert({ scope: "appfolder", ...values, updated_at: new Date().toISOString() }, { onConflict: "scope" });
  if (error) throw error;
}

export async function syncOneDriveDocumentIndex() {
  await setSyncState({ sync_status: "syncing", error_message: null });

  try {
    const { root, items } = await scanOneDriveAppFolderTree();
    const now = new Date().toISOString();
    const rows = items.filter((item) => item?.id).map((item) => toIndexRow(item, now));
    const seenIds = new Set(rows.map((row) => row.item_id));

    const { data: existing, error: existingError } = await supabase
      .from("onedrive_items")
      .select("item_id")
      .eq("is_deleted", false);
    if (existingError) throw existingError;

    for (const batch of chunks(rows)) {
      const { error } = await supabase
        .from("onedrive_items")
        .upsert(batch, { onConflict: "item_id" });
      if (error) throw error;
    }

    const staleIds = (existing || [])
      .map((row) => row.item_id)
      .filter((itemId) => !seenIds.has(itemId));

    for (const batch of chunks(staleIds)) {
      const { error } = await supabase
        .from("onedrive_items")
        .update({ is_deleted: true, indexed_at: now })
        .in("item_id", batch);
      if (error) throw error;
    }

    const nonFolderRows = rows.filter((row) => !row.is_folder);
    const nonCompliantCount = nonFolderRows.filter((row) => row.naming_compliant === false).length;

    await setSyncState({
      root_item_id: root?.id || null,
      root_name: root?.name || "COSTA GEAR",
      last_sync_at: now,
      last_item_count: rows.length,
      sync_status: "ready",
      error_message: null,
    });

    return {
      rootName: root?.name || "COSTA GEAR",
      itemCount: rows.length,
      fileCount: nonFolderRows.length,
      folderCount: rows.length - nonFolderRows.length,
      nonCompliantCount,
      lastSyncAt: now,
    };
  } catch (error) {
    try {
      await setSyncState({ sync_status: "error", error_message: error?.message || "OneDrive index sync failed." });
    } catch (_) {}
    throw error;
  }
}

export async function getOneDriveIndexSummary() {
  const [stateResult, itemsResult] = await Promise.all([
    supabase.from("onedrive_sync_state").select("*").eq("scope", "appfolder").maybeSingle(),
    supabase.from("onedrive_items").select("item_id,is_folder,naming_compliant", { count: "exact" }).eq("is_deleted", false),
  ]);

  if (stateResult.error) throw stateResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const items = itemsResult.data || [];
  return {
    state: stateResult.data || null,
    itemCount: itemsResult.count ?? items.length,
    fileCount: items.filter((item) => !item.is_folder).length,
    folderCount: items.filter((item) => item.is_folder).length,
    nonCompliantCount: items.filter((item) => !item.is_folder && item.naming_compliant === false).length,
  };
}
