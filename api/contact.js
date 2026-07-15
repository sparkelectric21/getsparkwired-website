"use strict";

const MAX_BODY_BYTES = 16 * 1024;
const MIN_SUBMISSION_MS = 2500;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const rateBuckets = new Map();
const allowedServices = new Set([
  "Spark Mount", "Spark Connect", "Spark Home", "Spark Illuminate", "Spark Wire", "Spark Restore",
]);

const limits = { name: 100, email: 254, phone: 30, city: 120, service: 40, message: 5000, website: 200, originatingPage: 500 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

async function readBody(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw Object.assign(new Error("too_large"), { status: 413 });
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalize(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_payload");
  const output = {};
  for (const field of Object.keys(limits)) {
    if (payload[field] !== undefined && typeof payload[field] !== "string") throw new Error("invalid_payload");
    output[field] = (payload[field] || "").trim();
    if (output[field].length > limits[field]) throw new Error("invalid_payload");
  }
  const startedAt = Number(payload.startedAt);
  if (!Number.isFinite(startedAt)) throw new Error("invalid_payload");
  output.startedAt = startedAt;
  return output;
}

function validate(data) {
  if (data.website) return "spam";
  if (Date.now() - data.startedAt < MIN_SUBMISSION_MS || data.startedAt > Date.now() + 60000) return "spam";
  if (!data.name || !data.email || !data.phone || !data.service || !data.message) return "invalid";
  if (!emailPattern.test(data.email) || !allowedServices.has(data.service)) return "invalid";
  return null;
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (rateBuckets.size > 1000) {
    for (const [key, times] of rateBuckets) if (!times.some((time) => now - time < RATE_WINDOW_MS)) rateBuckets.delete(key);
  }
  return recent.length > RATE_LIMIT;
}

function buildEmail(data, req) {
  const submittedAt = new Date().toISOString();
  const userAgent = String(req.headers["user-agent"] || "Not provided").slice(0, 500);
  const rows = [
    ["Submission date and time", submittedAt], ["Customer name", data.name], ["Email", data.email],
    ["Phone", data.phone], ["Location", data.city || "Not provided"], ["Selected solution", data.service],
    ["Project details", data.message], ["Originating page", data.originatingPage || "Not provided"], ["Browser user agent", userAgent],
  ];
  return {
    subject: `New Spark Electric Project Request - ${data.name}`,
    text: rows.map(([label, value]) => `${label}:\n${value}`).join("\n\n"),
    html: `<h1>New Spark Electric Project Request</h1>${rows.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value).replace(/\n/g, "<br>")}</p>`).join("")}`,
  };
}

async function deliver(data, req) {
  if (process.env.CONTACT_EMAIL_MODE === "test") return;
  if (process.env.CONTACT_EMAIL_MODE === "fail") throw new Error("simulated_provider_failure");
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL } = process.env;
  if (![CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL].every(Boolean)) throw new Error("missing_configuration");
  const content = buildEmail(data, req);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/email/sending/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLOUDFLARE_EMAIL_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: CONTACT_TO_EMAIL, from: CONTACT_FROM_EMAIL, replyTo: data.email, ...content }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(`provider_status_${response.status}`);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(res, 415, { error: "Unsupported content type" });
  if (Number(req.headers["content-length"] || 0) > MAX_BODY_BYTES) return json(res, 413, { error: "Request too large" });
  if (rateLimited(clientIp(req))) return json(res, 429, { error: "Too many requests" });
  try {
    const data = normalize(await readBody(req));
    const problem = validate(data);
    if (problem) return json(res, problem === "spam" ? 400 : 422, { error: "Invalid request" });
    await deliver(data, req);
    return json(res, 200, { ok: true });
  } catch (error) {
    if (error.status === 413) return json(res, 413, { error: "Request too large" });
    if (["SyntaxError", "TypeError"].includes(error.name) || error.message === "invalid_payload") return json(res, 400, { error: "Invalid request" });
    console.error("Contact email delivery failed", { reason: error.message });
    return json(res, 502, { error: "Unable to send request" });
  }
}

handler._test = { buildEmail, escapeHtml, normalize, validate, rateBuckets };
module.exports = handler;
