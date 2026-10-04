import { getConfig } from "@/lib/config";
import { ApiError, jsonError } from "@/lib/errors";
import {
  jobSecretCookieName,
  serializeCookie,
} from "@/lib/http/cookies";
import { assertMutatingOrigin, publicBaseUrl } from "@/lib/http/origin";
import { handleRouteError, withNoStore } from "@/lib/http/response";
import { getOrCreateSessionId } from "@/lib/http/session";
import { rejectQuerySecrets } from "@/lib/jobs/auth";
import { createJob } from "@/lib/jobs/service";
import { assertRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    rejectQuerySecrets(request);
    assertMutatingOrigin(request);
    // US-040: IP-keyed create rate limit before session/quota charge.
    assertRateLimit(request, "create");

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 256) {
      return jsonError("unauthorized", 400);
    }

    const { sessionId, setCookie } = getOrCreateSessionId(request);
    const result = await createJob({
      sessionId,
      idempotencyKey,
      publicBaseUrl: publicBaseUrl(request),
    });

    const config = getConfig();
    const headers = withNoStore();
    if (setCookie) {
      headers.append("Set-Cookie", setCookie);
    }

    const body: Record<string, unknown> = {
      id: result.job.id,
      state: result.job.state,
      expiresAt: result.job.expiresAt,
      upload: result.upload,
    };

    // Issue secret once at create (body + HttpOnly cookie). Never on idempotent replay.
    if (!result.reused && result.secret) {
      body.secret = result.secret;
      headers.append(
        "Set-Cookie",
        serializeCookie(jobSecretCookieName(result.job.id), result.secret, {
          path: `/api/jobs/${result.job.id}`,
          httpOnly: true,
          sameSite: "Strict",
          maxAge: config.jobAccessTtlSeconds,
        }),
      );
    }

    return Response.json(body, {
      status: result.reused ? 200 : 201,
      headers,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.code, err.status, {
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    return handleRouteError(err);
  }
}
