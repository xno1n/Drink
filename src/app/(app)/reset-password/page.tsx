import { cookies } from "next/headers";
import { EmailOrPasswordForm } from "@/components/reset-forms";
// Protected by middleware: reachable only after the recovery link established a session.
export default async function Page() {
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "fa";
  return <EmailOrPasswordForm mode="reset" lang={lang} />;
}
