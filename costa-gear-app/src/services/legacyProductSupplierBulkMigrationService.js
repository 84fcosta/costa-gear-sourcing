import { supabase } from "../supabase";
import { moveOneDriveItem } from "./oneDriveAppFolderService";

const BATCH_CODE = "products_suppliers";

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : null;
}

function typeCodeFromName(name) {
  const match = String(name || "").match(/^CG_([A-Z]{3})_/);
  return match ? match[1] : null;
}

async function updateIndexedMove(queueRow, moved) {
  const now = new Date().toISOString();
  const destinationPath = `COSTA GEAR/${moved.destinationPath}`;
  const { error } = await supabase
    .from("onedrive_items")
    .update({
      name: moved.fileName,
      path: destinationPath,
      extension: extensionFromName(moved.fileName),
      mime_type: moved.mimeType || null,
      size_bytes: Number(moved.sizeBytes || 0),
      web_url: moved.webUrl || null,
      type_code: typeCodeFromName(moved.fileName),
      naming_compliant: true,
      naming_issue: null,
      last_seen_at: now,
      indexed_at: now,
      is_deleted: false,
    })
    .eq("item_id", moved.itemId);
  if (error) throw error;
}

async function linkIndexedEntity(queueRow, moved) {
  let entityType = null;
  let entityId = null;

  if (queueRow.linked_quote_id) {
    entityType = "supplier_quotation";
    entityId = queueRow.linked_quote_id;
  } else if (queueRow.linked_supplier_id) {
    entityType = "supplier";
    entityId = queueRow.linked_supplier_id;
  }

  if (!entityType || !entityId) return;

  const { error } = await supabase
    .from("onedrive_items")
    .update({ linked_entity_type: entityType, linked_entity_id: entityId })
    .eq("item_id", moved.itemId);
  if (error) throw error;
}

async function migrateWithoutRescan(queueRow) {
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

    const moved = await moveOneDriveItem({
      itemId: queueRow.item_id,
      folderPath,
      newName: queueRow.proposed_name,
    });

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

    await updateIndexedMove(queueRow, moved);
    await linkIndexedEntity(queueRow, moved);
    return moved;
  } catch (error) {
    await supabase
      .from("legacy_document_migration_queue")
      .update({
        status: "error",
        error_message: error?.message || "Migration failed.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueRow.id);
    throw error;
  }
}

export async function migrateAllReadyProductSupplierItemsFast() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("batch_code", BATCH_CODE)
    .eq("proposal_state", "ready")
    .eq("status", "review")
    .order("source_path", { ascending: true });
  if (error) throw error;

  const ready = data || [];
  const results = [];

  for (const row of ready) {
    try {
      await migrateWithoutRescan(row);
      results.push({ id: row.id, ok: true });
    } catch (migrationError) {
      results.push({
        id: row.id,
        ok: false,
        error: migrationError?.message || "Migration failed.",
      });
    }
  }

  return results;
}
