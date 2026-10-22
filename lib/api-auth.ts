import { getChatGPTUser } from "../app/chatgpt-auth";
import { authorizeOwner } from "./owner";
import { ApiError } from "./errors";
export { ApiError } from "./errors";

export async function requireApiUser(request: Request, write = false) {
  const user = authorizeOwner(await getChatGPTUser());
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) throw new ApiError(403, "Request origin was not accepted.");
  }
  return user;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 400;
  const message = error instanceof Error ? error.message : "Unexpected request failure.";
  return json({ ok: false, error: message, resetRequest: error instanceof ApiError && error.resetRequest }, status);
}
