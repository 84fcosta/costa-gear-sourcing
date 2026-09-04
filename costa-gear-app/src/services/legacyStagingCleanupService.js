import { supabase } from "../supabase";
import { deleteBusinessDocumentFromOneDrive, listOneDriveChildren } from "./oneDriveAppFolderService";

const STAGING_PATH = "COSTA GEAR/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING";

async function loadActiveStagingRoot() {
  const { data, error } = await supabase
    .from("onedrive_items")
    .select("item_id,name,path,is_folder,is_deleted")
    .eq("path", STAGING_PATH)
    .eq("is_folder", true)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function countIndexedActiveFiles() {
  const { count, error } = await supabase
    .from("onedrive_items")
    .select("item_id", { count: "exact", head: true })
    .eq("is_deleted", false)
    .eq("is_folder", false)
    .like("path", `${STAGING_PATH}/%`);
  if (error) throw error;
  return Number(count || 0);
}

async function verifyLiveTreeContainsFoldersOnly(rootId) {
  let folderCount = 0;
  const stack = [rootId];

  while (stack.length) {
    const parentId = stack.pop();
    const children = await listOneDriveChildren(parentId);
    for (const child of children) {
      if (child?.folder) {
        folderCount += 1;
        stack.push(child.id);
        continue;
      }
      throw new Error(`Cleanup stopped because a file still exists in staging: ${child?.name || "Unnamed file"}.`);
    }
  }

  return folderCount;
}

export async function deleteEmptyLegacyStagingTree() {
  const root = await loadActiveStagingRoot();
  if (!root) {
    return { deleted: false, alreadyRemoved: true, foldersRemoved: 0 };
  }

  if (root.name !== "COSTA_GEAR_LEGACY_STAGING" || root.path !== STAGING_PATH) {
    throw new Error("Cleanup stopped because the staging root identity did not match the governed path.");
  }

  const indexedFiles = await countIndexedActiveFiles();
  if (indexedFiles > 0) {
    throw new Error(`Cleanup stopped because ${indexedFiles} active file${indexedFiles === 1 ? "" : "s"} still exist in the staging index.`);
  }

  const descendantFolderCount = await verifyLiveTreeContainsFoldersOnly(root.item_id);

  await deleteBusinessDocumentFromOneDrive(root.item_id);

  const now = new Date().toISOString();
  const { error: descendantsError } = await supabase
    .from("onedrive_items")
    .update({ is_deleted: true, last_seen_at: now, indexed_at: now })
    .like("path", `${STAGING_PATH}/%`);
  if (descendantsError) throw descendantsError;

  const { error: rootError } = await supabase
    .from("onedrive_items")
    .update({ is_deleted: true, last_seen_at: now, indexed_at: now })
    .eq("path", STAGING_PATH);
  if (rootError) throw rootError;

  return {
    deleted: true,
    alreadyRemoved: false,
    foldersRemoved: descendantFolderCount + 1,
  };
}
