import { ApiError, jsonError } from "@/lib/errors";
import { assertMutatingOrigin } from "@/lib/http/origin";
import { handleRouteError, withNoStore } from "@/lib/http/response";
import { authorizeJob } from "@/lib/jobs/auth";
import { getJobStatus, requestDelete } from "@/lib/jobs/service";
import { assertRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    // US-040: poll rate limit (client + job) before auth work.
    assertRateLimit(request, "poll", { jobId: id });
    const job = authorizeJob(request, id);
    return Response.json(getJobStatus(job), {
      status: 200,
      headers: withNoStore(),
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

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertMutatingOrigin(request);
    const { id } = await context.params;
    const job = authorizeJob(request, id, { allowDeletePending: true });
    requestDelete(job);
    return Response.json(
      { error: "delete_pending" },
      { status: 202, headers: withNoStore() },
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.code, err.status);
    }
    return handleRouteError(err);
  }
}
