export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown,
  ) {
    super(message);
  }
}
let csrfToken = "";
export async function csrf() {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/csrf/", {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(
      "The connection was interrupted. Reconnect to sync your session.",
      0,
      null,
    );
  }
  if (!response.ok)
    throw new ApiError(
      "Sesh could not connect. Please try again.",
      response.status,
      null,
    );
  const data = await response.json();
  csrfToken = data.csrfToken || data.csrf_token || data.token || "";
  return csrfToken;
}
function errorMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    if (typeof d.error === "string") return d.error;
    return Object.entries(d)
      .map(
        ([key, val]) =>
          `${key === "non_field_errors" ? "" : key.replaceAll("_", " ") + ": "}${Array.isArray(val) ? val.join(" ") : String(val)}`,
      )
      .join(" ");
  }
  return "Something went wrong. Please try again.";
}
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retriedCsrf = false,
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !csrfToken) await csrf();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      ...options,
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: options.signal || AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(
      "The connection was interrupted. Reconnect to sync your session.",
      0,
      null,
    );
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (
    response.status === 403 &&
    !retriedCsrf &&
    /csrf/i.test(errorMessage(data))
  ) {
    clearCsrf();
    await csrf();
    return api<T>(path, options, true);
  }
  if (!response.ok)
    throw new ApiError(errorMessage(data), response.status, data);
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.server_now
  )
    data.observed_at = Date.now();
  return data as T;
}
export function clearCsrf() {
  csrfToken = "";
}

export async function signOut() {
  await api("/auth/logout/", { method: "POST" });
  window.location.assign("/");
}
