export type Lang = "fa" | "en";
const dict = {
  fa: { brand: "پالس", login: "ورود", signup: "ثبت‌نام", email: "ایمیل", password: "رمز عبور", username: "نام کاربری", displayName: "نام نمایشی", home: "خانه", empty: "هنوز پستی وجود ندارد.", noAccount: "حساب ندارید؟", haveAccount: "حساب دارید؟" },
  en: { brand: "PULSE", login: "Log in", signup: "Sign up", email: "Email", password: "Password", username: "Username", displayName: "Display name", home: "Home", empty: "No posts yet.", noAccount: "No account?", haveAccount: "Have an account?" },
} as const;
export const t = (lang: Lang) => dict[lang];
export const dirOf = (lang: Lang) => (lang === "fa" ? "rtl" : "ltr");
