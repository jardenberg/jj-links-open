import { env } from "cloudflare:workers";
import { ApiError } from "./errors";
import type { AppUser } from "./auth";

export function authorizeOwner(user: AppUser | null): AppUser {
  if (!user) throw new ApiError(401, "Sign in is required.");
  const ownerEmail = env.JJ_LINKS_OWNER_EMAIL?.trim().toLowerCase();
  if (env.CLOUDFLARE_API_TOKEN && !ownerEmail) {
    throw new ApiError(503, "Configure JJ_LINKS_OWNER_EMAIL before enabling live access.");
  }
  if (ownerEmail && user.email.toLowerCase() !== ownerEmail) {
    throw new ApiError(403, "This deployment is restricted to its owner.");
  }
  return user;
}
