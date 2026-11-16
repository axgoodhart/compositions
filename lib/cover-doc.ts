// A generated cover as an editable document: a sheet colour, the logomark, flat shapes and text boxes, all in cover pixels (1000 × 1294).
// Compositions in app/api/cover/route.tsx produce these; the studio in app/editlive/studio.tsx edits them; the route renders them.
import type { Palette, TextCase } from "./cover-looks";

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type Side = "top" | "right" | "bottom" | "left";
export type TextRole = "title" | "sub" | "other";
export type Tone = "ink" | "band" | "bandInk" | "mark" | "bg"; // which palette colour an element was given, so a new palette can recolour it
export type TextItem = {
  id: string; role: TextRole; text: string; // lines separated by \n
  font: string; // fontKey
  size: number; lineHeight: number; tracking: number; // tracking in em
  textCase: TextCase; color: string; tone?: Tone;
  x: number; y: number; w: number; h: number; align: Align; valign: VAlign; rotate?: 90 | -90;
};
export type MarkItem = { x: number; y: number; w: number; color: string; tone?: Tone };
export type Shape = { id: string; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number; sides?: Side[]; tone?: Tone; under?: boolean }; // under = beneath the mark
export type CoverDoc = { v: 1; sheet: string; mark: MarkItem; shapes: Shape[]; texts: TextItem[]; from?: Record<string, string> }; // from = the combo it was composed from

export const markRatio = 1420 / 1111; // logomark height ÷ width
export const applyCase = (s: string, c: TextCase) => (c === "upper" ? s.toUpperCase() : c === "lower" ? s.toLowerCase() : s);
export const docHash = (doc: CoverDoc) => { let h = 2166136261; for (const c of JSON.stringify({ ...doc, from: undefined })) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, "0"); };
export const recolor = (doc: CoverDoc, p: Palette): CoverDoc => { // give every element with a remembered tone that palette's colour
  const of = (tone?: Tone, keep?: string) => (tone ? p[tone === "bg" ? "bg" : tone] : keep);
  return { ...doc, sheet: p.bg, mark: { ...doc.mark, color: of(doc.mark.tone, doc.mark.color) ?? doc.mark.color },
    shapes: doc.shapes.map(s => ({ ...s, ...(s.fill ? { fill: of(s.tone, s.fill) } : {}), ...(s.stroke ? { stroke: of(s.tone, s.stroke) } : {}) })),
    texts: doc.texts.map(t => ({ ...t, color: of(t.tone, t.color) ?? t.color })) };
};
export const fontsCssUrl = (families: { family: string; weights: number[]; italics?: boolean }[]) => // one Google Fonts stylesheet with every face the studio may show
  `https://fonts.googleapis.com/css2?${families.map(f => { const tuples = [...f.weights.map(w => `0,${w}`), ...(f.italics ? f.weights.map(w => `1,${w}`) : [])]; return `family=${f.family.replace(/ /g, "+")}:ital,wght@${tuples.join(";")}`; }).join("&")}&display=swap`;
