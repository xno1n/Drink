import { getContext } from "@/lib/viewer";
import { getFlags } from "@/lib/flags";
import { LeftNav } from "@/components/left-nav";
import { RightSidebar } from "@/components/right-sidebar";
import { BottomNav } from "@/components/bottom-nav";

// Shell for signed-in pages: left nav (lg+), right sidebar (xl+), bottom nav (mobile).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, lang, supabase } = await getContext();
  const dms = (await getFlags(supabase)).dms_enabled !== false;
  const staff = !!me && ["moderator", "admin", "super_admin"].includes(me.role);
  return (
    <div className="mx-auto flex w-full max-w-6xl justify-center gap-4 lg:px-4">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 lg:block"><LeftNav lang={lang} username={me?.username} staff={staff} dms={dms} /></aside>
      <div className="min-w-0 flex-1">{children}</div>
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 overflow-y-auto xl:block"><RightSidebar lang={lang} /></aside>
      <BottomNav lang={lang} username={me?.username} dms={dms} />
    </div>
  );
}
