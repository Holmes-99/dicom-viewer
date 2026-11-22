// Generates tokens.css (custom properties + Tailwind v4 @theme mapping) from tokens.json.
//   node replica/design/gen-tokens.mjs
// Output: replica/design/tokens.css and a copy in app/src/styles/tokens.css
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const out = [];

out.push("/* GENERATED from tokens.json by gen-tokens.mjs. Do not edit by hand. */", ":root {");
for (const [k, v] of Object.entries(t.color)) out.push(`  --${k}: ${v};`);
out.push(`  --font-sans: ${t.font.sans};`, `  --font-mono: ${t.font.mono};`);
for (const [k, v] of Object.entries(t.radius)) out.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.shadow)) out.push(`  --shadow-${k}: ${v};`);
for (const [k, v] of Object.entries(t.motion)) out.push(`  --motion-${k}: ${v};`);
for (const [k, v] of Object.entries(t.layout)) if (typeof v === "number") out.push(`  --${k}: ${v}px;`);
out.push("  color-scheme: dark;", "}", "");

// Tailwind v4: utilities like bg-surface, text-muted, rounded-md, text-sm, shadow-pop.
out.push("@theme inline {");
out.push("  --color-*: initial;");
for (const k of Object.keys(t.color)) {
  const name = k.startsWith("text-") ? k.slice(5) : k; // text-muted -> text-muted utility via --color-muted
  out.push(`  --color-${name === "text" ? "fg" : name}: var(--${k});`);
}
out.push("  --font-sans: var(--font-sans);", "  --font-mono: var(--font-mono);");
out.push("  --radius-*: initial;");
for (const k of Object.keys(t.radius)) out.push(`  --radius-${k}: var(--radius-${k});`);
out.push("  --shadow-*: initial;");
for (const k of Object.keys(t.shadow)) out.push(`  --shadow-${k}: var(--shadow-${k});`);
out.push("  --text-*: initial;");
for (const [k, v] of Object.entries(t.type)) {
  out.push(`  --text-${k}: ${v.size}px;`, `  --text-${k}--line-height: ${v.line}px;`, `  --text-${k}--font-weight: ${v.weight};`);
}
out.push("  --spacing: 4px;"); // Tailwind default: p-1 = 4px, p-0.5 = 2px, p-1.5 = 6px
out.push("}", "");

const css = out.join("\n");
writeFileSync(join(here, "tokens.css"), css);
const appCopy = join(here, "..", "..", "app", "src", "styles", "tokens.css");
mkdirSync(dirname(appCopy), { recursive: true });
writeFileSync(appCopy, css);
console.log("wrote tokens.css and app/src/styles/tokens.css");
