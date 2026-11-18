import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, clearCsrf, prepareAuth } from "../src/lib/api";
test("an offline CSRF bootstrap is classified as a recoverable connection failure", async () => {
  const original = globalThis.fetch;
  clearCsrf();
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(
      () => api("/sessions/1/pause/", { method: "POST", body: "{}" }),
      (error) => error instanceof ApiError && error.status === 0,
    );
  } finally {
    globalThis.fetch = original;
    clearCsrf();
  }
});

test("startup retries only safe GETs, then sends login once with a valid token", async () => {
  const original = globalThis.fetch;
  clearCsrf();
  const methods: string[] = [];
  let checks = 0,
    waiting = 0;
  globalThis.fetch = async (_input, options) => {
    const method = options?.method || "GET";
    methods.push(method);
    if (method === "GET") {
      if (++checks === 1) return new Response("Starting", { status: 503 });
      if (checks === 2) return new Response("<html>Starting</html>");
      return Response.json({ csrfToken: "awake" });
    }
    assert.equal(
      (options?.headers as Record<string, string>)["X-CSRFToken"],
      "awake",
    );
    return Response.json({ ok: true });
  };
  try {
    await prepareAuth(new AbortController().signal, () => waiting++);
    await api("/auth/login/", { method: "POST", body: "{}" });
    assert.deepEqual(methods, ["GET", "GET", "GET", "POST"]);
    assert.ok(waiting > 0);
  } finally {
    globalThis.fetch = original;
    clearCsrf();
  }
});

test("closing startup cancels an in-flight check without sending credentials", async () => {
  const original = globalThis.fetch;
  clearCsrf();
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async (_input, options) => {
    calls++;
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () =>
        reject(new TypeError("aborted")),
      );
      controller.abort();
    });
  };
  try {
    await assert.rejects(() => prepareAuth(controller.signal, () => {}), {
      name: "AbortError",
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    clearCsrf();
  }
});

test("startup does not retry permanent errors or ambiguous authentication writes", async () => {
  const original = globalThis.fetch;
  clearCsrf();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 403 });
  };
  try {
    await assert.rejects(
      () => prepareAuth(new AbortController().signal, () => {}),
      (e) => e instanceof ApiError && e.status === 403,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async (_input, options) => {
      if (options?.method === "POST") {
        calls++;
        throw new TypeError("Connection lost after sending");
      }
      return Response.json({ csrfToken: "awake" });
    };
    await prepareAuth(new AbortController().signal, () => {});
    await assert.rejects(
      () => api("/auth/register/", { method: "POST", body: "{}" }),
      (e) => e instanceof ApiError && e.status === 0,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    clearCsrf();
  }
});
test("a token rotated in another tab is refreshed once before retrying the unapplied mutation", async () => {
  const original = globalThis.fetch;
  clearCsrf();
  const calls: { path: string; token?: string }[] = [];
  let tokens = 0,
    mutations = 0;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    calls.push({
      path,
      token: (options?.headers as Record<string, string>)?.["X-CSRFToken"],
    });
    if (path.endsWith("/csrf/"))
      return Response.json({ csrfToken: `token-${++tokens}` });
    if (++mutations === 1)
      return Response.json(
        { detail: "CSRF Failed: token incorrect." },
        { status: 403 },
      );
    return Response.json({ status: "paused" });
  };
  try {
    assert.deepEqual(
      await api("/sessions/1/pause/", { method: "POST", body: "{}" }),
      { status: "paused" },
    );
    assert.equal(calls.length, 4);
    assert.equal(calls[1].token, "token-1");
    assert.equal(calls[3].token, "token-2");
  } finally {
    globalThis.fetch = original;
    clearCsrf();
  }
});
