// Composes and renders generated covers. GET previews a composition or a document; POST saves one under public/content/covers/generated.
// Each composition in lib/cover-looks.ts is a `case` in compose(): it places text boxes, shapes and the mark into a CoverDoc; draw() renders any CoverDoc.
import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import type { CSSProperties, ReactNode } from "react";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { comboFor, coverSize, fontByKey, fontKey, generatedFolder, layoutById, logomark, type Combo, type CoverFont, type PaletteId, type TextCase } from "@/lib/cover-looks";
import { applyCase, docHash, markRatio, type Align, type CoverDoc, type Shape, type TextItem, type TextRole, type Tone } from "@/lib/cover-doc";

const dev = process.env.NODE_ENV === "development";
const root = path.join(process.cwd(), "public");
const fontCache = path.join(process.cwd(), "node_modules/.cache/cover-fonts");
const fontAgent = "curl/8"; // plain agent makes Google Fonts answer with TTF urls
const fonts = new Map<string, Promise<ArrayBuffer>>();
const marks = new Map<string, Promise<string>>();
const metrics = new Map<string, Metrics>();
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function loadFont(font: CoverFont) {
  const key = fontKey(font);
  if (!fonts.has(key)) fonts.set(key, (async () => {
    const file = path.join(fontCache, key.replace(/[^a-z0-9]/gi, "_") + ".ttf");
    try { return toArrayBuffer(await readFile(file)); } catch { /* not cached yet */ }
    const axis = font.italic ? `:ital,wght@1,${font.weight}` : font.weight !== 400 ? `:wght@${font.weight}` : "";
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${font.family.replace(/ /g, "+")}${axis}`, { headers: { "User-Agent": fontAgent } })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype|woff)'\)/)?.[1];
    if (!url) throw new Error(`Google Fonts has no ${key}`);
    const data = Buffer.from(await (await fetch(url)).arrayBuffer());
    await mkdir(fontCache, { recursive: true });
    await writeFile(file, data);
    return toArrayBuffer(data);
  })().catch(e => { fonts.delete(key); throw e; }));
  return fonts.get(key)!;
}
async function metricsFor(font: CoverFont) { const key = fontKey(font); const data = await loadFont(font); if (!metrics.has(key)) metrics.set(key, parseMetrics(data)); return metrics.get(key)!; }

function tintedMark(color: string) { // the logomark's alpha filled with one colour, as a data url
  if (!marks.has(color)) marks.set(color, (async () => {
    const png = await sharp(path.join(root, logomark)).png().toBuffer();
    const { width = 1111, height = 1420 } = await sharp(png).metadata();
    const tinted = await sharp({ create: { width, height, channels: 4, background: color } }).composite([{ input: png, blend: "dest-in" }]).png().toBuffer();
    return `data:image/png;base64,${tinted.toString("base64")}`;
  })().catch(e => { marks.delete(color); throw e; }));
  return marks.get(color)!;
}

type Metrics = { upem: number; adv: (cp: number) => number }; // advance width of a code point, in font units
function parseMetrics(buf: ArrayBuffer): Metrics { // head + hhea + hmtx + cmap (formats 4 and 12), enough to measure a line
  const dv = new DataView(buf);
  const tables: Record<string, number> = {};
  for (let i = 0; i < dv.getUint16(4); i++) { const o = 12 + i * 16; tables[String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3))] = dv.getUint32(o + 8); }
  const upem = dv.getUint16(tables.head + 18);
  const numH = dv.getUint16(tables.hhea + 34);
  const cmap = tables.cmap;
  let sub: { fmt: number; off: number } | null = null;
  for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
    const pid = dv.getUint16(cmap + 4 + i * 8), eid = dv.getUint16(cmap + 6 + i * 8), off = cmap + dv.getUint32(cmap + 8 + i * 8), fmt = dv.getUint16(off);
    if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) if (!sub || fmt === 12 || (fmt === 4 && sub.fmt !== 12)) sub = { fmt, off };
  }
  const glyph = (cp: number) => {
    if (!sub) return 0;
    const o = sub.off;
    if (sub.fmt === 4) {
      const segX2 = dv.getUint16(o + 6), ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let g = 0; g < segX2 / 2; g++) {
        if (cp > dv.getUint16(ends + g * 2)) continue;
        const start = dv.getUint16(starts + g * 2); if (cp < start) return 0;
        const delta = dv.getInt16(deltas + g * 2), ro = dv.getUint16(ranges + g * 2);
        if (!ro) return (cp + delta) & 0xffff;
        const gi = dv.getUint16(ranges + g * 2 + ro + (cp - start) * 2); return gi ? (gi + delta) & 0xffff : 0;
      }
    } else if (sub.fmt === 12) {
      for (let g = 0; g < dv.getUint32(o + 12); g++) { const b = o + 16 + g * 12, sc = dv.getUint32(b), ec = dv.getUint32(b + 4); if (cp < sc) return 0; if (cp <= ec) return dv.getUint32(b + 8) + (cp - sc); }
    }
    return 0;
  };
  return { upem, adv: cp => dv.getUint16(tables.hmtx + Math.min(glyph(cp), numH - 1) * 4) };
}
const widthOf = (m: Metrics, text: string, size: number, tr = 0) => { let w = 0, n = 0; for (const ch of text) { w += m.adv(ch.codePointAt(0)!) / m.upem; n++; } return (w + Math.max(0, n - 1) * tr) * size; }; // glyph extent; tracking between letters only

// ==== COMPOSING ====
type Spec = { lines: string[]; subtitle: string; combo: Combo };
type Anchor = { left?: number; right?: number; cx?: number; top?: number; bottom?: number; cy?: number }; // right/bottom = distance from that edge
type Block = { id: string; role: TextRole; lines: string[]; size: number; color: string; tone: Tone; tracking?: number; lineHeight?: number; align?: Align; textCase?: TextCase; gap?: number };
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tokens = (lines: string[]) => { // words, but a short token ("ii.", "of") joins the word after it (or before it, at the end) so it never stands alone
  const out: string[] = [];
  let lead = "";
  for (const w of lines.join(" ").split(/\s+/).filter(Boolean)) { if (w.replace(/[^\p{L}\p{N}]/gu, "").length < 3) { lead = lead ? `${lead} ${w}` : w; continue; } out.push(lead ? `${lead} ${w}` : w); lead = ""; }
  if (lead) { if (out.length) out[out.length - 1] += ` ${lead}`; else out.push(lead); }
  return out;
};

function compose({ lines: raw, subtitle: sub, combo }: Spec, m: Metrics): CoverDoc {
  const { layout, variant, palette: p, font, textCase } = combo;
  const { width: W, height: H } = coverSize;
  const F = fontKey(font);
  const upper = textCase === "upper";
  const lines = raw.map(l => applyCase(l, textCase)); // cased copies are measured; items store the raw text and the case flag
  const rawWords = tokens(raw); const words = rawWords.map(w => applyCase(w, textCase));
  const stackable = raw.length === 1 && words.length > 1 && words.length <= 4; // one-line titles may be stacked word by word; the author's own line breaks are kept
  const rnd = mulberry(variant);
  const pick = <T,>(...xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const width = (text: string, size: number, tr = 0) => widthOf(m, text, size, tr);
  const fitW = (ls: string[], space: number, max: number, min = 40, tr = 0) => Math.round(Math.max(min, Math.min(max, ...ls.map(l => space / Math.max(1e-6, width(l, 1, tr))))));
  const wrap = (text: string, size: number, space: number, tr = 0) => { const out: string[] = []; let line = ""; for (const w of text.split(/\s+/)) { const next = line ? `${line} ${w}` : w; if (line && width(next, size, tr) > space) { out.push(line); line = w; } else line = next; } if (line) out.push(line); return out; };
  const mh = (w: number) => Math.round(w * markRatio);
  const shapes: Shape[] = [];
  const texts: TextItem[] = [];
  let mark = { x: 0, y: 0, w: 0, color: p.mark, tone: "mark" as Tone };
  const markAt = (w: number, at: Anchor, solid = false) => { mark = { w, color: solid ? p.ink : p.mark, tone: solid ? "ink" : "mark", x: at.left ?? (at.right !== undefined ? W - w - at.right : Math.round((at.cx ?? W / 2) - w / 2)), y: at.top ?? (at.bottom !== undefined ? H - mh(w) - at.bottom : Math.round((at.cy ?? H / 2) - mh(w) / 2)) }; };
  const rect = (id: string, box: { x: number; y: number; w: number; h: number }, style: Partial<Shape>) => { shapes.push({ id, ...box, ...style }); };
  const measure = (b: Block) => { const tc = b.textCase ?? "as-is"; const tr = b.tracking ?? 0; const ls = b.lines.map(l => applyCase(l, tc)); return { w: Math.ceil(Math.max(...ls.map(l => width(l, b.size, tr)))), h: Math.round(ls.length * b.size * (b.lineHeight ?? 1)) }; };
  const stack = (blocks: Block[], at: Anchor, align: Align = "left", colW?: number) => { // a column of text boxes; returns the column's box
    const sized = blocks.filter(b => b.lines.some(Boolean)).map(b => ({ b, ...measure(b) }));
    const cw = colW ?? Math.max(...sized.map(s => s.w));
    const ch = sized.reduce((h, s, i) => h + s.h + (i ? s.b.gap ?? 0 : 0), 0);
    const x0 = at.left ?? (at.right !== undefined ? W - cw - at.right : Math.round((at.cx ?? W / 2) - cw / 2));
    let y = at.top ?? (at.bottom !== undefined ? H - ch - at.bottom : Math.round((at.cy ?? H / 2) - ch / 2));
    sized.forEach((s, i) => {
      if (i) y += s.b.gap ?? 0;
      const a = s.b.align ?? align;
      texts.push({ id: s.b.id, role: s.b.role, text: s.b.lines.join("\n"), font: F, size: s.b.size, lineHeight: s.b.lineHeight ?? 1, tracking: s.b.tracking ?? 0, textCase: s.b.textCase ?? "as-is", color: s.b.color, tone: s.b.tone, x: a === "left" ? x0 : a === "right" ? x0 + cw - s.w : Math.round(x0 + (cw - s.w) / 2), y, w: s.w, h: s.h, align: a, valign: "top" });
      y += s.h;
    });
    return { x: x0, y: y - ch, w: cw, h: ch };
  };
  const title = (size: number, o: Partial<Block> = {}): Block => ({ id: "title", role: "title", lines: raw, size, color: p.ink, tone: "ink", textCase, ...o });
  const rawOf = (st: string[]) => (st === words ? rawWords : raw); // the uncased twin of a cased stack
  const subtitle = (size: number, o: Partial<Block> = {}): Block => ({ id: "sub", role: "sub", lines: [sub], size, color: p.ink, tone: "ink", lineHeight: 1.1, ...o });
  const caption = (o: Partial<Block> = {}): Block => subtitle(24, { textCase: "upper", tracking: 0.2, lineHeight: 1, ...o }); // tracked small caps

  switch (layout.id) {
    case "ink": { const size = fitW(lines, W - 120, 132); stack([title(size), subtitle(fitW([sub], W - 160, Math.round(size * 0.62)), { gap: 10 })], { left: 60, top: Math.round(H * 0.22) }, "center", W - 120); markAt(420, { right: -70, bottom: -120 }); break; }
    case "mark": { const st = stackable ? words : lines; const size = fitW(st, W - 120, 170, 60); markAt(1250, { right: -330, top: -150 }); stack([title(size, { lines: rawOf(st), lineHeight: 0.98, tracking: upper ? 0.02 : 0 })], { left: 60, bottom: 44 }); break; }
    case "band": {
      const edge = pick("top", "bottom"); const all = [...lines, sub].filter(Boolean); const size = fitW(all, W - 120, 120, 56); const bandH = Math.max(400, Math.round(130 + all.length * size * 1.05)); const y = edge === "top" ? 0 : H - bandH;
      if (edge === "top") markAt(900, { left: 50, top: bandH - 20 }); else markAt(950, { left: -200, top: -120 });
      rect("band", { x: 0, y, w: W, h: bandH }, { fill: p.band, tone: "band" });
      stack([title(size, { color: p.bandInk, tone: "bandInk", lineHeight: 1.05, tracking: upper ? 0.02 : 0 }), subtitle(size, { color: p.bandInk, tone: "bandInk", lineHeight: 1.05 })], { left: 60, cy: y + bandH / 2 }); break; }
    case "corner": { const size = fitW(lines, W - 120, 150); markAt(760, { left: -230, bottom: -170 }); stack([title(size), subtitle(fitW([sub], W - 120, Math.round(size * 0.5)), { gap: 14 })], { left: 60, top: 70 }); break; }
    case "veil": { const size = fitW(lines, W - 140, 150); markAt(1150, { cx: W / 2, cy: H / 2 }); stack([title(size), subtitle(fitW([sub], W - 160, Math.round(size * 0.55)), { gap: 14 })], { cx: W / 2, cy: H / 2 }, "center"); break; }
    case "rule": { const size = fitW(lines, W - 120, 140); const weight = pick(2, 6); markAt(pick(380, 240), { right: 60, top: 60 }); const box = stack([title(size), subtitle(fitW([sub], W - 120, Math.round(size * 0.5)), { gap: 16 })], { left: 60, bottom: 70 }); rect("rule", { x: 60, y: box.y - 34 - weight, w: W - 120, h: weight }, { fill: p.ink, tone: "ink" }); break; }
    case "colossus": { // the mark as an abstract shape; type keeps to the far corner
      const w = pick(2400, 3000, 3600); const h = mh(w); const crop = pick("tl", "tr", "bl", "br", "c");
      markAt(w, crop === "tl" ? { left: -Math.round(w * 0.32), top: -Math.round(h * 0.2) } : crop === "tr" ? { right: -Math.round(w * 0.32), top: -Math.round(h * 0.2) } : crop === "bl" ? { left: -Math.round(w * 0.32), bottom: -Math.round(h * 0.2) } : crop === "br" ? { right: -Math.round(w * 0.32), bottom: -Math.round(h * 0.2) } : { cx: W / 2, cy: H / 2 });
      const at: Anchor = crop === "tl" || crop === "c" ? { right: 60, bottom: 60 } : crop === "tr" ? { left: 60, bottom: 60 } : crop === "bl" ? { right: 60, top: 60 } : { left: 60, top: 60 };
      const tr = upper ? 0.18 : 0;
      stack([title(fitW(lines, W * 0.5, 48, 30, tr), { tracking: tr, lineHeight: 1.15 }), caption({ gap: 14 })], at, at.right !== undefined ? "right" : "left"); break; }
    case "signature": { // type fills the width; the mark signs the corner
      let st = stackable ? words : lines; let size = fitW(st, W - 80, 440, 90);
      if (st !== lines && st.length * size * 0.9 > H - 360) { st = lines; size = fitW(st, W - 80, 440, 90); } // stacked words must leave room for the mark
      stack([subtitle(24, { color: p.band, tone: "band", textCase: "upper", tracking: 0.25, lineHeight: 1 })], { left: 40, top: 48 });
      stack([title(size, { lines: rawOf(st), lineHeight: 0.9 })], { left: 40, cy: H / 2 });
      markAt(110, { right: 48, bottom: 40 }, true); break; }
    case "spine": { // vertical title along one edge; rotation is about the box centre, so the box is centred on the column it should occupy
      const side = pick("left", "right"); const text = lines.join("  "); const tr = upper ? 0.12 : 0; const len = H - 160; const size = fitW([text], len, 300, 60, tr); const bh = Math.round(size * 1.15);
      const cx = side === "left" ? 60 + bh / 2 : W - 60 - bh / 2;
      markAt(1700, side === "left" ? { right: -700, top: -200 } : { left: -700, top: -200 });
      texts.push({ id: "title", role: "title", text: raw.join("  "), font: F, size, lineHeight: 1, tracking: tr, textCase, color: p.ink, tone: "ink", x: Math.round(cx - len / 2), y: Math.round(H / 2 - bh / 2), w: len, h: bh, align: "left", valign: "middle", rotate: side === "left" ? -90 : 90 });
      stack([subtitle(30)], side === "left" ? { right: 60, bottom: 60 } : { left: 60, bottom: 60 }, side === "left" ? "right" : "left"); break; }
    case "split": { // two-tone field
      const vertical = pick(true, false); const cut = Math.round((vertical ? W : H) * pick(0.38, 0.5, 0.62));
      rect("panel", vertical ? { x: 0, y: 0, w: cut, h: H } : { x: 0, y: 0, w: W, h: cut }, { fill: p.band, tone: "band", under: true });
      if (vertical) markAt(1300, { left: cut - 100, top: pick(-150, 300) }); else markAt(1100, { left: -250, top: cut - 80 });
      const st = vertical && stackable ? words : lines; const size = fitW(st, (vertical ? cut : W) - 100, vertical ? 120 : 140, 44);
      stack([title(size, { lines: rawOf(st), color: p.bandInk, tone: "bandInk" })], vertical ? { left: 50, bottom: 50 } : { left: 60, top: 60 });
      stack([caption()], vertical ? { right: 50, bottom: 50 } : { left: 60, bottom: 50 }, vertical ? "right" : "left"); break; }
    case "frame": { // hairline frame, solid crest, centred type
      const inset = pick(36, 56); const kind = pick("single", "double", "corners"); const crest = pick(150, 210); const tr = upper ? 0.1 : 0;
      if (kind === "corners") (["top", "bottom"] as const).forEach(y => (["left", "right"] as const).forEach(x => rect(`corner-${y}-${x}`, { x: x === "left" ? inset : W - inset - 70, y: y === "top" ? inset : H - inset - 70, w: 70, h: 70 }, { stroke: p.ink, strokeWidth: 2, sides: [y, x], tone: "ink" })));
      else { rect("frame", { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset }, { stroke: p.ink, strokeWidth: 2, tone: "ink" }); if (kind === "double") rect("frame-2", { x: inset + 10, y: inset + 10, w: W - 2 * inset - 20, h: H - 2 * inset - 20 }, { stroke: p.ink, strokeWidth: 1, tone: "ink" }); }
      markAt(crest, { cx: W / 2, top: inset + 90 }, true);
      stack([title(fitW(lines, W - 2 * inset - 120, 120, 40, tr), { tracking: tr, lineHeight: 1.1 })], { cx: W / 2, cy: H / 2 }, "center");
      stack([caption({ tracking: 0.25 })], { cx: W / 2, bottom: inset + 50 }, "center"); break; }
    case "scale": { // one word enormous
      const at = words.reduce((best, w, i) => (w.length > words[best].length ? i : best), 0); const key = words[at] ?? ""; const before = rawWords.slice(0, at).join(" "); const after = rawWords.slice(at + 1).join(" ");
      const big = fitW([key], W - 100, 440, 120); const small = Math.round(Math.min(90, Math.max(36, big * 0.2)));
      markAt(900, { right: -250, top: -120 });
      stack([title(small, { id: "before", lines: [before], lineHeight: 1.1 }), title(big, { lines: [rawWords[at] ?? ""], lineHeight: 0.9 }), title(small, { id: "after", lines: [after], lineHeight: 1.1, gap: 10 }), subtitle(Math.round(Math.min(70, Math.max(30, big * 0.16))), { color: p.band, tone: "band", align: "right", gap: 20 })], { left: 50, bottom: 90 }, "left", W - 100);
      const k = texts.find(t => t.id === "title"); if (k) k.x -= Math.round(big * 0.04); break; }
    case "whisper": { // almost nothing
      const [fx, fy] = pick([0.12, 0.18], [0.56, 0.18], [0.12, 0.7], [0.5, 0.7]); const right = fx >= 0.5; const size = fitW(lines, W * 0.4, 54, 30);
      stack([title(size, { lineHeight: 1.15 }), subtitle(fitW([sub], W * 0.5, Math.round(size * 0.7), 20), { lineHeight: 1.2, gap: 8 })], right ? { right: 60, top: Math.round(H * fy) } : { left: Math.round(W * fx), top: Math.round(H * fy) }, right ? "right" : "left");
      markAt(90, fy < 0.5 ? { right: 60, bottom: 60 } : { right: 60, top: 60 }, true); break; }
    case "column": { // narrow side column of stacked words
      const side = pick("right", "left"); const colW = Math.round(W * 0.34); const size = fitW(words, colW, 110, 44);
      markAt(1600, side === "right" ? { left: -900, top: -120 } : { right: -900, top: -120 });
      stack([caption({ lines: wrap(sub.toUpperCase(), 22, colW, 0.25), size: 22, tracking: 0.25, lineHeight: 1.5 }), title(size, { lines: rawWords, gap: 26 })], side === "right" ? { right: 60, top: 90 } : { left: 60, top: 90 }, "left", colW); break; }
    case "ledger": { // ruled rows
      const n = pick(4, 6); const top = 80; const gap = (H - 160) / n;
      for (let i = 0; i <= n; i++) rect(`rule-${i}`, { x: 60, y: Math.round(top + i * gap), w: W - 120, h: 1 }, { fill: p.ink, tone: "ink" });
      stack([title(fitW(lines, W - 140, Math.round((gap - 40) / lines.length), 36))], { left: 60, top: top + 20 });
      markAt(Math.min(140, Math.round((gap - 40) / markRatio)), { right: 60, top: Math.round(top + gap + 20) }, true);
      stack([caption({ size: Math.min(30, Math.round(gap * 0.3)), tracking: 0.15 })], { right: 60, top: Math.round(top + (n - 1) * gap + 20) }, "right"); break; }
    case "plaque": { // small solid plaque over an enormous ghost
      const pw = 440; const size = fitW(lines, pw - 60, 72, 34); const ph = 60 + Math.round(lines.length * size * 1.1);
      const left = pick(true, false), top = pick(true, false); const x = left ? 70 : W - 70 - pw, y = top ? 110 : H - 110 - ph;
      markAt(2200, { left: pick(-600, -1200), top: pick(-300, -700) });
      rect("plaque", { x, y, w: pw, h: ph }, { fill: p.band, tone: "band" });
      stack([title(size, { color: p.bandInk, tone: "bandInk", lineHeight: 1.1 })], { left: x + 30, cy: y + ph / 2 });
      stack([caption()], top ? { left: 70, bottom: 60 } : { left: 70, top: 60 }, left ? "right" : "left", W - 140); break; }
    case "inverse": { // the subtitle is the big type
      markAt(700, { right: -200, top: 200 });
      if (sub) { stack([title(34, { tracking: 0.2, lineHeight: 1.3 })], { left: 60, top: 60 }); stack([subtitle(fitW([sub], W - 120, 150, 60), { color: p.band, tone: "band", lineHeight: 1 })], { left: 60, bottom: 70 }); }
      else stack([title(fitW(lines, W - 120, 150, 60), { color: p.band, tone: "band" })], { left: 60, bottom: 70 }); break; }
    case "tracking": { // letters spaced across the width between rules
      const tr = pick(0.35, 0.5, 0.7); const size = fitW(lines, W - 120, 150, 40, tr);
      markAt(1100, { cx: W / 2, cy: H / 2 });
      const box = stack([title(size, { tracking: tr, lineHeight: 1.15 })], { cx: W / 2, cy: H / 2 }, "center");
      rect("rule-top", { x: 60, y: box.y - 41, w: W - 120, h: 1 }, { fill: p.ink, tone: "ink" });
      rect("rule-bottom", { x: 60, y: box.y + box.h + 40, w: W - 120, h: 1 }, { fill: p.ink, tone: "ink" });
      stack([subtitle(28)], { cx: W / 2, top: box.y + box.h + 71 }, "center"); break; }
  }
  const from = { layout: layout.id, variant: String(variant), palette: p.id, font: F, case: textCase };
  return { v: 1, sheet: p.bg, mark, shapes, texts, from };
}

// ==== DRAWING ====
async function draw(doc: CoverDoc) {
  const { width: W, height: H } = coverSize;
  const used = [...new Set(doc.texts.map(t => t.font))].map(k => fontByKey(k)).filter((f): f is CoverFont => !!f);
  const [markSrc, ...datas] = await Promise.all([tintedMark(doc.mark.color), ...used.map(loadFont)]);
  const fontsOut = used.map((f, i) => ({ name: f.family, data: datas[i], weight: f.weight, style: (f.italic ? "italic" : "normal") as "italic" | "normal" }));
  const shape = (s: Shape): ReactNode => {
    const style: CSSProperties = { position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, ...(s.fill ? { background: s.fill } : {}) }; // satori rejects undefined values
    if (s.stroke) { const line = `${s.strokeWidth ?? 1}px solid ${s.stroke}`; if (s.sides) for (const side of s.sides) style[`border${side[0].toUpperCase()}${side.slice(1)}` as "borderTop"] = line; else style.border = line; }
    return <div key={s.id} style={style} />;
  };
  const text = (t: TextItem): ReactNode => {
    const f = fontByKey(t.font) ?? used[0];
    const just = { top: "flex-start", middle: "center", bottom: "flex-end" }[t.valign]; const items = { left: "flex-start", center: "center", right: "flex-end" }[t.align];
    return (
      <div key={t.id} style={{ position: "absolute", left: t.x, top: t.y, width: t.w, height: t.h, display: "flex", flexDirection: "column", justifyContent: just, alignItems: items, ...(t.rotate ? { transform: `rotate(${t.rotate}deg)` } : {}) }}>
        {applyCase(t.text, t.textCase).split("\n").map((l, i) => <div key={i} style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: t.size, lineHeight: t.lineHeight, letterSpacing: Math.round(t.tracking * t.size), color: t.color, whiteSpace: "nowrap", textAlign: t.align }}>{l || " "}</div>)}
      </div>
    );
  };
  const body = (
    <div style={{ width: W, height: H, display: "flex", position: "relative", background: doc.sheet, overflow: "hidden" }}>
      {doc.shapes.filter(s => s.under).map(shape)}
      {doc.mark.w > 0 && <img src={markSrc} width={doc.mark.w} height={Math.round(doc.mark.w * markRatio)} style={{ position: "absolute", left: doc.mark.x, top: doc.mark.y }} />}
      {doc.shapes.filter(s => !s.under).map(shape)}
      {doc.texts.map(text)}
    </div>
  );
  const res = new ImageResponse(body, { width: W, height: H, ...(fontsOut.length ? { fonts: fontsOut } : {}) });
  return Buffer.from(await res.arrayBuffer()); // rendered here, so a failure surfaces as an error instead of a closed socket
}

// ==== REQUESTS ====
const get = (source: URLSearchParams | Record<string, unknown>, k: string) => String((source instanceof URLSearchParams ? source.get(k) : source[k]) ?? "");
function spec(source: URLSearchParams | Record<string, unknown>): Spec {
  const lines = get(source, "lines").split("|").map(s => s.trim()).filter(Boolean);
  const textCase = get(source, "case") as TextCase;
  const combo = comboFor(get(source, "id") || lines.join("|"), { // unknown or missing axis values fall back to a deterministic pick
    layout: layoutById(get(source, "layout"))?.id,
    variant: /^\d+$/.test(get(source, "variant")) ? Number(get(source, "variant")) : undefined,
    palette: (get(source, "palette") || undefined) as PaletteId | undefined,
    font: get(source, "font") || undefined,
    textCase: ["as-is", "upper", "lower"].includes(textCase) ? textCase : undefined,
  });
  return { lines: lines.length ? lines : ["Untitled"], subtitle: get(source, "sub").trim(), combo };
}
const docFrom = (source: URLSearchParams | Record<string, unknown>): CoverDoc | null => { // a document sent by the studio, or null to compose one
  const raw = source instanceof URLSearchParams ? source.get("doc") : source.doc;
  if (!raw) return null;
  const doc = (typeof raw === "string" ? JSON.parse(raw) : raw) as CoverDoc;
  if (doc?.v !== 1 || !Array.isArray(doc.texts) || !Array.isArray(doc.shapes) || !doc.mark) throw new Error("Not a cover document");
  return doc;
};
async function resolve(source: URLSearchParams | Record<string, unknown>) { const sent = docFrom(source); if (sent) return sent; const s = spec(source); return compose(s, await metricsFor(s.combo.font)); }

export async function GET(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  try {
    const doc = await resolve(params);
    if (params.get("as") === "doc") return Response.json(doc, { headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(await draw(doc)), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id ?? "").replace(/[^a-z0-9-]/gi, "");
  if (!id) return Response.json({ error: "Needs an id" }, { status: 400 });
  try {
    const doc = await resolve(body);
    const png = await draw(doc);
    const webp = await sharp(png).webp({ quality: 88 }).toBuffer();
    const dir = path.join(root, generatedFolder);
    await mkdir(dir, { recursive: true });
    const name = `${id}-${docHash(doc)}.webp`; // the name changes with the content, so a new cover replaces the old one everywhere
    await writeFile(path.join(dir, name), webp);
    for (const f of await readdir(dir)) if (f !== name && new RegExp(`^${id}(-[0-9a-f]{8})?\\.webp$`).test(f)) await unlink(path.join(dir, f)).catch(() => {});
    return Response.json({ src: `/${generatedFolder}/${name}`, doc });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
