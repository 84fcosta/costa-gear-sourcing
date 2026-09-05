import { supabase } from "../supabase";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const REPOSITORY_KEY = "costa_gear";

export const ONE_DRIVE_FILES_SCOPE = "Files.ReadWrite";
// Backward-compatible export used by existing UI modules.
export const ONE_DRIVE_APP_FOLDER_SCOPE = ONE_DRIVE_FILES_SCOPE;

export const COSTA_GEAR_FOLDER_STRUCTURE = [
  { name: "00_ADMIN", children: ["Business_Legal", "Insurance_Compliance", "Agreements"] },
  { name: "01_FINANCE", children: ["Expenses", "Revenue", "Banking", "Tax"] },
  { name: "02_PRODUCTS", children: ["Product_Files", "Suppliers_Sourcing", "Costing_Pricing"] },
  { name: "03_OPERATIONS", children: ["Purchase_Orders", "Logistics", "Inventory", "SOPs"] },
  { name: "04_SALES_MARKETING", children: ["Sales", "Customers_Partners", "Marketing_Content", "Brand_Website"] },
  { name: "05_TEMPLATES", children: [] },
  { name: "99_ARCHIVE", children: [] },
];

let accessTokenProvider = null;
let repositoryConfigCache = undefined;

export function configureOneDriveAccessTokenProvider(provider) {
  accessTokenProvider = typeof provider === "function" ? provider : null;
}

export function clearOneDriveAccessTokenProvider() {
  accessTokenProvider = null;
}

export function isOneDriveConfigured() {
  return typeof accessTokenProvider === "function";
}

export function getOneDriveConfiguration() {
  return {
    configured: isOneDriveConfigured(),
    permission: ONE_DRIVE_FILES_SCOPE,
    storage: "Shared Costa Gear OneDrive repository",
  };
}

async function getAccessToken() {
  if (!accessTokenProvider) {
    throw new Error(
      "OneDrive authentication is not configured yet. Connect Microsoft OneDrive before uploading documents."
    );
  }

  const token = await accessTokenProvider();
  if (!token) throw new Error("OneDrive did not return a valid access token.");
  return token;
}

async function graphRequest(pathOrUrl, options = {}) {
  const token = await getAccessToken();
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${GRAPH_ROOT}${pathOrUrl}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const graphMessage = body?.error?.message || (typeof body === "string" ? body : "");
    throw new Error(graphMessage || `Microsoft Graph request failed with status ${response.status}.`);
  }

  return body;
}

async function loadRepositoryConfig(force = false) {
  if (!force && repositoryConfigCache !== undefined) return repositoryConfigCache;
  const { data, error } = await supabase
    .from("onedrive_repository_config")
    .select("repository_key,drive_id,root_item_id,root_name,root_web_url,owner_microsoft_account,configured_by,configured_at,updated_at")
    .eq("repository_key", REPOSITORY_KEY)
    .maybeSingle();
  if (error) throw error;
  repositoryConfigCache = data || null;
  return repositoryConfigCache;
}

export async function getOneDriveRepositoryConfig(force = false) {
  return loadRepositoryConfig(force);
}

function clearRepositoryConfigCache() {
  repositoryConfigCache = undefined;
}

async function driveItemPath(itemId, suffix = "") {
  const config = await loadRepositoryConfig();
  if (config?.drive_id) {
    return `/drives/${encodeURIComponent(config.drive_id)}/items/${encodeURIComponent(itemId)}${suffix}`;
  }
  return `/me/drive/items/${encodeURIComponent(itemId)}${suffix}`;
}

async function currentBootstrapAppFolder() {
  return graphRequest("/me/drive/special/approot?$select=id,name,webUrl,parentReference,eTag,createdDateTime,lastModifiedDateTime,size,folder");
}

