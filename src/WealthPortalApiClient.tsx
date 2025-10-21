// WealthPortalApiClient.tsx
// Based on ApiClient (1).tsx pattern - Frontend with Bearer tokens

const config = {
  hisafeUrl: process.env.REACT_APP_HISAFE_URL || "https://demo.highgear.app/forms/fs",
  hisafeApiVersion: "9.0.0",
  featureType: "PORTAL",
  featureKey: process.env.REACT_APP_FEATURE_KEY || "parago",
  clientId: process.env.REACT_APP_CLIENT_ID || "c1aff4bbdb082879b8965292df919011"
};

function getHisafeApiUrl(path: string): string {
  const prefix = config.hisafeUrl + "/api/" + config.hisafeApiVersion;
  return path.startsWith("/") ? prefix + path : prefix + "/" + path;
}

function encodeBase64Url(value: Uint8Array) {
  const base64 = btoa(String.fromCharCode.apply(null, value as any as number[]));
  return base64.split("=")[0].replace(/\+/g, "-").replace(/\//g, "_");
}

async function generateCodeChallenge(codeVerifier: string) {
  const codeChallengeRaw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return encodeBase64Url(new Uint8Array(codeChallengeRaw));
}

function generateRandomBase64Url(length: number) {
  const codeVerifierRaw = new Uint8Array(length);
  crypto.getRandomValues(codeVerifierRaw);
  return encodeBase64Url(codeVerifierRaw);
}

const alwaysAddParams = new URLSearchParams([["featureType", config.featureType], ["feature", config.featureKey]]);
const headers: Record<string, string> = {
  "Content-Type": 'application/json',
  "X-Timezone-IANA": Intl.DateTimeFormat().resolvedOptions().timeZone,
  "X-Locale": Intl.NumberFormat().resolvedOptions().locale,
};

const TOKEN_LOCAL_STORAGE_KEY = "HISAFE_AUTH_TOKEN";
const CODE_VERIFIER_SESSION_STORAGE_KEY = "HISAFE_CODE_VERIFIER/";

export async function getAuthorizeUrl(logout: boolean = false): Promise<string> {
  const codeVerifier = generateRandomBase64Url(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomBase64Url(8);

  sessionStorage[CODE_VERIFIER_SESSION_STORAGE_KEY + state] = codeVerifier;

  const params = new URLSearchParams([
      ["feature_type", config.featureType],
      ["feature_key", config.featureKey],
      ["response_type", "code"],  // ← CHANGED to "code"
      ["client_id", config.clientId],
      ["redirect_uri", window.location.href],
      ["code_challenge_method", "S256"],
      ["code_challenge", codeChallenge],
      ["state", state],
      ["confirm", JSON.stringify(logout)],
    ]);

    return getHisafeApiUrl("oauth2/authorize?" + params);
}

async function initAuth(signal: AbortSignal) {
  console.log("🔐 initAuth called");
  console.log("📋 Current Authorization header:", headers["Authorization"]);
  
  if (headers["Authorization"]) {
    console.log("✅ Already have auth token, skipping");
    return;
  }

  type HisafeTokens = {
    access_token: string
    token_type: "Bearer"
  }

  const params = new URLSearchParams(window.location.search);

  const authCode = params.get("code");
  const state = params.get("state");
  
  console.log("🔍 URL params - code:", authCode ? "present" : "missing", "state:", state ? "present" : "missing");
  
  if (authCode && state) {
    console.log("🔄 Exchanging code for token...");
    
    // Remove from URL
    params.delete("code");
    params.delete("state");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.origin + window.location.pathname + (qs ? "?" + qs : ""));

    try {
      // Exchange code for token
      const result = await requestImpl<HisafeTokens>("POST", "oauth2/token", signal, {
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: authCode,
          client_id: config.clientId,
          code_verifier: sessionStorage[CODE_VERIFIER_SESSION_STORAGE_KEY + state],
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });

      console.log("✅ Got token:", result);
      sessionStorage.removeItem(CODE_VERIFIER_SESSION_STORAGE_KEY + state);
      localStorage[TOKEN_LOCAL_STORAGE_KEY] = JSON.stringify(result);
    } catch (e) {
      console.error("❌ Token exchange failed:", e);
      throw e;
    }
  }

  if (localStorage[TOKEN_LOCAL_STORAGE_KEY]) {
    const { token_type, access_token } = JSON.parse(localStorage[TOKEN_LOCAL_STORAGE_KEY]) as HisafeTokens
    headers["Authorization"] = token_type + " " + access_token;
    console.log("✅ Set Authorization header from localStorage");
  } else {
    console.log("❌ No token in localStorage, redirecting to login");
    window.location.href = await getAuthorizeUrl();
  }
}

async function request<T>(method: "GET" | "POST" | "PATCH", url: string, signal: AbortSignal, otherArgs?: Partial<RequestInit>, on401?:() => T): Promise<T> {
  await initAuth(signal);
  return await requestImpl(method, url, signal, otherArgs, on401);
}

async function requestImpl<T>(method: "GET" | "POST" | "PATCH", url: string, signal: AbortSignal, otherArgs?: Partial<RequestInit>, on401?:() => T): Promise<T> {
  url += (url.includes("?") ? "&" : "?") + alwaysAddParams;
  const response = await fetch(getHisafeApiUrl(url), {
    method,
    mode: "cors",
    cache: "no-cache",
    redirect: "follow",
    referrerPolicy: 'no-referrer',
    signal,
    // NO credentials: "include" - using Bearer token instead
    ...otherArgs,
    headers: {
      ...headers,
      ...(otherArgs?.headers)
    }
  });
  
  if (response.status >= 200 && response.status <= 299) {
    return await response.json() as T;
  } else if (response.status === 401) {
    window.location.href = await getAuthorizeUrl();
    if (on401)
      return on401();
    throw new Error("Unauthorized - redirecting to login");
  } else {
    let message = await response.text();
    if (message[0] === "{") {
      const jsonValue: any = JSON.parse(message);
      if (jsonValue.message)
        message = jsonValue.message;
    }

    console.error("Request failed with " + response.status, message, response);
    throw new Error(`Request failed with ${response.status}`);
  }
}

// Type definitions
export type SelfResult = {
  name: string;
}

export type TaskFieldData = { [fieldName: string]: unknown } & Partial<{
  status: {
    type: string;
    name: string;
    id: number;
  }
}>

export type ListResult = { 
  task_id: number; 
  fields: TaskFieldData 
};

export type SeriesDataValues = {
  type: "list";
  listResult: ListResult[];
  listResultCountBeforeLimiting: number;
}

export type PortalDataValues = { 
  [seriesId: number]: SeriesDataValues | undefined 
};

export type PortalMetadata = {
  title?: string;
  subtitle?: { html: string };
  maxFileSizePerUploadBytes: number;
  dashboardComponents: {
    type: "list" | "gauge" | "chart" | "iframe" | "text";
    series: {
      id: number;
      dataSourceId: number;
    }[];
  }[];
  createButtons: { formId: number; label: string }[];
}

export type TaskMetadata = {
  initialState: TaskFieldData;
  formId: number;
  maxFileSizePerUploadBytes: number;
  editSessionToken: string;
}

// API Functions
export async function testAuth(signal: AbortSignal): Promise<SelfResult | null> {
  try {
    return await request("GET", "self", signal, {}, () => null);
  } catch (e) {
    console.error("Auth test failed:", e);
    return null;
  }
}

export async function getPortalMetadata(signal: AbortSignal): Promise<PortalMetadata> {
  return await request("GET", "portal/metadata", signal);
}

export async function getPortalData(signal: AbortSignal, seriesIds: number[]): Promise<PortalDataValues> {
  const qs = seriesIds.map(s => "seriesId=" + s).join("&");
  return await request("GET", "portal/load?" + qs, signal); 
}

export async function getTaskData(signal: AbortSignal, taskId: number): Promise<TaskMetadata> {
  return await request("GET", "task/" + taskId, signal); 
}

export async function editTaskData(
  signal: AbortSignal, 
  taskId: number, 
  editSessionToken: string, 
  fields: { [fieldName: string]: any }
): Promise<{ task_id: number; was_task_modified: boolean }> {
  return await request("PATCH", "task/" + taskId, signal, {
    body: JSON.stringify({
      fields,
      options: { editSessionToken }
    }),
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export async function uploadFile(signal: AbortSignal, file: File): Promise<string> {
  await initAuth(signal);
  
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(getHisafeApiUrl("file-blob?" + alwaysAddParams), {
    method: "POST",
    mode: "cors",
    signal,
    body: formData,
    headers: {
      "Authorization": headers["Authorization"]  // Include Bearer token
    }
  });
  
  if (response.ok) {
    const result = await response.json();
    return result[0].blob_id;
  }
  
  throw new Error("File upload failed");
}

export function getTaskFileUrl(editSessionToken: string, fieldName: string, fileId: number): string {
  return getHisafeApiUrl(`task-edit-session/${editSessionToken}/files/${fieldName}/${fileId}?` + alwaysAddParams);
}
