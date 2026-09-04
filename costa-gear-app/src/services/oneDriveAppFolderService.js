import { supabase } from "../supabase";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export const ONE_DRIVE_APP_FOLDER_SCOPE = "Files.ReadWrite.AppFolder";

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

function cleanNamePart(value, fallback = "Document", maxLength = 56) {
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

function fileExtension(file) {
  const match = String(file?.name || "").match(/\.([A-Za-z0-9]{1,10})$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function paddedNumber(value, width = 4) {
  const normalized = String(Number(value));
  return /^\d+$/.test(normalized) ? normalized.padStart(width, "0") : cleanNamePart(value, "Record", 20);
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

function governedDocumentName({ file, ownerType, record }) {
  const extension = fileExtension(file);

  if (ownerType === "expense") {
    const key = paddedNumber(record.expense_number);
    const vendor = cleanNamePart(record.vendor, "Vendor", 36);
    const description = cleanNamePart(record.description, "Expense", 60);
    const date = cleanNamePart(record.expense_date, "Date", 10);
    return `CG_EXP_${key}_${vendor}_${description}_${date}${extension}`;
  }

  const key = cleanNamePart(record.asset_code || String(record.id).slice(0, 8), "Asset", 24);
  const vendor = cleanNamePart(record.vendor, "Vendor", 36);
  const description = cleanNamePart(record.asset_name, "Asset", 60);
  const date = cleanNamePart(record.purchase_date, "Date", 10);
  return `CG_AST_${key}_${vendor}_${description}_${date}${extension}`;
}

function governedFolderPath({ ownerType, record, fallbackYear }) {
  const year = String(record.tax_year || fallbackYear || new Date().getFullYear());

  if (ownerType === "expense" || ownerType === "asset") {
    return ["01_FINANCE", "Expenses", cleanNamePart(year, String(new Date().getFullYear()), 4)];
  }

  return [];
}

async function findChildFolder(parentId, name) {
  const response = await graphRequest(
    `/me/drive/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=200`
  );
  return (response?.value || []).find(
    (item) => item?.folder && String(item.name).toLowerCase() === String(name).toLowerCase()
  ) || null;
}

async function ensureChildFolder(parentId, name) {
  const existing = await findChildFolder(parentId, name);
  if (existing) return existing;

  try {
    return await graphRequest(`/me/drive/items/${encodeURIComponent(parentId)}/children`, {
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

export async function getOneDriveAppFolder() {
  return graphRequest("/me/drive/special/approot?$select=id,name,webUrl,parentReference,eTag,createdDateTime,lastModifiedDateTime,size,folder");
}

export async function listOneDriveChildren(parentId) {
  const items = [];
  let next = `/me/drive/items/${encodeURIComponent(parentId)}/children?$select=id,name,webUrl,size,eTag,createdDateTime,lastModifiedDateTime,parentReference,file,folder&$top=200`;

  while (next) {
    const response = await graphRequest(next);
    items.push(...(response?.value || []));
    next = response?.["@odata.nextLink"] || null;
  }

  return items;
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

  const record = await loadDocumentOwner(ownerType, ownerId);
  const filename = governedDocumentName({ file, ownerType, record });
  const folderPath = governedFolderPath({ ownerType, record, fallbackYear: year });
  const destination = await ensureFolderPath(folderPath);
  const encodedName = encodeURIComponent(filename);

  const item = await graphRequest(`/me/drive/items/${encodeURIComponent(destination.id)}:/${encodedName}:/content`, {
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
  await graphRequest(`/me/drive/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}
