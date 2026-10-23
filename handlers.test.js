import { test } from "node:test";
import assert from "node:assert/strict";

// 本番の外部APIには一切アクセスしない。メソッドガード(非POST→405/401)だけを確認するスモークテスト。
function mockRes() {
  const r = { statusCode: 200, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

for (const name of ["gpt", "notion", "summary", "webhook"]) {
  test(`api/${name}.js rejects GET with 405`, async () => {
    const { default: handler } = await import(`../api/${name}.js`);
    const res = mockRes();
    await handler({ method: "GET", headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 405);
  });
}

test("api/webhook.js rejects wrong secret with 401", async () => {
  process.env.TLDV_WEBHOOK_SECRET = "test-secret";
  const { default: handler } = await import("../api/webhook.js");
  const res = mockRes();
  await handler({ method: "POST", headers: { "x-webhook-secret": "wrong" }, body: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("runtime is a patched Node.js line (informational)", () => {
  const [maj, min, pat] = process.versions.node.split(".").map(Number);
  const fixed = { 22: [22, 23, 4], 24: [24, 22, 1], 26: [26, 12, 1] }[maj];
  const ok = fixed && (min > fixed[1] || (min === fixed[1] && pat >= fixed[2]));
  console.log(`node ${process.version} -> ${ok ? "patched" : "NOT patched / unknown line"}`);
});

// ---- 共有パスワード認証 ----
for (const name of ["gpt", "notion", "summary", "auth"]) {
  test(`api/${name}.js rejects wrong password with 401`, async () => {
    process.env.APP_PASSWORD = "correct-pw";
    const { default: handler } = await import(`../api/${name}.js`);
    const res = mockRes();
    await handler({ method: "POST", headers: { "x-app-password": "wrong" }, body: {} }, res);
    assert.equal(res.statusCode, 401);
  });
}

test("api/clients.js rejects missing password with 401", async () => {
  process.env.APP_PASSWORD = "correct-pw";
  const { default: handler } = await import("../api/clients.js");
  const res = mockRes();
  await handler({ method: "GET", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("api/auth.js accepts correct password with 200", async () => {
  process.env.APP_PASSWORD = "correct-pw";
  const { default: handler } = await import("../api/auth.js");
  const res = mockRes();
  await handler({ method: "POST", headers: { "x-app-password": "correct-pw" }, body: {} }, res);
  assert.equal(res.statusCode, 200);
});

test("api/auth.js fails closed (500) when APP_PASSWORD is unset", async () => {
  delete process.env.APP_PASSWORD;
  const { default: handler } = await import("../api/auth.js");
  const res = mockRes();
  await handler({ method: "POST", headers: { "x-app-password": "anything" }, body: {} }, res);
  assert.equal(res.statusCode, 500);
});
