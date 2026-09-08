import { supabase } from "../supabase";
import {
  configureOneDriveAccessTokenProvider,
} from "./oneDriveAppFolderService";

const CANONICAL_APP_ORIGIN = "https://ops.costagear.ca";
const ONE_DRIVE_APP_FOLDER_SCOPE = "Files.ReadWrite.AppFolder";
const BACKEND_FUNCTION = "onedrive-auth";

let backendTokenCache = null;

function isLocalDevelopment() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function returnPage() {
  if (typeof window === "undefined") return CANONICAL_APP_ORIGIN;
  return window.location.href;
}

async function invokeBackend(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(BACKEND_FUNCTION, {
    body: { action, ...payload },
  });

  if (error) {
    throw new Error(error.message || "OneDrive backend request failed.");
  }

  if (data?.error) {
    const backendError = new Error(data.error);
    backendError.code = data.code || null;
    backendError.needsConsent = Boolean(data.needsConsent);
    throw backendError;
  }

  return data || {};
}

function normalizeBackendState(state) {
  return {
    configured: Boolean(state?.configured),
    connected: Boolean(state?.connected),
    needsConsent: Boolean(state?.needsConsent),
    accountName: state?.accountName || null,
    username: state?.username || null,
    permission: state?.permission || ONE_DRIVE_APP_FOLDER_SCOPE,
    backend: true,
    lastError: state?.lastError || null,
  };
}

async function acquireBackendToken() {
  if (
    backendTokenCache?.accessToken &&
    Number(backendTokenCache.expiresAt || 0) > Date.now() + 60_000
  ) {
    return backendTokenCache.accessToken;
  }

  const token = await invokeBackend("token");
  if (!token?.accessToken) {
    throw new Error("OneDrive backend did not return a valid access token.");
  }

  backendTokenCache = {
    accessToken: token.accessToken,
    expiresAt: Number(token.expiresAt || (Date.now() + Number(token.expiresIn || 3600) * 1000)),
  };
  return backendTokenCache.accessToken;
}

export function getMicrosoftOneDriveConfiguration() {
  return {
    configured: true,
    clientIdPresent: false,
    authority: "backend-managed",
    redirectUri: `${process.env.REACT_APP_SUPABASE_URL || ""}/functions/v1/onedrive-callback`,
    permission: ONE_DRIVE_APP_FOLDER_SCOPE,
    persistentBackend: true,
  };
}

async function acquireOneDriveToken() {
  const state = await invokeBackend("status");
  if (!state?.configured) {
    throw new Error("OneDrive backend authentication is not configured.");
  }
  if (!state?.connected) {
    throw new Error("OneDrive persistent connection requires authorization. Use Reconnect OneDrive.");
  }
  return acquireBackendToken();
}

configureOneDriveAccessTokenProvider(acquireOneDriveToken);

export async function getMicrosoftOneDriveAuthState() {
  const backend = await invokeBackend("status");
  return normalizeBackendState(backend);
}

export async function connectMicrosoftOneDrive() {
  if (
    typeof window !== "undefined" &&
    !isLocalDevelopment() &&
    window.location.origin !== CANONICAL_APP_ORIGIN
  ) {
    window.location.replace(`${CANONICAL_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`);
    return { redirecting: true };
  }

  const backend = await invokeBackend("status");
  if (!backend?.configured) {
    throw new Error("OneDrive backend authentication is not configured.");
  }

  if (backend.connected) return normalizeBackendState(backend);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("cg:return-workspace", "expenses");
  }

  const authorization = await invokeBackend("authorize", { returnUrl: returnPage() });
  if (!authorization?.authorizeUrl) {
    throw new Error("OneDrive backend did not return an authorization URL.");
  }

  if (typeof window !== "undefined") {
    window.location.assign(authorization.authorizeUrl);
  }
  return { redirecting: true };
}
