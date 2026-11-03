// Static sanity checks that need no installed dependencies: node scripts/check-static.mjs
// 1) every local import resolves  2) every named import exists as an export of the target
// 3) "use server" files export only async functions/types  4) "use client" files don't import server-only modules
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const root = process.cwd(), SRC = join(root, "src");
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && files.push(p); } })(SRC);
const rel = (p) => p.slice(root.length + 1).replace(/\\/g, "/");
const problems = [];

function resolveModule(from, spec) {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const c of [base, base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
const exportsOf = (file) => {
  const s = readFileSync(file, "utf8"), out = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(",").forEach((x) => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); });
  if (/export\s+default/.test(s)) out.add("default");
  return out;
};

for (const f of files) {
  const s = readFileSync(f, "utf8");
  const head = s.trimStart().slice(0, 40);
  const isServerFile = /^["']use server["']/.test(head), isClient = /^["']use client["']/.test(head);

  for (const m of s.matchAll(/import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gs)) {
    const [, clause, spec] = m;
    if (!(spec.startsWith("@/") || spec.startsWith("."))) {
      if (isClient && ["next/headers", "server-only"].includes(spec)) problems.push(`${rel(f)}: client file imports ${spec}`);
      continue;
    }
    const target = resolveModule(f, spec);
    if (!target) { problems.push(`${rel(f)}: cannot resolve "${spec}"`); continue; }
    if (isClient && /lib\/supabase\/server$/.test(spec)) problems.push(`${rel(f)}: client file imports server Supabase client`);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      const ex = exportsOf(target);
      for (const part of named[1].split(",")) {
        const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (name && !ex.has(name)) problems.push(`${rel(f)}: "${name}" is not exported by ${rel(target)}`);
      }
    }
    if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim()) && !exportsOf(target).has("default")) problems.push(`${rel(f)}: default import from ${rel(target)} but it has no default export`);
  }

  if (isServerFile) {
    for (const m of s.matchAll(/^export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm)) problems.push(`${rel(f)}: "use server" file has non-async export "${m[2]}" (${m[1]})`);
    for (const m of s.matchAll(/^export\s+default\s+(?!async)/gm)) problems.push(`${rel(f)}: "use server" file has a non-async default export`);
  }
}
console.log(`Checked ${files.length} files.`);
if (problems.length) { console.log("\nProblems:\n" + problems.map((p) => "  ✗ " + p).join("\n")); process.exit(1); }
console.log("No problems found.");
