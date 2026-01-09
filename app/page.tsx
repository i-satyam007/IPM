import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LoginView from "@/components/LoginView";
import DashboardClient from "@/components/DashboardClient";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {!session ? <LoginView /> : <DashboardClient session={session} />}
    </main>
  );
}
