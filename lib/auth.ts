export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

// These headers are replaced by worker/index.ts only after JWT verification.
// API modules are invoked internally by that Worker, never exposed separately.
export function getUser(request: Request): AppUser | null {
  const userId = request.headers.get("jj-links-user-id");
  const email = request.headers.get("jj-links-user-email");
  if (!userId || !email) return null;
  return { userId, email, displayName: email, fullName: null };
}
