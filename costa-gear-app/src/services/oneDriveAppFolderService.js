const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export const ONE_DRIVE_APP_FOLDER_SCOPE = "Files.ReadWrite.AppFolder";

let accessTokenProvider = null;

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
    permission: ONE_DRIVE_APP_FOLDER_SCOPE,
    storage: "OneDrive App Folder",
  };
}

async function getAccessToken() {
  if (!accessTokenProvider) {
    throw new Error(
      "OneDrive authentication is not configured yet. Configure the Microsoft Entra client and provide a delegated access-token provider before uploading documents."
    );
  }

  const token = await accessTokenProvider();
  if (!token) throw new Error("OneDrive did not return a valid access token.");
  return token;
}

async function graphRequest(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${GRAPH_ROOT}${path}`, {
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

function safeFileName(value) {
  const cleaned = String(value || "document")
    .replace(/[\\/:*?"<>|#%]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "document";
}

function uploadName({ file, ownerType, ownerId, year }) {
  const extensionMatch = safeFileName(file.name).match(/(\.[^.]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : "";
  const rawBase = extension ? safeFileName(file.name).slice(0, -extension.length) : safeFileName(file.name);
  const shortOwner = String(ownerId || "record").slice(0, 8);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return safeFileName(`${year}_${ownerType}_${shortOwner}_${stamp}_${rawBase}${extension}`);
}

export async function getOneDriveAppFolder() {
  return graphRequest("/me/drive/special/approot?$select=id,name,webUrl,parentReference");
}

export async function testOneDriveConnection() {
  const folder = await getOneDriveAppFolder();
  return {
    connected: true,
    folderId: folder?.id || null,
    folderName: folder?.name || "App Folder",
    webUrl: folder?.webUrl || null,
  };
}

export async function uploadBusinessDocument({ file, ownerType, ownerId, year }) {
  if (!file) throw new Error("Choose a document before uploading.");
  if (!ownerId) throw new Error("Save the expense or asset before uploading its document.");

  const filename = uploadName({ file, ownerType, ownerId, year });
  const encodedName = encodeURIComponent(filename);
  const item = await graphRequest(`/me/drive/special/approot:/${encodedName}:/content`, {
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
  };
}

export async function deleteBusinessDocumentFromOneDrive(itemId) {
  if (!itemId) return;
  await graphRequest(`/me/drive/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}
