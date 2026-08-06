import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const MAX_BODY_BYTES = 4096;
const MAX_NAME_LENGTH = 50;
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

type RegistrationPayload = {
  firstName: string;
  lastName: string;
  partySize: number;
  turnstileToken: string;
  website: string;
};

function responseHeaders(origin?: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...(origin
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          Vary: "Origin",
        }
      : {}),
  };
}

function jsonResponse(status: number, code: string, origin?: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: responseHeaders(origin),
  });
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function parsePayload(body: unknown): RegistrationPayload | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  const allowedKeys = new Set([
    "firstName",
    "lastName",
    "partySize",
    "turnstileToken",
    "website",
  ]);

  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
  if (
    typeof record.firstName !== "string" ||
    typeof record.lastName !== "string" ||
    !Number.isInteger(record.partySize) ||
    typeof record.turnstileToken !== "string" ||
    typeof record.website !== "string"
  ) {
    return null;
  }

  const firstName = normalizeName(record.firstName);
  const lastName = normalizeName(record.lastName);
  const unsafeName = /[<>\p{Cc}\p{Cf}]/u;

  if (
    firstName.length < 1 ||
    firstName.length > MAX_NAME_LENGTH ||
    unsafeName.test(firstName) ||
    lastName.length < 1 ||
    lastName.length > MAX_NAME_LENGTH ||
    unsafeName.test(lastName) ||
    (record.partySize as number) < 1 ||
    (record.partySize as number) > 10 ||
    record.turnstileToken.length < 1 ||
    record.turnstileToken.length > 2048 ||
    record.website.length > 0
  ) {
    return null;
  }

  return {
    firstName,
    lastName,
    partySize: record.partySize as number,
    turnstileToken: record.turnstileToken,
    website: record.website,
  };
}

async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured");
  const expectedHostnames = new Set(
    (Deno.env.get("TURNSTILE_HOSTNAMES") ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
  if (expectedHostnames.size === 0) throw new Error("TURNSTILE_HOSTNAMES is not configured");

  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);
  if (remoteIp) formData.set("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(5000),
    },
  );

  if (!response.ok) return false;
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
    metadata?: { result_with_testing_key?: boolean };
  };
  const validTestResponse =
    Deno.env.get("TURNSTILE_ALLOW_TEST_RESPONSE") === "true" &&
    result.metadata?.result_with_testing_key === true;

  return result.success === true &&
    expectedHostnames.has(result.hostname?.toLowerCase() ?? "") &&
    (result.action === "register" || validTestResponse);
}

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

async function hashClientIp(remoteIp: string): Promise<string> {
  const secret = Deno.env.get("IP_HASH_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("IP_HASH_SECRET must contain at least 32 characters");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(remoteIp));
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : undefined;

  if (!allowedOrigin) return jsonResponse(403, "forbidden_origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(allowedOrigin) });
  }
  if (request.method !== "POST") return jsonResponse(405, "method_not_allowed", allowedOrigin);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    return jsonResponse(415, "unsupported_media_type", allowedOrigin);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, "payload_too_large", allowedOrigin);
  }

  try {
    const rawBody = await readLimitedBody(request);
    if (rawBody === null) {
      return jsonResponse(413, "payload_too_large", allowedOrigin);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, "invalid_request", allowedOrigin);
    }

    const payload = parsePayload(body);
    if (!payload) return jsonResponse(400, "invalid_request", allowedOrigin);

    const forwardedFor = request.headers.get("x-forwarded-for") ?? "unknown";
    const remoteIp = forwardedFor.split(",").at(-1)?.trim() || "unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server credentials missing");

    const clientHash = await hashClientIp(remoteIp);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: attemptAllowed, error: rateLimitError } = await supabase.rpc(
      "consume_registration_attempt",
      { p_client_hash: clientHash },
    );
    if (rateLimitError) throw rateLimitError;
    if (!attemptAllowed) return jsonResponse(429, "rate_limited", allowedOrigin);

    if (!(await verifyTurnstile(payload.turnstileToken, remoteIp))) {
      return jsonResponse(400, "invalid_challenge", allowedOrigin);
    }

    const { data, error } = await supabase.rpc("register_guest", {
      p_first_name: payload.firstName,
      p_last_name: payload.lastName,
      p_party_size: payload.partySize,
    });

    if (error) throw error;
    if (data === "created") return jsonResponse(201, "created", allowedOrigin);
    if (data === "duplicate") return jsonResponse(409, "duplicate", allowedOrigin);
    if (data === "invalid") return jsonResponse(400, "invalid_request", allowedOrigin);

    throw new Error("Unexpected registration result");
  } catch (error) {
    console.error("Registration request failed", {
      requestId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return jsonResponse(500, "server_error", allowedOrigin);
  }
});
