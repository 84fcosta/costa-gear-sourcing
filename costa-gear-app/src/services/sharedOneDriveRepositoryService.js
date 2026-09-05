import { supabase } from "../supabase";
import {
  getOneDriveRepositoryConfig,
  registerCurrentAppFolderAsSharedRepository,
  shareOneDriveRepositoryWithEmail,
} from "./oneDriveAppFolderService";

async function currentRole() {
  const { data: userResult } = await supabase.auth.getUser();
  const userId = userResult?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("app_members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role || null;
}

export async function initializeSharedOneDriveRepository({ microsoftAccount = null } = {}) {
  const role = await currentRole();
  let repository = await getOneDriveRepositoryConfig(true);

  if (!repository && role === "owner") {
    repository = await registerCurrentAppFolderAsSharedRepository({ microsoftAccount });
  }

  if (!repository) {
    return {
      repository: null,
      shared: [],
      pendingOwnerSetup: true,
      message: "The Costa Gear shared repository has not been registered by the owner yet.",
    };
  }

  if (role !== "owner") {
    return { repository, shared: [], pendingOwnerSetup: false };
  }

  const { data: collaborators, error } = await supabase
    .from("onedrive_repository_collaborators")
    .select("email,access_role,is_enabled,invited_at")
    .eq("is_enabled", true)
    .is("invited_at", null)
    .order("email");
  if (error) throw error;

  const shared = [];
  for (const collaborator of collaborators || []) {
    try {
      const result = await shareOneDriveRepositoryWithEmail(collaborator.email);
      const invitedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("onedrive_repository_collaborators")
        .update({ invited_at: invitedAt, updated_at: invitedAt })
        .eq("email", collaborator.email);
      if (updateError) throw updateError;
      shared.push({ email: collaborator.email, ok: true, permissions: result.permissions || [] });
    } catch (shareError) {
      shared.push({ email: collaborator.email, ok: false, error: shareError?.message || "Unable to share repository." });
    }
  }

  return { repository, shared, pendingOwnerSetup: false };
}

export async function loadSharedRepositoryStatus() {
  const [repository, roleResult, collaboratorsResult] = await Promise.all([
    getOneDriveRepositoryConfig(true),
    currentRole(),
    supabase.from("onedrive_repository_collaborators").select("email,access_role,is_enabled,invited_at").order("email"),
  ]);
  if (collaboratorsResult.error) throw collaboratorsResult.error;
  return {
    repository,
    role: roleResult,
    collaborators: collaboratorsResult.data || [],
  };
}
