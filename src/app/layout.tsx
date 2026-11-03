import "./globals.css";
import { Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import { dirOf, type Lang } from "@/lib/i18n";
import { Announcement } from "@/components/announcement";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], variable: "--font-vazir", display: "swap" });
export const metadata = { title: "PULSE" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const lang = (c.get("lang")?.value === "en" ? "en" : "fa") as Lang;
  const theme = c.get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang={lang} dir={dirOf(lang)} className={`${vazir.variable} ${theme === "dark" ? "dark" : ""}`} data-theme={theme}>
      <body className="font-sans antialiased min-h-dvh"><Announcement lang={lang} />
        {children}</body>
    </html>
  );
}
