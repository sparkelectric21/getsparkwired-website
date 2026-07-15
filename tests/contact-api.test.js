"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/contact");

function request(overrides = {}) {
  const { headers = {}, body = {}, ...requestOverrides } = overrides;
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `test-${Math.random()}`, "user-agent": "Node test", ...headers },
    body: {
      name: "Jane Customer", email: "jane@example.com", phone: "251-555-0100", city: "Fairhope",
      service: "Spark Connect", message: "Please improve my network.", website: "",
      startedAt: String(Date.now() - 5000), originatingPage: "https://getsparkwired.com/contact",
      ...body,
    },
    ...requestOverrides,
  };
}

function response() {
  return {
    headers: {}, setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

async function invoke(req) {
  const res = response();
  await handler(req, res);
  return res;
}

test.beforeEach(() => {
  process.env.CONTACT_EMAIL_MODE = "test";
  handler._test.rateBuckets.clear();
});

test("accepts a valid submission without sending in test mode", async () => {
  const res = await invoke(request());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("rejects a missing required field", async () => {
  const res = await invoke(request({ body: { name: "" } }));
  assert.equal(res.statusCode, 422);
});

test("rejects an invalid email", async () => {
  const res = await invoke(request({ body: { email: "not-an-email" } }));
  assert.equal(res.statusCode, 422);
});

test("rejects the honeypot", async () => {
  const res = await invoke(request({ body: { website: "bot.example" } }));
  assert.equal(res.statusCode, 400);
});

test("rejects an unrealistically fast submission", async () => {
  const res = await invoke(request({ body: { startedAt: String(Date.now()) } }));
  assert.equal(res.statusCode, 400);
});

test("rejects an oversized field", async () => {
  const res = await invoke(request({ body: { message: "x".repeat(5001) } }));
  assert.equal(res.statusCode, 400);
});

test("rejects an oversized request body", async () => {
  const res = await invoke(request({ headers: { "content-length": "20000" } }));
  assert.equal(res.statusCode, 413);
});

test("rejects unsupported methods", async () => {
  const res = await invoke(request({ method: "GET" }));
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("returns a non-2xx response when the provider fails", async () => {
  process.env.CONTACT_EMAIL_MODE = "fail";
  const originalError = console.error;
  console.error = () => {};
  const res = await invoke(request());
  console.error = originalError;
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "Unable to send request" });
});

test("escapes customer content in HTML email", () => {
  const req = request({ body: { name: "<b>Jane</b>" } });
  const data = handler._test.normalize(req.body);
  const email = handler._test.buildEmail(data, req);
  assert.match(email.html, /&lt;b&gt;Jane&lt;\/b&gt;/);
  assert.doesNotMatch(email.html, /<b>Jane<\/b>/);
});
