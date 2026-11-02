import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, clearCsrf } from "../src/lib/api";
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
