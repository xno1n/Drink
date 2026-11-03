"use client";
import { Moon, Sun, Languages } from "lucide-react";
import { useRouter } from "next/navigation";

const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`; };

export function ThemeLangToggle({ theme, lang }: { theme: string; lang: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <button aria-label="Toggle theme" className="glass rounded-full p-2" onClick={() => { setCookie("theme", theme === "dark" ? "light" : "dark"); router.refresh(); }}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button aria-label="Toggle language" className="glass rounded-full p-2" onClick={() => { setCookie("lang", lang === "fa" ? "en" : "fa"); router.refresh(); }}>
        <Languages size={18} />
      </button>
    </div>
  );
}