export async function registerCurrentAppFolderAsSharedRepository({ microsoftAccount = null } = {}) {
  const existing = await loadRepositoryConfig(true);
  if (existing) return existing;

  const [root, drive, userResult] = await Promise.all([
    currentBootstrapAppFolder(),
    graphRequest("/me/drive?$select=id,driveType,owner"),
    supabase.auth.getUser(),
  ]);

  if (!root?.id || !drive?.id) {
    throw new Error("Unable to identify the current Costa Gear OneDrive repository.");
  }

  const payload = {
    repository_key: REPOSITORY_KEY,
    drive_id: drive.id,
    root_item_id: root.id,
    root_name: root.name || "COSTA GEAR",
    root_web_url: root.webUrl || null,
    owner_microsoft_account: microsoftAccount || null,
    configured_by: userResult?.data?.user?.id || null,
    configured_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("onedrive_repository_config")
    .upsert(payload, { onConflict: "repository_key" })
    .select()
    .single();
  if (error) throw error;
  clearRepositoryConfigCache();
  repositoryConfigCache = data;
  return data;
}

export async function shareOneDriveRepositoryWithEmail(email) {
  const recipient = String(email || "").trim();
  if (!recipient) throw new Error("Enter a Microsoft account email to share the repository.");

  const config = await loadRepositoryConfig(true);
  if (!config?.drive_id || !config?.root_item_id) {
    throw new Error("Register the shared Costa Gear repository before inviting collaborators.");
  }

  const response = await graphRequest(
    `/drives/${encodeURIComponent(config.drive_id)}/items/${encodeURIComponent(config.root_item_id)}/invite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients: [{ email: recipient }],
        message: "Costa Gear Operations shared repository access.",
        requireSignIn: true,
        sendInvitation: true,
        roles: ["write"],
      }),
    }
  );

  return { email: recipient, permissions: response?.value || [] };
}

export function cleanOneDriveNamePart(value, fallback = "Document", maxLength = 56) {
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

function paddedNumber(value, width = 4) {
  const normalized = String(Number(value));
  return /^\d+$/.test(normalized) ? normalized.padStart(width, "0") : cleanOneDriveNamePart(value, "Record", 20);
}

async function loadDocumentOwner(ownerType, ownerId) {
  if (ownerType === "expense") {
    const { data, error } = await supabase
      .from("business_expenses")
      .select("id,expense_number,expense_date,vendor,description,tax_year")
      .eq("id", ownerId)
      .single();
    if (error) throw error;
    return data;
  }

  if (ownerType === "asset") {
    const { data, error } = await supabase
      .from("business_assets")
      .select("id,asset_code,asset_name,purchase_date,vendor,tax_year")
      .eq("id", ownerId)
      .single();
    if (error) throw error;
    return data;
  }

  throw new Error(`Unsupported document owner type: ${ownerType}.`);
}

export function governedBusinessDocumentName({ fileName, ownerType, record }) {
  const extensionMatch = String(fileName || "").match(/\.([A-Za-z0-9]{1,10})$/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";

  if (ownerType === "expense") {
    const key = paddedNumber(record.expense_number);
    const vendor = cleanOneDriveNamePart(record.vendor, "Vendor", 36);
    const description = cleanOneDriveNamePart(record.description, "Expense", 60);
    const date = cleanOneDriveNamePart(record.expense_date, "Date", 10);
    return `CG_EXP_${key}_${vendor}_${description}_${date}${extension}`;
  }

  const key = cleanOneDriveNamePart(record.asset_code || String(record.id).slice(0, 8), "Asset", 24);
  const vendor = cleanOneDriveNamePart(record.vendor, "Vendor", 36);
  const description = cleanOneDriveNamePart(record.asset_name, "Asset", 60);
  const date = cleanOneDriveNamePart(record.purchase_date, "Date", 10);
  return `CG_AST_${key}_${vendor}_${description}_${date}${extension}`;
}

function governedDocumentName({ file, ownerType, record }) {
  return governedBusinessDocumentName({ fileName: file?.name, ownerType, record });
}

function governedFolderPath({ ownerType, record, fallbackYear }) {
  const year = String(record.tax_year || fallbackYear || new Date().getFullYear());

  if (ownerType === "expense" || ownerType === "asset") {
    return ["01_FINANCE", "Expenses", cleanOneDriveNamePart(year, String(new Date().getFullYear()), 4)];
  }

  return [];
}

async function findChildFolder(parentId, name) {
  const children = await listOneDriveChildren(parentId);
  return children.find(
    (item) => item?.folder && String(item.name).toLowerCase() === String(name).toLowerCase()
  ) || null;
}

async function ensureChildFolder(parentId, name) {
  const existing = await findChildFolder(parentId, name);
  if (existing) return existing;

  try {
    const path = await driveItemPath(parentId, "/children");
    return await graphRequest(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
  } catch (error) {
    const afterConflict = await findChildFolder(parentId, name);
    if (afterConflict) return afterConflict;
    throw error;
  }
}

async function ensureFolderPath(parts) {
  let current = await getOneDriveAppFolder();
  for (const part of parts) {
    current = await ensureChildFolder(current.id, part);
  }
  return current;
}

export async function ensureOneDriveFolderPath(parts) {
  return ensureFolderPath(parts);
}

export async function getOneDriveAppFolder() {
  const config = await loadRepositoryConfig();
  if (!config?.drive_id || !config?.root_item_id) return currentBootstrapAppFolder();
  return graphRequest(
    `/drives/${encodeURIComponent(config.drive_id)}/items/${encodeURIComponent(config.root_item_id)}?$select=id,name,webUrl,parentReference,eTag,createdDateTime,lastModifiedDateTime,size,folder`
  );
}

export async function listOneDriveChildren(parentId) {
  const items = [];
  const firstPath = await driveItemPath(
    parentId,
    "/children?$select=id,name,webUrl,size,eTag,createdDateTime,lastModifiedDateTime,parentReference,file,folder&$top=200"
  );
  let next = firstPath;

  while (next) {
    const response = await graphRequest(next);
    items.push(...(response?.value || []));
    next = response?.["@odata.nextLink"] || null;
  }

  return items;
}

export async function getOneDriveItemContentHashes(itemId) {
  if (!itemId) throw new Error("A OneDrive item ID is required to read content hashes.");
  const path = await driveItemPath(itemId, "?$select=id,size,file");
  const item = await graphRequest(path);
  return {
    itemId: item?.id || itemId,
    sizeBytes: Number(item?.size || 0),
    quickXorHash: item?.file?.hashes?.quickXorHash || null,
    sha1Hash: item?.file?.hashes?.sha1Hash || null,
  };
}

export async function ensureCostaGearFolderStructure() {
  const root = await getOneDriveAppFolder();
  const rootChildren = await listOneDriveChildren(root.id);
  const rootFolders = new Map(
    rootChildren
      .filter((item) => item?.folder)
      .map((item) => [String(item.name).toLowerCase(), item])
  );

  let createdCount = 0;

  for (const section of COSTA_GEAR_FOLDER_STRUCTURE) {
    const sectionKey = section.name.toLowerCase();
    let sectionFolder = rootFolders.get(sectionKey) || null;

    if (!sectionFolder) {
      sectionFolder = await ensureChildFolder(root.id, section.name);
      rootFolders.set(sectionKey, sectionFolder);
      createdCount += 1;
    }

    if (!section.children.length) continue;

    const existingChildren = await listOneDriveChildren(sectionFolder.id);
    const childFolders = new Set(
      existingChildren
        .filter((item) => item?.folder)
        .map((item) => String(item.name).toLowerCase())
    );

    for (const childName of section.children) {
      const childKey = childName.toLowerCase();
      if (childFolders.has(childKey)) continue;
      await ensureChildFolder(sectionFolder.id, childName);
      childFolders.add(childKey);
      createdCount += 1;
    }
  }

  return {
    rootName: root?.name || "COSTA GEAR",
    createdCount,
    governedFolderCount: COSTA_GEAR_FOLDER_STRUCTURE.reduce(
      (total, section) => total + 1 + section.children.length,
      0
    ),
  };
}

export async function scanOneDriveAppFolderTree() {
  await ensureCostaGearFolderStructure();
  const root = await getOneDriveAppFolder();
  const items = [{ ...root, _relativePath: root?.name || "COSTA GEAR", _isRoot: true }];

  async function walk(parent, parentPath) {
    const children = await listOneDriveChildren(parent.id);
    for (const child of children) {
      const path = `${parentPath}/${child.name}`;
      items.push({ ...child, _relativePath: path, _isRoot: false });
      if (child.folder) await walk(child, path);
    }
  }

  await walk(root, root?.name || "COSTA GEAR");
  return { root, items };
}

export async function testOneDriveConnection() {
  const [folder, config] = await Promise.all([
    getOneDriveAppFolder(),
    loadRepositoryConfig(),
  ]);
  return {
    connected: true,
    folderId: folder?.id || null,
    folderName: folder?.name || "Costa Gear repository",
    webUrl: folder?.webUrl || null,
    sharedRepository: Boolean(config),
    driveId: config?.drive_id || folder?.parentReference?.driveId || null,
  };
}

export async function moveOneDriveItem({ itemId, folderPath, newName }) {
  if (!itemId) throw new Error("A OneDrive item ID is required for migration.");
  if (!Array.isArray(folderPath) || !folderPath.length) throw new Error("A destination folder is required for migration.");
  if (!newName) throw new Error("A governed filename is required for migration.");

  const destination = await ensureFolderPath(folderPath);
  const itemPath = await driveItemPath(itemId);
  const item = await graphRequest(itemPath, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: newName,
      parentReference: { id: destination.id },
    }),
  });

  return {
    itemId: item?.id || itemId,
    webUrl: item?.webUrl || null,
    fileName: item?.name || newName,
    sizeBytes: Number(item?.size || 0),
    mimeType: item?.file?.mimeType || null,
    destinationPath: [...folderPath, item?.name || newName].join("/"),
  };
}

export async function uploadBusinessDocument({ file, ownerType, ownerId, year }) {
  if (!file) throw new Error("Choose a document before uploading.");
  if (!ownerId) throw new Error("Save the expense or asset before uploading its document.");

  const record = await loadDocumentOwner(ownerType, ownerId);
  const filename = governedDocumentName({ file, ownerType, record });
  const folderPath = governedFolderPath({ ownerType, record, fallbackYear: year });
  const destination = await ensureFolderPath(folderPath);
  const encodedName = encodeURIComponent(filename);
  const uploadPath = await driveItemPath(destination.id, `:/${encodedName}:/content`);

  const item = await graphRequest(uploadPath, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  return {
    itemId: item?.id || null,
    webUrl: item?.webUrl || null,
    fileName: item?.name || filename,
    mimeType: file.type || null,
    sizeBytes: Number(item?.size ?? file.size ?? 0),
    relativePath: [...folderPath, item?.name || filename].join("/"),
  };
}

export async function deleteBusinessDocumentFromOneDrive(itemId) {
  if (!itemId) return;
  const path = await driveItemPath(itemId);
  await graphRequest(path, { method: "DELETE" });
}
