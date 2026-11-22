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
export async function csrf(signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/csrf/", {
      credentials: "include",
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
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
  const data = await response.json().catch(() => null);
  const token = data?.csrfToken || data?.csrf_token || data?.token;
  if (typeof token !== "string" || !token)
    throw new ApiError(
      "Sesh is still connecting. Please try again shortly.",
      503,
      null,
    );
  csrfToken = token;
  return csrfToken;
}

/** Wake free hosting with safe GETs before sending an account mutation once. */
export async function prepareAuth(signal: AbortSignal, onWaiting: () => void) {
  const deadline = AbortSignal.timeout(90000);
  const stop = AbortSignal.any([signal, deadline]);
  const hint = setTimeout(onWaiting, 2000);
  try {
    while (!stop.aborted) {
      try {
        await csrf(stop);
        stop.throwIfAborted();
        return;
      } catch (error) {
        if (stop.aborted) break;
        if (
          !(error instanceof ApiError) ||
          ![0, 408, 502, 503, 504].includes(error.status)
        )
          throw error;
        onWaiting();
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          stop.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 2000);
        stop.addEventListener("abort", done, { once: true });
        if (stop.aborted) done();
      });
    }
    signal.throwIfAborted();
    throw new ApiError(
      "Sesh is taking longer than usual to connect. Please try again shortly. Your details are still here.",
      0,
      null,
    );
  } finally {
    clearTimeout(hint);
  }
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
export interface ApiOptions extends RequestInit {
  onRetry?: () => void;
}
export function isTemporaryApiError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    [0, 408, 500, 502, 503, 504].includes(error.status)
  );
}

// All application reads share recovery, not just the sign-in form. Writes are
// never replayed after ambiguous failures: the server may already have saved them.
export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { onRetry, ...requestOptions } = options;
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") return request<T>(path, requestOptions);
  const deadline = AbortSignal.timeout(90000);
  const stop = options.signal
    ? AbortSignal.any([options.signal, deadline])
    : deadline;
  let attempt = 0;
  let lastError: unknown;
  while (!stop.aborted) {
    try {
      return await request<T>(path, {
        ...requestOptions,
        signal: AbortSignal.any([stop, AbortSignal.timeout(10000)]),
      });
    } catch (error) {
      lastError = error;
      if (stop.aborted) break;
      if (!isTemporaryApiError(error)) throw error;
      onRetry?.();
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        stop.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, Math.min(1000 * 2 ** attempt++, 8000));
      stop.addEventListener("abort", done, { once: true });
      if (stop.aborted) done();
    });
  }
  options.signal?.throwIfAborted();
  throw new ApiError(
    "Your connection to Sesh is taking longer than usual. We’ll reconnect automatically.",
    lastError instanceof ApiError ? lastError.status : 0,
    null,
  );
}

async function request<T = unknown>(
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
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    throw new ApiError("The connection was interrupted.", 0, null);
  }
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // A waking proxy can return an HTML loading page with status 200.
    if (response.ok) throw new ApiError("Sesh is reconnecting.", 503, null);
  }
  if (
    response.status === 403 &&
    !retriedCsrf &&
    /csrf/i.test(errorMessage(data))
  ) {
    clearCsrf();
    await csrf();
    return request<T>(path, options, true);
  }
  if (!response.ok)
    throw new ApiError(
      response.status >= 500
        ? "Sesh is temporarily unavailable. Reconnecting…"
        : errorMessage(data),
      response.status,
      data,
    );
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
