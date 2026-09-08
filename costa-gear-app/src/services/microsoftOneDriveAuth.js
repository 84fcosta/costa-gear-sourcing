import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import { supabase } from "../supabase";
import {
  clearOneDriveAccessTokenProvider,
  configureOneDriveAccessTokenProvider,
} from "./oneDriveAppFolderService";

const DEFAULT_MICROSOFT_CLIENT_ID = "27622880-a323-4be9-a1e7-8f23ed948f7c";
const CANONICAL_APP_ORIGIN = "https://ops.costagear.ca";
const ONE_DRIVE_APP_FOLDER_SCOPE = "Files.ReadWrite.AppFolder";
const LOGIN_HINT_STORAGE_KEY = "cg:microsoft-login-hint";
const BACKEND_FUNCTION = "onedrive-auth";
const clientId = (process.env.REACT_APP_MICROSOFT_CLIENT_ID || DEFAULT_MICROSOFT_CLIENT_ID).trim();
const authority = (process.env.REACT_APP_MICROSOFT_AUTHORITY || "https://login.microsoftonline.com/consumers").trim();
const configuredRedirectUri = (process.env.REACT_APP_MICROSOFT_REDIRECT_URI || "").trim();
const graphScopes = [ONE_DRIVE_APP_FOLDER_SCOPE];

let clientPromise = null;
let backendTokenCache = null;

function isLocalDevelopment() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function isTopLevelWindow() {
  if (typeof window === "undefined") return false;
  try {
    return window.self === window.top;
  } catch (_) {
    return false;
  }
}

function redirectUri() {
  if (configuredRedirectUri) return configuredRedirectUri;
  if (isLocalDevelopment()) return window.location.origin;
  return CANONICAL_APP_ORIGIN;
}

function returnPage() {
  if (typeof window === "undefined") return CANONICAL_APP_ORIGIN;
  return window.location.href;
}

