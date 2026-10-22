import { Dashboard } from "../components/dashboard";
import { requireChatGPTUser } from "./chatgpt-auth";
import { getDashboardData } from "../lib/dashboard-data";
import { authorizeOwner } from "../lib/owner";
import { ApiError } from "../lib/errors";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  try {
    authorizeOwner(user);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return <main className="mx-auto max-w-xl p-10"><h1 className="text-2xl font-semibold">Access unavailable</h1><p className="mt-4">{error.message}</p></main>;
  }
  const data = await getDashboardData();
  return <Dashboard initialData={data} displayName={user.fullName ?? "Owner"} />;
}
