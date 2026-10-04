import { ApiError, jsonError } from "@/lib/errors";
import { assertMutatingOrigin } from "@/lib/http/origin";
import { handleRouteError, withNoStore } from "@/lib/http/response";
import { authorizeJob } from "@/lib/jobs/auth";
import { completeUploadAsync, getJobStatus } from "@/lib/jobs/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertMutatingOrigin(request);
    const { id } = await context.params;
    const job = authorizeJob(request, id);
    const updated = await completeUploadAsync(job);
    return Response.json(getJobStatus(updated), {
      status: 200,
      headers: withNoStore(),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.code, err.status);
    }
    return handleRouteError(err);
  }
}
