import { Dashboard } from "../components/dashboard";
import { requireChatGPTUser } from "./chatgpt-auth";
import { getDashboardData } from "../lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  const data = await getDashboardData();
  return <Dashboard initialData={data} displayName={user.fullName ?? "Owner"} />;
}
