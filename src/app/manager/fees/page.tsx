import { redirect } from "next/navigation";

/** Fee records moved to the shared Finance section. */
export default function ManagerFeesPage() {
  redirect("/finance/fees");
}
