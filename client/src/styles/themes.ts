export type ThemeKey = "orange" | "blue" | "green" | "purple" | "red" | "teal" | "pink"
  | "royal" | "clay" | "emerald" | "lagoon";

export interface ThemeScale {
  "50":  string;
  "100": string;
  "200": string;
  "300": string;
  "400": string;
  "500": string;
  "600": string;
  "700": string;
  "800": string;
  "900": string;
}

export interface Theme {
  key: ThemeKey;
  name: string;
  emoji: string;
  colors: ThemeScale;
}

export const THEMES: Theme[] = [
  {
    key: "orange", name: "Orange", emoji: "🟠",
    colors: { "50":"#fff7ed","100":"#ffedd5","200":"#fed7aa","300":"#fdba74",
               "400":"#fb923c","500":"#f97316","600":"#ea580c","700":"#c2410c","800":"#9a3412","900":"#7c2d12" },
  },
  {
    key: "blue", name: "Blue", emoji: "🔵",
    colors: { "50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd",
               "400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a" },
  },
  {
    key: "green", name: "Green", emoji: "🟢",
    colors: { "50":"#ecfdf5","100":"#d1fae5","200":"#a7f3d0","300":"#6ee7b7",
               "400":"#34d399","500":"#10b981","600":"#059669","700":"#047857","800":"#065f46","900":"#064e3b" },
  },
  {
    key: "purple", name: "Purple", emoji: "🟣",
    colors: { "50":"#f5f3ff","100":"#ede9fe","200":"#ddd6fe","300":"#c4b5fd",
               "400":"#a78bfa","500":"#8b5cf6","600":"#7c3aed","700":"#6d28d9","800":"#5b21b6","900":"#4c1d95" },
  },
  {
    key: "red", name: "Red", emoji: "🔴",
    colors: { "50":"#fef2f2","100":"#fee2e2","200":"#fecaca","300":"#fca5a5",
               "400":"#f87171","500":"#ef4444","600":"#dc2626","700":"#b91c1c","800":"#991b1b","900":"#7f1d1d" },
  },
  {
    key: "teal", name: "Teal", emoji: "🩵",
    colors: { "50":"#f0fdfa","100":"#ccfbf1","200":"#99f6e4","300":"#5eead4",
               "400":"#2dd4bf","500":"#14b8a6","600":"#0d9488","700":"#0f766e","800":"#115e59","900":"#134e4a" },
  },
  {
    key: "pink", name: "Pink", emoji: "🩷",
    colors: { "50":"#fdf2f8","100":"#fce7f3","200":"#fbcfe8","300":"#f9a8d4",
               "400":"#f472b6","500":"#ec4899","600":"#db2777","700":"#be185d","800":"#9d174d","900":"#831843" },
  },
  // ── "Professional" set — calmer, gradient-friendly tones for a more premium look ──
  {
    key: "royal", name: "Royal Court", emoji: "🔷",
    colors: { "50":"#eef1fc","100":"#dae1f8","200":"#b6c4f1","300":"#8ca3e6",
               "400":"#5f7bd6","500":"#3d5ac0","600":"#2a45ae","700":"#22368c","800":"#1a2a6e","900":"#131f52" },
  },
  {
    key: "clay", name: "Sunset Clay", emoji: "🟤",
    colors: { "50":"#fcf3ec","100":"#f9e2d1","200":"#f1c29e","300":"#e49a65",
               "400":"#d0793c","500":"#b65c22","600":"#a04a17","700":"#833b12","800":"#632c0d","900":"#451f09" },
  },
  {
    key: "emerald", name: "Match Point", emoji: "💚",
    colors: { "50":"#eaf7f1","100":"#d0eee0","200":"#a0dcc1","300":"#66c29d",
               "400":"#38a97c","500":"#1f9163","600":"#157a51","700":"#106041","800":"#0b4832","900":"#073123" },
  },
  {
    key: "lagoon", name: "Lagoon & Citrus", emoji: "🌊",
    colors: { "50":"#eaf7f8","100":"#d0eef1","200":"#a3dee4","300":"#6bc5cf",
               "400":"#3ca8b4","500":"#24899a","600":"#1a7284","700":"#145a69","800":"#0f4550","900":"#0a2f37" },
  },
];

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

export function applyTheme(key: ThemeKey) {
  const theme = THEMES.find(t => t.key === key) ?? THEMES[0];
  const root = document.documentElement;

  // 1. Set CSS variables (used by inline gradient styles)
  (Object.entries(theme.colors) as [string, string][]).forEach(([shade, hex]) => {
    root.style.setProperty(`--p-${shade}`, hexToRgb(hex));
  });

  // 2. Inject a dynamic <style> tag that overrides Tailwind's compiled orange/brand classes
  //    (Tailwind compiles to literal hex at build time, so we override at runtime)
  const id = "club-theme-override";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }

  const shades = Object.keys(theme.colors) as (keyof ThemeScale)[];
  const rules = shades.flatMap((shade) => {
    const rgb = `rgb(var(--p-${shade}))`;
    const rgbAlpha = (a: number) => `rgb(var(--p-${shade}) / ${a})`;
    return [
      `.bg-orange-${shade} { background-color: ${rgb} !important; }`,
      `.text-orange-${shade} { color: ${rgb} !important; }`,
      `.border-orange-${shade} { border-color: ${rgb} !important; }`,
      `.ring-orange-${shade} { --tw-ring-color: ${rgbAlpha(0.5)} !important; }`,
      `.shadow-orange-${shade}\\/25 { --tw-shadow-color: ${rgbAlpha(0.25)} !important; }`,
      `.shadow-orange-${shade}\\/30 { --tw-shadow-color: ${rgbAlpha(0.3)} !important; }`,
      `.bg-brand-${shade} { background-color: ${rgb} !important; }`,
      `.text-brand-${shade} { color: ${rgb} !important; }`,
      `.border-brand-${shade} { border-color: ${rgb} !important; }`,
      `.focus\\:border-orange-${shade}:focus { border-color: ${rgb} !important; }`,
      `.hover\\:bg-orange-${shade}:hover { background-color: ${rgb} !important; }`,
      `.from-orange-${shade} { --tw-gradient-from: ${rgb} !important; }`,
      `.to-orange-${shade} { --tw-gradient-to: ${rgb} !important; }`,
      `.via-orange-${shade} { --tw-gradient-via: ${rgb} !important; }`,
    ];
  });

  el.textContent = rules.join("\n");
}

export function getTheme(key: ThemeKey): Theme {
  return THEMES.find(t => t.key === key) ?? THEMES[0];
}
