import Link from "next/link";
import { Home, Search, Bell, Mail, Bookmark, User, Settings, Shield } from "lucide-react";

export function LeftNav({ lang, username, staff, dms = true }: { lang: string; username?: string; staff: boolean; dms?: boolean }) {
  const fa = lang === "fa";
  const items = [
    { href: "/", icon: Home, label: fa ? "خانه" : "Home" },
    { href: "/explore", icon: Search, label: fa ? "کاوش" : "Explore" },
    { href: "/notifications", icon: Bell, label: fa ? "اعلان‌ها" : "Notifications" },
    { href: "/messages", icon: Mail, label: fa ? "پیام‌ها" : "Messages" },
    { href: "/bookmarks", icon: Bookmark, label: fa ? "نشانه‌ها" : "Bookmarks" },
    ...(username ? [{ href: `/u/${username}`, icon: User, label: fa ? "پروفایل" : "Profile" }] : []),
    { href: "/settings", icon: Settings, label: fa ? "تنظیمات" : "Settings" },
    ...(staff ? [{ href: "/admin", icon: Shield, label: fa ? "مدیریت" : "Admin" }] : []),
  ];
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 py-4">
      <Link href="/" className="mb-3 px-3 text-2xl font-bold">{fa ? "پالس" : "PULSE"}</Link>
      {items.filter((i) => dms || i.href !== "/messages").map(({ href, icon: Icon, label }) => (
        <Link key={href} href={href} className="flex items-center gap-3 rounded-full px-3 py-2.5 text-lg hover:bg-black/5 dark:hover:bg-white/10"><Icon size={22} aria-hidden />{label}</Link>
      ))}
    </nav>
  );
}
