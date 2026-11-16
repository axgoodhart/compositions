// Generated covers: a cover is one composition (a design idea that places title, subtitle and logomark together), set in one font and one palette.
// Fonts are fetched from Google Fonts the first time they render and cached in node_modules/.cache/cover-fonts.

// ==== FONTS ==== family on Google Fonts · default weight · italic by default · style tag · weights the family offers · italics offered for those weights
export type FontStyle = "italic" | "didone" | "display" | "caps" | "sans";
export type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type CoverFont = { family: string; weight: Weight; italic?: boolean; style: FontStyle }; // one face
export type FontFamily = CoverFont & { weights: Weight[]; italics?: boolean };
export const coverFonts: FontFamily[] = [
  { family: "Playfair Display", weight: 600, italic: true, style: "italic", weights: [400, 500, 600, 700, 800, 900], italics: true },
  { family: "Libre Bodoni", weight: 500, italic: true, style: "italic", weights: [400, 500, 600, 700], italics: true },
  { family: "Cormorant Garamond", weight: 600, italic: true, style: "italic", weights: [300, 400, 500, 600, 700], italics: true },
  { family: "Spectral", weight: 300, italic: true, style: "italic", weights: [200, 300, 400, 500, 600, 700, 800], italics: true },
  { family: "Bodoni Moda", weight: 400, style: "didone", weights: [400, 500, 600, 700, 800, 900], italics: true },
  { family: "Italiana", weight: 400, style: "didone", weights: [400] },
  { family: "Cormorant", weight: 300, style: "didone", weights: [300, 400, 500, 600, 700], italics: true },
  { family: "Prata", weight: 400, style: "didone", weights: [400] },
  { family: "Fraunces", weight: 400, style: "display", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: true },
  { family: "Cormorant Infant", weight: 500, style: "display", weights: [300, 400, 500, 600, 700], italics: true },
  { family: "Gloock", weight: 400, style: "display", weights: [400] },
  { family: "EB Garamond", weight: 400, style: "display", weights: [400, 500, 600, 700, 800], italics: true },
  { family: "Cinzel", weight: 400, style: "caps", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Marcellus", weight: 400, style: "caps", weights: [400] },
  { family: "Jost", weight: 300, style: "sans", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: true },
  { family: "Josefin Sans", weight: 200, style: "sans", weights: [100, 200, 300, 400, 500, 600, 700], italics: true },
];

// ==== COMPOSITIONS ==== one design idea each; styles / cases narrow the font and title case to what suits it (missing = any). Drawn in app/api/cover/route.tsx
export type TextCase = "as-is" | "upper" | "lower";
export type LayoutId = "ink" | "mark" | "band" | "corner" | "veil" | "rule" | "colossus" | "signature" | "spine" | "split" | "frame" | "scale" | "whisper" | "column" | "ledger" | "plaque" | "inverse" | "tracking";
export type Layout = { id: LayoutId; styles?: FontStyle[]; cases?: TextCase[] };
export const coverLayouts: Layout[] = [
  { id: "ink", cases: ["as-is", "lower"] }, // title centred high, small mark bleeding off bottom right
  { id: "mark", cases: ["upper", "as-is"] }, // huge mark bleeding off top right, title stacked word by word bottom left
  { id: "band", cases: ["as-is", "upper"] }, // solid band across the top or bottom with the title, mark in the field
  { id: "corner", cases: ["as-is", "lower"] }, // title top left, mark bleeding off bottom left
  { id: "veil", cases: ["as-is", "upper"] }, // faint mark centred behind a centred title
  { id: "rule", cases: ["as-is", "lower"] }, // title bottom left under a rule, small mark top right
  { id: "colossus", cases: ["upper", "as-is"] }, // the mark three times the canvas, cropped to one gesture; a small caption in the far corner
  { id: "signature", cases: ["upper", "as-is", "lower"] }, // the title fills the width edge to edge; the mark signs the corner, tiny and solid
  { id: "spine", styles: ["caps", "sans", "didone", "display"], cases: ["upper", "as-is"] }, // title runs vertically up one edge; mark bleeds off the other
  { id: "split", cases: ["as-is", "upper"] }, // the field cut in two tones; title on one side, mark and subtitle on the other
  { id: "frame", styles: ["didone", "caps", "display", "italic"], cases: ["upper", "as-is"] }, // hairline frame, small solid crest, centred tracked title
  { id: "scale", styles: ["display", "didone", "italic"], cases: ["as-is", "lower", "upper"] }, // one word enormous, the rest small above it
  { id: "whisper", styles: ["italic", "didone", "sans"], cases: ["as-is", "lower"] }, // tiny title at a golden point, tiny solid mark in the far corner, nothing else
  { id: "column", cases: ["upper", "as-is", "lower"] }, // title stacked in a narrow side column; the mark takes the rest
  { id: "ledger", styles: ["didone", "sans", "caps"], cases: ["as-is", "upper"] }, // horizontal rules divide the field; title, mark and subtitle each take a row
  { id: "plaque", cases: ["as-is", "upper"] }, // small solid plaque with the title over an enormous ghosted mark
  { id: "inverse", cases: ["upper"] }, // the subtitle is the big type in the accent colour; the title is a small tracked label
  { id: "tracking", styles: ["caps", "sans", "didone"], cases: ["upper"] }, // letters spaced across the width between two rules
];

// ==== PALETTES ==== bg · ink (title) · mark (ghosted) · band (panel / accent) · bandInk (type on the band)
export type PaletteId = "soot" | "paper" | "chalk" | "moss" | "oxblood" | "slate" | "linen" | "night" | "rose" | "indigo";
export type Palette = { id: PaletteId; bg: string; ink: string; mark: string; band: string; bandInk: string };
export const coverPalettes: Palette[] = [
  { id: "soot", bg: "#141414", ink: "#c9c7a1", mark: "#3a3a3a", band: "#c9c7a1", bandInk: "#141414" },
  { id: "paper", bg: "#f3f2ee", ink: "#0b0b0b", mark: "#d8d7d2", band: "#0b0b0b", bandInk: "#eeebe3" },
  { id: "chalk", bg: "#ffffff", ink: "#15161a", mark: "#a9a9a9", band: "#15161a", bandInk: "#ffffff" },
  { id: "moss", bg: "#1f2a22", ink: "#e6e1cf", mark: "#2f3d32", band: "#e6e1cf", bandInk: "#1f2a22" },
  { id: "oxblood", bg: "#4a1d21", ink: "#f1e6d8", mark: "#602b30", band: "#f1e6d8", bandInk: "#4a1d21" },
  { id: "slate", bg: "#2a2f38", ink: "#d9d4c7", mark: "#3b4352", band: "#c9a86a", bandInk: "#1b1e24" },
  { id: "linen", bg: "#e9e2d3", ink: "#2b2a26", mark: "#d2c9b4", band: "#2b2a26", bandInk: "#e9e2d3" },
  { id: "night", bg: "#0b0d12", ink: "#d8c07a", mark: "#1b2030", band: "#d8c07a", bandInk: "#0b0d12" },
  { id: "rose", bg: "#efdcd6", ink: "#3b2a2a", mark: "#dfc3bb", band: "#3b2a2a", bandInk: "#efdcd6" },
  { id: "indigo", bg: "#f7f4ea", ink: "#1f3a5f", mark: "#ddd8cb", band: "#1f3a5f", bandInk: "#f7f4ea" },
];

// ==== RESTRICT ==== empty = everything allowed
export const allowedStyles: FontStyle[] = [];
export const allowedLayouts: LayoutId[] = [];
export const allowedPalettes: PaletteId[] = [];
export const allowedCases: TextCase[] = [];

// ==== OUTPUT ====
export const coverSize = { width: 1000, height: 1294 }; // same proportions as the drawn covers
export const generatedFolder = "media/covers/generated"; // under public/; `npm run media` moves covers in use up one level
export const logomark = "media/site/logomark.webp"; // under public/; black on transparent
export const isPlaceholderCover = (src = "") => !src || /\/(999|logomark)\.webp$/.test(src) || src.endsWith("/placeholder.svg");

export type Combo = { layout: Layout; variant: number; palette: Palette; font: CoverFont; textCase: TextCase }; // variant seeds the composition's own choices
export type Pins = { layout?: LayoutId; variant?: number; palette?: PaletteId; font?: string; textCase?: TextCase }; // font = fontKey
const textCases: TextCase[] = ["as-is", "upper", "lower"];
const allow = <T,>(all: T[], ok: (x: T) => boolean) => { const kept = all.filter(ok); return kept.length ? kept : all; };
export const usable = {
  layouts: allow(coverLayouts, l => !allowedLayouts.length || allowedLayouts.includes(l.id)),
  palettes: allow(coverPalettes, p => !allowedPalettes.length || allowedPalettes.includes(p.id)),
  fonts: allow(coverFonts, f => !allowedStyles.length || allowedStyles.includes(f.style)),
  cases: allow(textCases, c => !allowedCases.length || allowedCases.includes(c)),
};
export const fontsFor = (l: Layout) => allow(usable.fonts, f => !l.styles || l.styles.includes(f.style));
export const casesFor = (l: Layout) => allow(usable.cases, c => !l.cases || l.cases.includes(c));

export const fontKey = (f: CoverFont) => `${f.family}:${f.weight}:${f.italic ? "i" : "n"}`;
export const familyOf = (name: string) => coverFonts.find(f => f.family === name);
export const faceOf = (fam: FontFamily, weight: Weight, italic: boolean): CoverFont | undefined => (fam.weights.includes(weight) && (!italic || fam.italics) ? { family: fam.family, weight, italic: italic || undefined, style: fam.style } : undefined);
export const fontByKey = (key = ""): CoverFont | undefined => { // any face the family offers, not only its default
  const m = key.match(/^(.+):(\d{3}):([in])$/); if (!m) return undefined;
  const fam = familyOf(m[1]); return fam && faceOf(fam, Number(m[2]) as Weight, m[3] === "i");
};
export const boldWeight = (fam: FontFamily) => fam.weights.find(w => w >= fam.weight + 200) ?? fam.weights[fam.weights.length - 1]; // the family's "bold" relative to its default
export const layoutById = (id = "") => coverLayouts.find(l => l.id === id);
export const paletteById = (id = "") => coverPalettes.find(p => p.id === id);
export const comboKey = (c: Combo) => `${c.layout.id}/${c.variant}/${c.palette.id}/${fontKey(c.font)}/${c.textCase}`;
export const comboParams = (c: Combo) => ({ layout: c.layout.id, variant: String(c.variant), palette: c.palette.id, font: fontKey(c.font), case: c.textCase });
export const defaultSubtitle = (ensemble = "") => (ensemble.trim() ? `for ${ensemble.trim()}` : "");
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const pickFrom = <T,>(list: T[], seed: string) => list[hash(seed) % list.length];
const shuffled = <T,>(list: T[], seed: string) => list.map((x, i) => [hash(`${seed}/${i}`), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const build = (seed: string, layout: Layout, palette: Palette, pins: Pins): Combo => ({
  layout, palette,
  variant: pins.variant ?? hash(seed + "/variant") % 1000,
  font: fontByKey(pins.font) ?? pickFrom(fontsFor(layout), seed + "/font"),
  textCase: pins.textCase ?? pickFrom(casesFor(layout), seed + "/case"),
});
export const comboFor = (seed: string, pins: Pins = {}): Combo => // the same seed and pins always give the same combo
  build(seed, layoutById(pins.layout) ?? pickFrom(usable.layouts, seed + "/layout"), paletteById(pins.palette) ?? pickFrom(usable.palettes, seed + "/palette"), pins);
export const sampleCombos = (seed: string, n: number, pins: Pins = {}) => { // up to n distinct combos; every composition and palette appears before any repeats
  const layouts = shuffled(usable.layouts, seed + "/layouts");
  const palettes = shuffled(usable.palettes, seed + "/palettes");
  const out: Combo[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < n && i < n * 20; i++) {
    const c = build(`${seed}/${i}`, layoutById(pins.layout) ?? layouts[i % layouts.length], paletteById(pins.palette) ?? palettes[i % palettes.length], pins);
    const k = comboKey(c);
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out;
};
