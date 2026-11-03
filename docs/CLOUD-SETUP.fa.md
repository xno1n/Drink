# راه‌اندازی با Supabase Cloud (بدون Docker) — ویندوز / PowerShell

همه‌ی دستورها را داخل پوشه‌ی پروژه بزن (جایی که `package.json` هست):
```
cd C:\Users\Arka\desktop\pulse
```

## ۱) پروژه‌ی Supabase بساز
1. در supabase.com وارد شو و **New project** را بزن. رمز دیتابیس را جایی نگه دار.
2. شناسه‌ی پروژه (۲۰ حرف کوچک انگلیسی) بخشی از آدرس داشبورد و آدرس پروژه است: `https://<شناسه>.supabase.co`.

## ۲) تنظیم ایمیل (فقط برای تست)
Authentication ← Providers ← Email ← گزینه‌ی **Confirm email** را خاموش کن تا ثبت‌نام بدون ایمیل کار کند. (در محیط واقعی دوباره روشنش کن و SMTP تنظیم کن.)

## ۳) فایل env
```
copy .env.example .env.local
notepad .env.local
```
این دو مقدار را از Project Settings ← API بردار:
```
NEXT_PUBLIC_SUPABASE_URL=https://<شناسه>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<کلید anon (public)>
```
بدون گیومه، بدون فاصله و بدون `/` آخر آدرس. کلید **service_role** را هرگز نگذار.

## ۴) نصب و اتصال
```
npm install
npx supabase login
npx supabase link --project-ref <شناسه‌ی ۲۰حرفی>
npx supabase db push
```
`link` رمز دیتابیس را می‌پرسد. `db push` همه‌ی ۱۴ migration را اعمال می‌کند؛ با `Y` تأیید کن.

## ۵) بررسی
```
npm run doctor
```
باید همه‌چیز ✓ باشد (به‌جز شاید هشدار تأیید ایمیل). اگر ✗ دیدی، همان خروجی را بفرست.

## ۶) اجرا
```
npm run typecheck
npm run dev
```
`http://localhost:3000` را باز کن و از `/signup` ثبت‌نام کن (نام کاربری ۳ تا ۲۰ حرف انگلیسی/عدد/_، رمز حداقل ۸ کاراکتر).

## ۷) ادمین شدن (یک‌بار)
بعد از ثبت‌نام، در داشبورد ← SQL Editor این را اجرا کن (نام کاربری خودت را بگذار):
```sql
select set_config('pulse.bypass_guard','1',false);
update profiles set role='super_admin' where username='نام-کاربری-تو';
```
بعد به `/admin` برو.

## ۸) داده‌ی دمو (اختیاری، فقط پروژه‌ی تستی)
محتوای `supabase\seed.sql` را در SQL Editor بچسبان و Run بزن. سه حساب `alice@demo.local`، `bob@demo.local` و `admin@demo.local` با رمز `demo-password-123` ساخته می‌شود. روی پروژه‌ی واقعی اجرا نکن.

## مشکلات رایج
| پیام | معنی و راه‌حل |
|---|---|
| `Cannot resolve "xxxx": it is not a project ref` | به‌جای `xxxx` باید شناسه‌ی واقعی ۲۰حرفی را بگذاری |
| `Cannot find project ref. Have you run supabase link?` | اول `link` را بزن، و داخل پوشه‌ی پروژه باشی |
| `docker: command not found` | Docker لازم نیست؛ از `db push` استفاده کن، نه `supabase start` |
| `fetch failed` هنگام ثبت‌نام/ورود | `.env.local` جای‌نگهدار دارد یا آدرس در دسترس نیست؛ `npm run doctor` را بزن (VPN را هم امتحان کن) |
| `invalid_credentials` | حساب وجود ندارد یا ایمیل تأیید نشده؛ در Authentication ← Users ببین |
| `relation "profiles" does not exist` | `db push` اجرا نشده یا ناقص مانده |
| خطای SQL در `db push` | متن کامل خطا را بفرست (migrationها هنوز روی دیتابیس واقعی اجرا نشده‌اند) |
