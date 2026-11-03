import { cookies } from "next/headers";
import { AuthForm } from "@/components/auth-form";
export default async function Page() {
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "fa";
  return <AuthForm mode="signup" lang={lang} />;
}
