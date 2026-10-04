import { ApiError, jsonError } from "@/lib/errors";
import { handleRouteError, withNoStore } from "@/lib/http/response";
import { authorizeJob } from "@/lib/jobs/auth";
import { readDownload } from "@/lib/jobs/service";
import { assertRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    // US-040: download rate limit before auth; do not remap to unauthorized.
    assertRateLimit(request, "download", { jobId: id });
    const job = authorizeJob(request, id);
    const bytes = await readDownload(job);
    const headers = withNoStore({
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="resume-editable.docx"',
      },
    });
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "rate_limited") {
        return jsonError(err.code, err.status, {
          retryAfterSeconds: err.retryAfterSeconds,
        });
      }
      // Neutral unavailable — do not disclose another user's job or output existence.
      if (err.code === "expired") {
        return jsonError("expired", 410);
      }
      return jsonError("unauthorized", 404);
    }
    return handleRouteError(err);
  }
}
