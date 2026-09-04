import { supabase } from "../supabase";
import { moveOneDriveItem } from "./oneDriveAppFolderService";

const STAGING_ROOT = "COSTA GEAR/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING";
const BATCH_CODE = "legacy_closeout";

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : "";
}

function stripExtension(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function safeToken(value, fallback = "Reference") {
  const cleaned = String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " And ")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function isSupplierDuplicateCandidate(item) {
  return item.path.includes("/COSTA_GEAR_LEGACY_STAGING/Costa Gear - Suplliers/");
}

function proposalForItem(item, canonicalMatch, projectSequence) {
  const ext = extensionFromName(item.name);

  if (canonicalMatch) {
    const canonicalStem = safeToken(stripExtension(canonicalMatch.name).replace(/^CG_/i, ""), "Canonical_File");
    return {
      destination: "99_ARCHIVE/Legacy_Duplicates/Products_Suppliers",
      name: `CG_RES_Duplicate_${canonicalStem}.${ext}`,
      state: "ready",
      duplicateOfItemId: canonicalMatch.item_id,
      note: `Confirmed duplicate by quickXorHash. Canonical file remains at ${canonicalMatch.path}. This staging copy is retained in the legacy duplicate archive rather than deleted.`,
    };
  }

  if (item.path.includes("/06_PROJECTS/New_Product_Launches/")) {
    return {
      destination: "99_ARCHIVE/Project_Reference/New_Product_Launches",
      name: `CG_RES_New_Product_Launch_Reference_${String(projectSequence).padStart(2, "0")}.${ext}`,
      state: "ready",
      duplicateOfItemId: null,
      note: "Legacy new-product-launch image preserved as archived project research/reference. No active product/SKU link is inferred from the opaque source filename.",
    };
  }

  if (item.path === `${STAGING_ROOT}/Costa_Gear_Folder_Structure_v1.xlsx`) {
    return {
      destination: "99_ARCHIVE/System_Reference",
      name: "CG_RES_Legacy_Folder_Structure_V01.xlsx",
      state: "ready",
      duplicateOfItemId: null,
      note: "Legacy folder-structure workbook archived as system reference. It is superseded by the governed Costa Gear Operations repository structure.",
    };
  }

  return {
    destination: "99_ARCHIVE/Legacy_Closeout_Review",
    name: `CG_RES_Legacy_Unclassified_${safeToken(stripExtension(item.name))}.${ext}`,
    state: "needs_review",
    duplicateOfItemId: null,
    note: "Unexpected remaining staging file. Held for review rather than moved automatically.",
  };
}

export async function loadLegacyCloseoutQueue() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("batch_code", BATCH_CODE)
    .order("source_path", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function refreshLegacyCloseoutProposals() {
  const [itemsResult, queueResult, activeResult] = await Promise.all([
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,extension,mime_type,size_bytes,web_url,quickxor_hash")
      .eq("is_deleted", false)
      .eq("is_folder", false)
      .like("path", `${STAGING_ROOT}/%`),
    supabase.from("legacy_document_migration_queue").select("*").eq("batch_code", BATCH_CODE),
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,size_bytes,quickxor_hash")
      .eq("is_deleted", false)
      .eq("is_folder", false)
      .not("quickxor_hash", "is", null)
      .not("path", "like", `${STAGING_ROOT}/%`),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (queueResult.error) throw queueResult.error;
  if (activeResult.error) throw activeResult.error;

  const existingByItem = new Map((queueResult.data || []).map((row) => [row.item_id, row]));
  const activeByHash = new Map();
  for (const item of activeResult.data || []) {
    if (!item.quickxor_hash) continue;
    if (!activeByHash.has(item.quickxor_hash)) activeByHash.set(item.quickxor_hash, item);
  }

  const projectItems = (itemsResult.data || [])
    .filter((item) => item.path.includes("/06_PROJECTS/New_Product_Launches/"))
    .sort((a, b) => a.name.localeCompare(b.name));
  const projectSequenceById = new Map(projectItems.map((item, index) => [item.item_id, index + 1]));

  const now = new Date().toISOString();
  const rows = (itemsResult.data || []).map((item) => {
    const existing = existingByItem.get(item.item_id);
    if (existing?.status === "migrated") return { ...existing, updated_at: now };

    const canonicalMatch = isSupplierDuplicateCandidate(item) && item.quickxor_hash
      ? activeByHash.get(item.quickxor_hash) || null
      : null;
    const proposal = proposalForItem(item, canonicalMatch, projectSequenceById.get(item.item_id) || 1);

    return {
      item_id: item.item_id,
      batch_code: BATCH_CODE,
      source_path: item.path,
      source_name: item.name,
      proposed_destination: proposal.destination,
      proposed_name: proposal.name,
      proposal_state: proposal.state,
      status: existing?.status === "skipped" ? "skipped" : "review",
      linked_expense_id: null,
      linked_purchase_order_id: null,
      linked_supplier_id: null,
      linked_quote_id: null,
      duplicate_of_item_id: proposal.duplicateOfItemId,
      review_note: proposal.note,
      error_message: null,
      migrated_item_id: existing?.migrated_item_id || null,
      migrated_web_url: existing?.migrated_web_url || null,
      migrated_at: existing?.migrated_at || null,
      updated_at: now,
    };
  });

  if (rows.length) {
    const { error } = await supabase.from("legacy_document_migration_queue").upsert(rows, { onConflict: "item_id" });
    if (error) throw error;
  }

  return loadLegacyCloseoutQueue();
}

async function updateIndexAfterMove(queueRow, moved) {
  const now = new Date().toISOString();
  const extension = extensionFromName(moved.fileName || queueRow.proposed_name);
  const path = `COSTA GEAR/${moved.destinationPath}`.replace(/^COSTA GEAR\/COSTA GEAR\//, "COSTA GEAR/");
  const { error } = await supabase
    .from("onedrive_items")
    .update({
      name: moved.fileName || queueRow.proposed_name,
      path,
      extension,
      mime_type: moved.mimeType || null,
      size_bytes: Number(moved.sizeBytes || 0),
      web_url: moved.webUrl || null,
      naming_compliant: true,
      naming_issue: null,
      is_deleted: false,
      last_seen_at: now,
      indexed_at: now,
    })
    .eq("item_id", moved.itemId);
  if (error) throw error;
}

async function migrateRow(queueRow) {
  const { error: stateError } = await supabase
    .from("legacy_document_migration_queue")
    .update({ status: "migrating", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", queueRow.id);
  if (stateError) throw stateError;

  try {
    const folderPath = String(queueRow.proposed_destination || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    const moved = await moveOneDriveItem({ itemId: queueRow.item_id, folderPath, newName: queueRow.proposed_name });
    await updateIndexAfterMove(queueRow, moved);
    const migratedAt = new Date().toISOString();
    const { error } = await supabase
      .from("legacy_document_migration_queue")
      .update({
        status: "migrated",
        migrated_item_id: moved.itemId,
        migrated_web_url: moved.webUrl,
        migrated_at: migratedAt,
        error_message: null,
        updated_at: migratedAt,
      })
      .eq("id", queueRow.id);
    if (error) throw error;
    return moved;
  } catch (error) {
    await supabase
      .from("legacy_document_migration_queue")
      .update({ status: "error", error_message: error?.message || "Migration failed.", updated_at: new Date().toISOString() })
      .eq("id", queueRow.id);
    throw error;
  }
}

export async function migrateLegacyCloseoutItem(id) {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("id", id)
    .eq("batch_code", BATCH_CODE)
    .single();
  if (error) throw error;
  if (data.status === "migrated") return data;
  if (data.proposal_state !== "ready" || data.status !== "review") throw new Error("This closeout file is not ready to migrate.");
  return migrateRow(data);
}

export async function migrateAllReadyLegacyCloseoutItems() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("batch_code", BATCH_CODE)
    .eq("proposal_state", "ready")
    .eq("status", "review")
    .order("source_path", { ascending: true });
  if (error) throw error;

  const results = [];
  for (const row of data || []) {
    try {
      await migrateRow(row);
      results.push({ id: row.id, ok: true });
    } catch (migrationError) {
      results.push({ id: row.id, ok: false, error: migrationError?.message || "Migration failed." });
    }
  }
  return results;
}
