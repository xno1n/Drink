import Link from "next/link";

const RE = /(#[\p{L}\p{N}_]{1,50}|@[A-Za-z0-9_]{3,20})/u; // capture group => matches land at odd indices
// Renders text with clickable hashtags and @mentions. React escapes everything else (no HTML injection).
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(RE).map((part, i) => {
        if (i % 2 === 0) return part;
        const isTag = part.startsWith("#");
        const v = part.slice(1);
        return <Link key={i} dir="ltr" className="text-sky-500 hover:underline" href={isTag ? `/explore?tag=${encodeURIComponent(v.toLowerCase())}` : `/u/${v}`}>{part}</Link>;
      })}
    </>
  );
}
