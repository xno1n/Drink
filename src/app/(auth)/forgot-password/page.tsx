import { cookies } from "next/headers";
import { EmailOrPasswordForm } from "@/components/reset-forms";
export default async function Page() {
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "fa";
  return <EmailOrPasswordForm mode="forgot" lang={lang} />;
}
