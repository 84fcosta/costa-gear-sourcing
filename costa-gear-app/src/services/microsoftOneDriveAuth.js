import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import {
  ONE_DRIVE_FILES_SCOPE,
  clearOneDriveAccessTokenProvider,
  configureOneDriveAccessTokenProvider,
} from "./oneDriveAppFolderService";

const DEFAULT_MICROSOFT_CLIENT_ID = "27622880-a323-4be9-a1e7-8f23ed948f7c";
const CANONICAL_APP_ORIGIN = "https://ops.costagear.ca";
const clientId = (process.env.REACT_APP_MICROSOFT_CLIENT_ID || DEFAULT_MICROSOFT_CLIENT_ID).trim();
const authority = (process.env.REACT_APP_MICROSOFT_AUTHORITY || "https://login.microsoftonline.com/consumers").trim();
const configuredRedirectUri = (process.env.REACT_APP_MICROSOFT_REDIRECT_URI || "").trim();
const graphScopes = [ONE_DRIVE_FILES_SCOPE];

let clientPromise = null;

function isLocalDevelopment() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
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

export function getMicrosoftOneDriveConfiguration() {
  return {
    configured: Boolean(clientId),
    clientIdPresent: Boolean(clientId),
    authority,
    redirectUri: redirectUri(),
    permission: ONE_DRIVE_FILES_SCOPE,
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
      const account = redirectResult?.account || client.getActiveAccount() || client.getAllAccounts()[0] || null;
      if (account) client.setActiveAccount(account);
      return client;
    })();
  }

  return clientPromise;
}

function currentAccount(client) {
  const account = client.getActiveAccount() || client.getAllAccounts()[0] || null;
  if (account && !client.getActiveAccount()) client.setActiveAccount(account);
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

async function acquireOneDriveToken() {
  const client = await getClient();
  const account = currentAccount(client);
  if (!account) throw new Error("OneDrive is not connected. Use Connect OneDrive in the Expenses module first.");

  try {
    const response = await client.acquireTokenSilent({ account, scopes: graphScopes });
    return response.accessToken;
  } catch (error) {
    if (interactionRequired(error)) {
      throw new Error("OneDrive authorization needs to be renewed. Use Connect OneDrive again.");
    }
    throw error;
  }
}

if (clientId) configureOneDriveAccessTokenProvider(acquireOneDriveToken);
else clearOneDriveAccessTokenProvider();

export async function getMicrosoftOneDriveAuthState() {
  if (!clientId) {
    return { configured: false, connected: false, needsConsent: false, accountName: null, username: null };
  }

  const client = await getClient();
  const account = currentAccount(client);
  if (!account) {
    return { configured: true, connected: false, needsConsent: false, accountName: null, username: null };
  }

  try {
    await client.acquireTokenSilent({ account, scopes: graphScopes });
    return {
      configured: true,
      connected: true,
      needsConsent: false,
      accountName: account.name || null,
      username: account.username || null,
    };
  } catch (error) {
    if (!interactionRequired(error)) throw error;
    return {
      configured: true,
      connected: false,
      needsConsent: true,
      accountName: account.name || null,
      username: account.username || null,
    };
  }
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

  const client = await getClient();
  const account = currentAccount(client);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("cg:return-workspace", "expenses");
  }

  if (account) {
    try {
      await client.acquireTokenSilent({ account, scopes: graphScopes });
      client.setActiveAccount(account);
      return {
        configured: true,
        connected: true,
        needsConsent: false,
        accountName: account.name || null,
        username: account.username || null,
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

  await client.loginRedirect({
    scopes: graphScopes,
    redirectUri: redirectUri(),
    redirectStartPage: returnPage(),
  });

  return { redirecting: true };
}
