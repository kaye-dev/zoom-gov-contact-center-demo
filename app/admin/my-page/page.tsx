import { getCurrentAdminAccessActor } from "@/lib/server/admin-access/server";
import { getSessionUser } from "@/lib/server/auth/helpers";
import { MyPage } from "./MyPage";

export default async function MyPagePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await getCurrentAdminAccessActor("/admin/my-page");
  const user = getSessionUser(session)!;
  const params = await searchParams;
  return <MyPage name={user.name} email={user.email} denied={params.error === "access-denied"} />;
}