function readLoginHint() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(LOGIN_HINT_STORAGE_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

function accountLoginHint(account) {
  return String(
    account?.loginHint ||
    account?.idTokenClaims?.login_hint ||
    account?.username ||
    ""
  ).trim();
}

function rememberAccount(client, account) {
  if (!account) return null;
  client.setActiveAccount(account);
  const hint = accountLoginHint(account);
  if (hint && typeof window !== "undefined") {
    try { window.localStorage.setItem(LOGIN_HINT_STORAGE_KEY, hint); } catch (_) {}
  }
  return account;
}

function interactionRequired(error) {
  const code = String(error?.errorCode || error?.code || "").toLowerCase();
  return (
    error instanceof InteractionRequiredAuthError ||
    [
      "interaction_required",
      "consent_required",
      "login_required",
      "monitor_window_timeout",
      "timed_out",
      "iframe_closed_prematurely",
    ].includes(code)
  );
}

async function invokeBackend(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(BACKEND_FUNCTION, {
    body: { action, ...payload },
  });

  if (error) {
    const backendError = new Error(error.message || "OneDrive backend request failed.");
    backendError.backendUnavailable = true;
    throw backendError;
  }

  if (data?.error) {
    const backendError = new Error(data.error);
    backendError.code = data.code || null;
    backendError.needsConsent = Boolean(data.needsConsent);
    throw backendError;
  }

  return data || {};
}

async function getBackendStatus() {
  try {
    return await invokeBackend("status");
  } catch (_) {
    return null;
  }
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

async function restoreMicrosoftSession(client) {
  if (!isTopLevelWindow()) return null;
  const hint = readLoginHint();
  if (!hint) return null;

  try {
    const response = await client.ssoSilent({
      scopes: graphScopes,
      loginHint: hint,
      redirectUri: redirectUri(),
      prompt: "none",
    });
    return rememberAccount(client, response?.account || null);
  } catch (error) {
    if (interactionRequired(error)) return null;
    throw error;
  }
}

export function getMicrosoftOneDriveConfiguration() {
  return {
    configured: Boolean(clientId),
    clientIdPresent: Boolean(clientId),
    authority,
    redirectUri: redirectUri(),
    permission: ONE_DRIVE_APP_FOLDER_SCOPE,
    persistentBackend: true,
  };
}

async function getClient() {
  if (!clientId) throw new Error("Microsoft OneDrive is not configured.");

  if (!clientPromise) {
    const client = new PublicClientApplication({
      auth: {
        clientId,
        authority,
        redirectUri: redirectUri(),
        postLogoutRedirectUri: redirectUri(),
        navigateToLoginRequestUrl: true,
      },
      cache: { cacheLocation: "localStorage" },
    });

    clientPromise = (async () => {
      await client.initialize();
      const redirectResult = await client.handleRedirectPromise();
      let account = redirectResult?.account || client.getActiveAccount() || client.getAllAccounts()[0] || null;
      if (account) account = rememberAccount(client, account);
      else account = await restoreMicrosoftSession(client);
      return client;
    })();
  }

  return clientPromise;
}

function currentAccount(client) {
  const account = client.getActiveAccount() || client.getAllAccounts()[0] || null;
  if (account && !client.getActiveAccount()) rememberAccount(client, account);
  return account;
}

async function acquireBrowserToken() {
  const client = await getClient();
  let account = currentAccount(client);
  if (!account) account = await restoreMicrosoftSession(client);
  if (!account) {
    throw new Error("OneDrive authorization needs to be renewed. Use Reconnect OneDrive in the Expenses module.");
  }

  try {
    const response = await client.acquireTokenSilent({ account, scopes: graphScopes });
    rememberAccount(client, response?.account || account);
    return response.accessToken;
  } catch (error) {
    if (interactionRequired(error)) {
      throw new Error("OneDrive authorization needs to be renewed. Use Reconnect OneDrive in the Expenses module.");
    }
    throw error;
  }
}

async function acquireOneDriveToken() {
  const backend = await getBackendStatus();
  if (backend?.configured && backend?.connected) {
    return acquireBackendToken();
  }
  return acquireBrowserToken();
}

if (clientId) configureOneDriveAccessTokenProvider(acquireOneDriveToken);
else clearOneDriveAccessTokenProvider();

async function getBrowserAuthState() {
  if (!clientId) {
    return { configured: false, connected: false, needsConsent: false, accountName: null, username: null };
  }

  const client = await getClient();
  let account = currentAccount(client);
  if (!account) account = await restoreMicrosoftSession(client);
  if (!account) {
    const hint = readLoginHint();
    return {
      configured: true,
      connected: false,
      needsConsent: Boolean(hint),
      accountName: null,
      username: hint || null,
      backend: false,
    };
  }

  try {
    const response = await client.acquireTokenSilent({ account, scopes: graphScopes });
    account = rememberAccount(client, response?.account || account);
    return {
      configured: true,
      connected: true,
      needsConsent: false,
      accountName: account?.name || null,
      username: account?.username || readLoginHint() || null,
      backend: false,
    };
  } catch (error) {
    if (!interactionRequired(error)) throw error;
    return {
      configured: true,
      connected: false,
      needsConsent: true,
      accountName: account.name || null,
      username: account.username || readLoginHint() || null,
      backend: false,
    };
  }
}

export async function getMicrosoftOneDriveAuthState() {
  const backend = await getBackendStatus();
  if (backend?.configured) return normalizeBackendState(backend);
  return getBrowserAuthState();
}

async function connectBrowserOneDrive() {
  if (
    typeof window !== "undefined" &&
    !isLocalDevelopment() &&
    window.location.origin !== CANONICAL_APP_ORIGIN
  ) {
    window.location.replace(`${CANONICAL_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`);
    return { redirecting: true };
  }

  const client = await getClient();
  let account = currentAccount(client);
  if (!account) account = await restoreMicrosoftSession(client);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("cg:return-workspace", "expenses");
  }

  if (account) {
    try {
      const response = await client.acquireTokenSilent({ account, scopes: graphScopes });
      account = rememberAccount(client, response?.account || account);
      return {
        configured: true,
        connected: true,
        needsConsent: false,
        accountName: account?.name || null,
        username: account?.username || readLoginHint() || null,
        backend: false,
      };
    } catch (error) {
      if (!interactionRequired(error)) throw error;
      await client.acquireTokenRedirect({
        account,
        scopes: graphScopes,
        redirectUri: redirectUri(),
        redirectStartPage: returnPage(),
      });
      return { redirecting: true };
    }
  }

  const loginHint = readLoginHint();
  await client.loginRedirect({
    scopes: graphScopes,
    redirectUri: redirectUri(),
    redirectStartPage: returnPage(),
    ...(loginHint ? { loginHint } : {}),
  });

  return { redirecting: true };
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

  const backend = await getBackendStatus();
  if (backend?.configured) {
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

  return connectBrowserOneDrive();
}
