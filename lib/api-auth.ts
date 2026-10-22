import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";

export async function requireApiUser(request: Request, write = false) {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Sign in is required.");
  const ownerEmail = env.JJ_LINKS_OWNER_EMAIL?.toLowerCase();
  if (env.CLOUDFLARE_API_TOKEN && !ownerEmail) throw new ApiError(503, "JJ_LINKS_OWNER_EMAIL must be configured before live Cloudflare access is enabled.");
  if (ownerEmail && user.email.toLowerCase() !== ownerEmail) throw new ApiError(403, "This deployment is restricted to its owner.");
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) throw new ApiError(403, "Request origin was not accepted.");
  }
  return user;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 400;
  const message = error instanceof Error ? error.message : "Unexpected request failure.";
  return json({ ok: false, error: message }, status);
}
