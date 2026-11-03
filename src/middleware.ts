import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };
const GUEST = ["/login", "/signup", "/forgot-password"]; // signed-in users are redirected away
const OPEN = ["/auth/", "/guidelines"];                                  // reachable by anyone (email-link callback)

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser(); // validates the JWT server-side
  const path = req.nextUrl.pathname;
  const isGuest = GUEST.some((p) => path.startsWith(p));
  const isOpen = OPEN.some((p) => path.startsWith(p));

  if (!user && !isGuest && !isOpen) return NextResponse.redirect(new URL("/login", req.url));
  if (user && isGuest) return NextResponse.redirect(new URL("/", req.url));

  if (user && path.startsWith("/admin")) {
    const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!p || !["moderator", "admin", "super_admin"].includes(p.role)) return NextResponse.redirect(new URL("/", req.url));
  }
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"] };
