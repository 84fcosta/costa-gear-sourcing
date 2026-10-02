import { supabase } from "../supabase";
import { scanOneDriveAppFolderTree } from "./oneDriveAppFolderService";
import { analyzeOfficialDocumentName } from "../domain/documentNaming";

const LEGACY_STAGING_SEGMENT = "/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING/";

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : null;
}

function isLegacyStagingPath(path) {
  const value = String(path || "");
  return value.includes(LEGACY_STAGING_SEGMENT)
    || value.includes("/02_PRODUCTS/Suppliers_Sourcing/_INTAKE/")
    || value.includes("/99_ARCHIVE/");
}

function analyzeNaming(name, isFolder, path) {
  if (isFolder) return { typeCode: null, compliant: null, issue: null };
  if (isLegacyStagingPath(path)) {
    return { typeCode: null, compliant: null, issue: "Staging/archive excluded from active document naming compliance" };
  }
  return analyzeOfficialDocumentName(name);
}

function toIndexRow(item, now) {
  const isFolder = Boolean(item?.folder);
  const path = item?._relativePath || item?.name || "";
  const naming = analyzeNaming(item?.name || "", isFolder, path);

  return {
    item_id: item.id,
    parent_item_id: item?._isRoot ? null : item?.parentReference?.id || null,
    name: item?.name || "Unnamed",
    path,
    is_folder: isFolder,
    extension: isFolder ? null : extensionFromName(item?.name),
    mime_type: item?.file?.mimeType || null,
    size_bytes: Number(item?.size || 0),
    quickxor_hash: isFolder ? null : item?.file?.hashes?.quickXorHash || null,
    sha1_hash: isFolder ? null : item?.file?.hashes?.sha1Hash || null,
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
