import { supabase } from "../supabase";
import { analyzeOfficialDocumentName, isFormalDocumentFile } from "../domain/documentNaming";
import { syncOneDriveDocumentIndex } from "./oneDriveDocumentIndexService";

const ACTIVE_ROOT = "COSTA GEAR/";
const ARCHIVE_PREFIX = "COSTA GEAR/99_ARCHIVE/";
const INTAKE_SEGMENT = "/Suppliers_Sourcing/_INTAKE/";

function isActiveFormal(item) {
  const path = String(item?.path || "");
  return Boolean(
    item
    && !item.is_deleted
    && !item.is_folder
    && path.startsWith(ACTIVE_ROOT)
    && !path.startsWith(ARCHIVE_PREFIX)
    && !path.includes(INTAKE_SEGMENT)
    && isFormalDocumentFile(item.name)
  );
}

function summarizeMigration(rows) {
  const total = (rows || []).length;
  const migrated = (rows || []).filter(row => row.status === "migrated").length;
  const open = total - migrated;
  return {
    total,
    migrated,
    open,
    complete: total > 0 && open === 0,
  };
}

export async function loadDocumentGovernanceStatus() {
  const [itemsResult, migrationResult, syncResult] = await Promise.all([
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,is_folder,is_deleted,indexed_at")
      .eq("is_deleted", false)
      .eq("is_folder", false),
    supabase
      .from("legacy_document_migration_queue")
      .select("id,batch_code,status"),
    supabase
      .from("onedrive_sync_state")
      .select("last_sync_at,sync_status,error_message,last_item_count")
      .eq("scope", "appfolder")
      .maybeSingle(),
  ]);

  const failed = [itemsResult, migrationResult, syncResult].find(result => result.error);
  if (failed?.error) throw failed.error;

  const formal = (itemsResult.data || []).filter(isActiveFormal);
  const analyzed = formal.map(item => ({
    ...item,
    naming: analyzeOfficialDocumentName(item.name),
  }));
  const compliant = analyzed.filter(item => item.naming.compliant === true).length;
  const attention = analyzed.filter(item => item.naming.compliant === false).length;

  return {
    activeFormal: analyzed.length,
    compliant,
    attention,
    migration: summarizeMigration(migrationResult.data || []),
    sync: syncResult.data || null,
  };
}

export async function refreshDocumentGovernanceStatus() {
  await syncOneDriveDocumentIndex();
  return loadDocumentGovernanceStatus();
}
