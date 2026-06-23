import { requireAdminSession } from "@/lib/server/auth/server";

import { NewUserForm } from "./NewUserForm";

export default async function NewUserPage() {
  await requireAdminSession("/admin/users/new");

  return <NewUserForm />;
}
