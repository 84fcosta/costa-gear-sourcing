import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import {
  ONE_DRIVE_APP_FOLDER_SCOPE,
  clearOneDriveAccessTokenProvider,
  configureOneDriveAccessTokenProvider,
} from "./oneDriveAppFolderService";

const clientId = (process.env.REACT_APP_MICROSOFT_CLIENT_ID || "").trim();
const authority = (process.env.REACT_APP_MICROSOFT_AUTHORITY || "https://login.microsoftonline.com/consumers").trim();
const configuredRedirectUri = (process.env.REACT_APP_MICROSOFT_REDIRECT_URI || "").trim();
const graphScopes = [ONE_DRIVE_APP_FOLDER_SCOPE];

let clientPromise = null;

function redirectUri() {
  if (configuredRedirectUri) return configuredRedirectUri;
  if (typeof window !== "undefined") return window.location.origin;
  return "https://ops.costagear.ca";
}

export function getMicrosoftOneDriveConfiguration() {
  return {
    configured: Boolean(clientId),
    clientIdPresent: Boolean(clientId),
    authority,
    redirectUri: redirectUri(),
    permission: ONE_DRIVE_APP_FOLDER_SCOPE,
  };
}

async function getClient() {
  if (!clientId) {
    throw new Error(
      "Microsoft OneDrive is not configured. Add REACT_APP_MICROSOFT_CLIENT_ID in the Vercel environment first."
    );
  }

  if (!clientPromise) {
    const client = new PublicClientApplication({
      auth: {
        clientId,
        authority,
        redirectUri: redirectUri(),
        postLogoutRedirectUri: redirectUri(),
      },
      cache: {
        cacheLocation: "localStorage",
      },
    });

    clientPromise = (async () => {
      await client.initialize();
      const redirectResult = await client.handleRedirectPromise();
      const account =
        redirectResult?.account ||
        client.getActiveAccount() ||
        client.getAllAccounts()[0] ||
        null;
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

async function acquireOneDriveToken() {
  const client = await getClient();
  const account = currentAccount(client);

  if (!account) {
    throw new Error("OneDrive is not connected. Use Connect OneDrive in the Expenses module first.");
  }

  try {
    const response = await client.acquireTokenSilent({
      account,
      scopes: graphScopes,
    });
    return response.accessToken;
  } catch (error) {
    if (
      error instanceof InteractionRequiredAuthError ||
      ["interaction_required", "consent_required", "login_required"].includes(error?.errorCode)
    ) {
      throw new Error("OneDrive authorization needs to be renewed. Use Connect OneDrive again.");
    }
    throw error;
  }
}

if (clientId) {
  configureOneDriveAccessTokenProvider(acquireOneDriveToken);
} else {
  clearOneDriveAccessTokenProvider();
}

export async function getMicrosoftOneDriveAuthState() {
  if (!clientId) {
    return {
      configured: false,
      connected: false,
      accountName: null,
      username: null,
    };
  }

  const client = await getClient();
  const account = currentAccount(client);
  return {
    configured: true,
    connected: Boolean(account),
    accountName: account?.name || null,
    username: account?.username || null,
  };
}

export async function connectMicrosoftOneDrive() {
  const client = await getClient();
  const response = await client.loginPopup({ scopes: graphScopes });
  const account = response?.account || currentAccount(client);
  if (!account) throw new Error("Microsoft sign-in completed without returning an account.");
  client.setActiveAccount(account);

  const tokenResponse = await client.acquireTokenSilent({
    account,
    scopes: graphScopes,
  });
  if (!tokenResponse?.accessToken) throw new Error("Microsoft did not return a Graph access token.");

  return {
    configured: true,
    connected: true,
    accountName: account.name || null,
    username: account.username || null,
  };
}
