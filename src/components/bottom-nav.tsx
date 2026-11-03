"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Bell, Mail, User } from "lucide-react";

export function BottomNav({ lang, username, dms = true }: { lang: string; username?: string; dms?: boolean }) {
  const path = usePathname();
  if (path.startsWith("/messages/")) return null; // the message composer occupies the bottom edge
  const fa = lang === "fa";
  const items = [
    { href: "/", icon: Home, label: fa ? "خانه" : "Home" },
    { href: "/explore", icon: Search, label: fa ? "کاوش" : "Explore" },
    { href: "/notifications", icon: Bell, label: fa ? "اعلان‌ها" : "Notifications" },
    { href: "/messages", icon: Mail, label: fa ? "پیام‌ها" : "Messages" },
    { href: username ? `/u/${username}` : "/settings", icon: User, label: fa ? "پروفایل" : "Profile" },
  ];
  return (
    <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-20 flex justify-around rounded-t-2xl pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.filter((i) => dms || i.href !== "/messages").map(({ href, icon: Icon, label }) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return <Link key={href} href={href} aria-label={label} aria-current={on ? "page" : undefined} className={`p-3 ${on ? "" : "opacity-60"}`}><Icon size={24} /></Link>;
      })}
    </nav>
  );
}
