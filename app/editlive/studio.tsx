"use client";
// The cover studio: a generated cover becomes a document edited in place on the stage, with its text, fonts and colours in a panel beside it,
// random proposals to start from and saved variants to come back to. Documents and rendering live in lib/cover-doc.ts and app/api/cover/route.tsx.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Plus, Shuffle, Trash2, X } from "lucide-react";
import type { Composition } from "@/lib/compositions";
import { boldWeight, comboFor, comboParams, coverFonts, coverPalettes, coverSize, defaultSubtitle, faceOf, familyOf, fontByKey, fontKey, sampleCombos, type Combo, type Weight } from "@/lib/cover-looks";
import { applyCase, fontsCssUrl, markRatio, recolor, type CoverDoc, type Shape, type TextItem, type TextRole } from "@/lib/cover-doc";

type Box = { left: number; top: number; width: number; height: number };
type Props = { piece: Composition; pending: Composition[]; getBox: () => Box | null; onApply: (id: string, src: string, doc: CoverDoc) => void; onSaved: (saved: CoverDoc[]) => void; onClose: () => void; notify: (message: string) => void };
type Sel = string | null; // a text item's id, or "mark"
type Drag = { id: string; kind: "move" | "size"; x0: number; y0: number; start: { x: number; y: number; w: number; h: number; size: number } };

const { width: CW, height: CH } = coverSize;
const proposals = 8; // random strip size
// ==== FACES ==== a text's font key names one face; B and i move within the family's weights and italics
const faceParts = (key: string) => { const m = key.match(/^(.+):(\d{3}):([in])$/); return m ? { family: m[1], weight: Number(m[2]) as Weight, italic: m[3] === "i" } : null; };
const withFamily = (key: string, name: string) => { const fam = familyOf(name); const cur = faceParts(key); return fam ? fontKey((cur && faceOf(fam, cur.weight, cur.italic)) ?? fam) : key; }; // keep weight and italic when the new family has them
const toggleBold = (key: string) => { const cur = faceParts(key); const fam = cur && familyOf(cur.family); return cur && fam ? fontKey(faceOf(fam, cur.weight > fam.weight ? fam.weight : boldWeight(fam), cur.italic) ?? fam) : key; };
const toggleItalic = (key: string) => { const cur = faceParts(key); const fam = cur && familyOf(cur.family); return cur && fam?.italics ? fontKey(faceOf(fam, cur.weight, !cur.italic) ?? fam) : key; };
function FaceButtons({ t, onChange }: { t: TextItem; onChange: (patch: Partial<TextItem>) => void }) {
  const cur = faceParts(t.font); const fam = cur && familyOf(cur.family);
  return (
    <>
      <button className={cur && fam && cur.weight > fam.weight ? "on" : ""} disabled={!fam || fam.weights.length < 2} onClick={() => onChange({ font: toggleBold(t.font) })} title="Bold"><b>B</b></button>
      <button className={cur?.italic ? "on" : ""} disabled={!fam?.italics} onClick={() => onChange({ font: toggleItalic(t.font) })} title="Italic"><i>i</i></button>
      <button className={t.textCase === "upper" ? "on" : ""} onClick={() => onChange({ textCase: t.textCase === "upper" ? "as-is" : "upper" })} title="Capitals">TT</button>
      <button className={t.textCase === "lower" ? "on" : ""} onClick={() => onChange({ textCase: t.textCase === "lower" ? "as-is" : "lower" })} title="Lowercase">tt</button>
    </>
  );
}
function FamilySelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return <select value={faceParts(value)?.family ?? ""} onChange={e => onChange(withFamily(value, e.target.value))} aria-label="Font">{coverFonts.map(f => <option key={f.family} value={f.family}>{f.family}</option>)}</select>;
}
const titleLines = (p: Composition) => { const l = p.lines.filter(Boolean); return l.length ? l : [p.title || "Untitled"]; };
const docUrl = (lines: string[], sub: string, c: Combo) => `/api/cover?${new URLSearchParams({ lines: lines.join("|"), sub, as: "doc", ...comboParams(c) })}`;
async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as { src?: string; doc?: CoverDoc; error?: string };
  if (!data.src || !data.doc) throw new Error(data.error ?? "Could not render");
  return data as { src: string; doc: CoverDoc };
}
async function fetchDoc(url: string) { const res = await fetch(url); const data = (await res.json()) as CoverDoc & { error?: string }; if (!res.ok) throw new Error(data.error ?? "Could not compose"); return data; }

// ==== DOCUMENT VIEW ==== the same markup draws the stage cover and every thumbnail
const fontStyle = (key: string): CSSProperties => { const f = fontByKey(key); return f ? { fontFamily: `"${f.family}"`, fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal" } : {}; };
const shapeStyle = (s: Shape): CSSProperties => {
  const style: CSSProperties = { position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, background: s.fill, boxSizing: "border-box" };
  if (s.stroke) { const line = `${s.strokeWidth ?? 1}px solid ${s.stroke}`; if (s.sides) for (const side of s.sides) style[`border${side[0].toUpperCase()}${side.slice(1)}` as "borderTop"] = line; else style.border = line; }
  return style;
};
function TextEl({ t, tick, onDown, onMeasure }: { t: TextItem; tick: number; onDown?: (e: ReactPointerEvent, id: string) => void; onMeasure?: (id: string, w: number, h: number) => void }) {
  const inner = useRef<HTMLDivElement>(null);
  const sig = `${t.text}|${t.font}|${t.size}|${t.tracking}|${t.textCase}|${t.lineHeight}|${tick}`;
  useLayoutEffect(() => { if (inner.current && onMeasure) onMeasure(t.id, inner.current.offsetWidth, inner.current.offsetHeight); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const just = { top: "flex-start", middle: "center", bottom: "flex-end" }[t.valign];
  const items = { left: "flex-start", center: "center", right: "flex-end" }[t.align];
  return (
    <div className="t" style={{ position: "absolute", left: t.x, top: t.y, width: t.w, height: t.h, display: "flex", flexDirection: "column", justifyContent: just, alignItems: items, transform: t.rotate ? `rotate(${t.rotate}deg)` : undefined, cursor: onDown ? "move" : undefined }} onPointerDown={onDown ? e => onDown(e, t.id) : undefined}>
      <div ref={inner} style={{ display: "flex", flexDirection: "column", alignItems: items, width: "max-content" }}>
        {applyCase(t.text, t.textCase).split("\n").map((l, i) => <div key={i} style={{ ...fontStyle(t.font), fontSize: t.size, lineHeight: t.lineHeight, letterSpacing: Math.round(t.tracking * t.size), color: t.color, whiteSpace: "pre", textAlign: t.align }}>{l || " "}</div>)}
      </div>
    </div>
  );
}
function DocView({ doc, scale, tick = 0, onDown, onMeasure }: { doc: CoverDoc; scale: number; tick?: number; onDown?: (e: ReactPointerEvent, id: string) => void; onMeasure?: (id: string, w: number, h: number) => void }) {
  const m = doc.mark;
  return (
    <div className="doc" style={{ width: CW * scale, height: CH * scale }}>
      <div className="doc-inner" style={{ width: CW, height: CH, transform: `scale(${scale})`, background: doc.sheet }}>
        {doc.shapes.filter(s => s.under).map(s => <div key={s.id} style={shapeStyle(s)} />)}
        {m.w > 0 && <div className="m" style={{ position: "absolute", left: m.x, top: m.y, width: m.w, height: Math.round(m.w * markRatio), background: m.color, cursor: onDown ? "move" : undefined }} onPointerDown={onDown ? e => onDown(e, "mark") : undefined} />}
        {doc.shapes.filter(s => !s.under).map(s => <div key={s.id} style={shapeStyle(s)} />)}
        {doc.texts.map(t => <TextEl key={t.id} t={t} tick={tick} onDown={onDown} onMeasure={onMeasure} />)}
      </div>
    </div>
  );
}

// ==== STUDIO ====
export function CoverStudio({ piece, pending, getBox, onApply, onSaved, onClose, notify }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(() => getBox());
  const [doc, setDoc] = useState<CoverDoc | null>(piece.cover.doc ?? null);
  const [sel, setSel] = useState<Sel>(null);
  const [random, setRandom] = useState<CoverDoc[]>([]);
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // bumps when web fonts finish loading, so text boxes re-measure
  const history = useRef<CoverDoc[]>([]);
  const drag = useRef<Drag | null>(null);
  const lines = titleLines(piece);
  const sub = doc?.texts.find(t => t.role === "sub")?.text ?? defaultSubtitle(piece.ensemble);
  const saved = piece.cover.saved ?? [];
  const k = box ? box.width / CW : 0.3;

  const commit = useCallback((next: CoverDoc) => { setDoc(prev => { if (prev) history.current = [...history.current.slice(-49), prev]; return next; }); }, []);
  const edit = (fn: (d: CoverDoc) => CoverDoc) => { if (doc) commit(fn(doc)); };
  const undo = () => { const prev = history.current.pop(); if (prev) setDoc(prev); };

  useEffect(() => { // follow the cover on the stage
    const read = () => { const b = getBox(); if (b) setBox(prev => (prev && prev.left === b.left && prev.top === b.top && prev.width === b.width && prev.height === b.height ? prev : b)); };
    read();
    const id = window.setInterval(read, 250);
    window.addEventListener("resize", read);
    return () => { window.clearInterval(id); window.removeEventListener("resize", read); };
  }, [getBox]);
  useEffect(() => { const on = () => setTick(t => t + 1); document.fonts.addEventListener("loadingdone", on); void document.fonts.ready.then(on); return () => document.fonts.removeEventListener("loadingdone", on); }, []);
  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => { // random proposals, one composition each
    let live = true;
    const combos = sampleCombos(`${piece.id}/${seed}`, proposals);
    void Promise.all(combos.map(c => fetchDoc(docUrl(lines, defaultSubtitle(piece.ensemble), c)).catch(() => null))).then(docs => { if (!live) return; const ok = docs.filter((d): d is CoverDoc => !!d); setRandom(ok); setDoc(d => d ?? ok[0] ?? null); });
    return () => { live = false; };
  }, [piece.id, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const measured = useCallback((id: string, w: number, h: number) => { // the browser's text size wins; keep the box anchored by its alignment
    setDoc(d => {
      if (!d) return d;
      const t = d.texts.find(x => x.id === id);
      if (!t || (Math.abs(t.w - w) <= 1 && Math.abs(t.h - h) <= 1)) return d;
      const x = t.align === "right" ? t.x + t.w - w : t.align === "center" ? Math.round(t.x + (t.w - w) / 2) : t.x;
      const y = t.valign === "bottom" ? t.y + t.h - h : t.valign === "middle" ? Math.round(t.y + (t.h - h) / 2) : t.y;
      return { ...d, texts: d.texts.map(item => (item.id === id ? { ...item, x, y, w, h } : item)) };
    });
  }, []);

  const down = (e: ReactPointerEvent, id: string, kind: Drag["kind"] = "move") => {
    if (!doc) return;
    e.stopPropagation(); e.preventDefault();
    setSel(id);
    const t = doc.texts.find(x => x.id === id);
    const start = id === "mark" ? { x: doc.mark.x, y: doc.mark.y, w: doc.mark.w, h: Math.round(doc.mark.w * markRatio), size: 0 } : t ? { x: t.x, y: t.y, w: t.w, h: t.h, size: t.size } : null;
    if (!start) return;
    drag.current = { id, kind, x0: e.clientX, y0: e.clientY, start };
    history.current = [...history.current.slice(-49), doc];
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const g = drag.current; if (!g) return;
    const dx = (e.clientX - g.x0) / k, dy = (e.clientY - g.y0) / k;
    setDoc(d => {
      if (!d) return d;
      if (g.kind === "move") return g.id === "mark" ? { ...d, mark: { ...d.mark, x: Math.round(g.start.x + dx), y: Math.round(g.start.y + dy) } } : { ...d, texts: d.texts.map(t => (t.id === g.id ? { ...t, x: Math.round(g.start.x + dx), y: Math.round(g.start.y + dy) } : t)) };
      const f = Math.max(0.15, (g.start.w + dx) / g.start.w);
      return g.id === "mark" ? { ...d, mark: { ...d.mark, w: Math.round(g.start.w * f) } } : { ...d, texts: d.texts.map(t => (t.id === g.id ? { ...t, size: Math.max(8, Math.round(g.start.size * f)), w: Math.round(g.start.w * f), h: Math.round(g.start.h * f) } : t)) };
    });
  };
  const up = () => { drag.current = null; };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input, textarea, select")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); undo(); return; }
    if (e.key === "Escape") { e.stopPropagation(); if (sel) setSel(null); else if (!busy) onClose(); return; }
    if (!doc || !sel) return;
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); edit(x => (sel === "mark" ? { ...x, mark: { ...x.mark, x: x.mark.x + d[0], y: x.mark.y + d[1] } } : { ...x, texts: x.texts.map(t => (t.id === sel ? { ...t, x: t.x + d[0], y: t.y + d[1] } : t)) })); }
    if ((e.key === "Backspace" || e.key === "Delete") && sel !== "mark") { e.preventDefault(); e.stopPropagation(); edit(x => ({ ...x, texts: x.texts.filter(t => t.id !== sel) })); setSel(null); }
  };

  const setText = (id: string, patch: Partial<TextItem>, record = true) => { if (!doc) return; const next = { ...doc, texts: doc.texts.map(t => (t.id === id ? { ...t, ...patch } : t)) }; if (record) commit(next); else setDoc(next); };
  const setRole = (role: TextRole, color: string) => edit(d => ({ ...d, texts: d.texts.map(t => (t.role === role ? { ...t, color } : t)) }));
  const addText = () => { // the instruments line first if the composition left it out, then free text
    if (!doc) return;
    const base = doc.texts[0]; const sub = !doc.texts.some(t => t.role === "sub"); const id = sub ? "sub" : `text-${Date.now().toString(36)}`;
    commit({ ...doc, texts: [...doc.texts, { id, role: sub ? "sub" : "other", text: sub ? defaultSubtitle(piece.ensemble) || "for …" : "text", font: base?.font ?? fontKey(coverFonts[0]), size: sub ? 36 : 40, lineHeight: 1.1, tracking: 0, textCase: "as-is", color: base?.color ?? "#000000", x: 60, y: Math.round(CH * 0.8), w: 200, h: 40, align: "left", valign: "top" }] });
    setSel(id);
  };
  const apply = async () => { if (!doc) return; setBusy("apply"); try { const r = await post({ id: piece.id, doc }); onApply(piece.id, r.src, r.doc); notify("Cover applied"); } catch (e) { notify((e as Error).message); } finally { setBusy(null); } };
  const all = async () => {
    setBusy("all");
    let n = 0;
    for (const p of pending) { try { const r = await post({ id: p.id, lines: titleLines(p).join("|"), sub: defaultSubtitle(p.ensemble), ...comboParams(comboFor(p.id)) }); onApply(p.id, r.src, r.doc); n++; } catch (e) { notify(`${p.title}: ${(e as Error).message}`); } }
    setBusy(null);
    notify(`Generated ${n} covers · ⌘Z in the editor undoes them one by one`);
  };

  const selected = doc && sel && sel !== "mark" ? doc.texts.find(t => t.id === sel) : null;
  const chrome = useMemo(() => { // selection outline in stage pixels
    if (!doc || !sel || !box) return null;
    const r = sel === "mark" ? { x: doc.mark.x, y: doc.mark.y, w: doc.mark.w, h: Math.round(doc.mark.w * markRatio), rotate: 0 } : (() => { const t = doc.texts.find(x => x.id === sel); return t ? { x: t.x, y: t.y, w: t.w, h: t.h, rotate: t.rotate ?? 0 } : null; })();
    return r && { left: box.left + r.x * k, top: box.top + r.y * k, width: r.w * k, height: r.h * k, transform: r.rotate ? `rotate(${r.rotate}deg)` : undefined };
  }, [doc, sel, box, k]);
  const stageW = root.current?.clientWidth ?? 0;
  const panelLeft = box ? (box.left + box.width + 400 < stageW || box.left < 400 ? box.left + box.width + 20 : box.left - 380) : 20;

  return (
    <div ref={root} className="studio" tabIndex={-1} onKeyDown={onKey} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <link rel="stylesheet" precedence="default" href={fontsCssUrl(coverFonts)} />
      {doc && box && (
        <div className="sheet" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} onPointerDown={() => setSel(null)}>
          <DocView doc={doc} scale={k} tick={tick} onDown={down} onMeasure={measured} />
        </div>
      )}
      {chrome && doc && (
        <div className="chrome" style={chrome} onPointerDown={e => e.stopPropagation()}>
          <span className="handle" onPointerDown={e => down(e, sel!, "size")} />
          {selected && (
            <div className="mini" style={{ transform: chrome.transform ? "none" : undefined }} onPointerDown={e => e.stopPropagation()}>
              <FaceButtons t={selected} onChange={patch => setText(selected.id, patch)} />
              <button onClick={() => setText(selected.id, { tracking: Math.max(-0.05, +(selected.tracking - 0.05).toFixed(2)) })} title="Tighter">−</button>
              <button onClick={() => setText(selected.id, { tracking: Math.min(1, +(selected.tracking + 0.05).toFixed(2)) })} title="Looser">+</button>
              <FamilySelect value={selected.font} onChange={font => setText(selected.id, { font })} />
            </div>
          )}
        </div>
      )}

      <aside className="panel" style={{ left: panelLeft, top: box?.top ?? 20 }} onPointerDown={e => e.stopPropagation()}>
        <header><b>Cover</b><span>{piece.title}</span><button className="icon" onClick={onClose} disabled={!!busy} aria-label="Close"><X size={14} /></button></header>
        {doc ? (
          <>
            <section className="texts">
              {doc.texts.map(t => (
                <div key={t.id} className={`row ${sel === t.id ? "on" : ""}`} onPointerDown={() => setSel(t.id)}>
                  <textarea value={t.text} rows={Math.max(1, t.text.split("\n").length)} spellCheck={false} onChange={e => setText(t.id, { text: e.target.value }, false)} onBlur={() => commit(doc)} aria-label={t.role} />
                  <FamilySelect value={t.font} onChange={font => setText(t.id, { font })} />
                  <div className="case"><FaceButtons t={t} onChange={patch => setText(t.id, patch)} /></div>
                  <input type="color" value={t.color} onChange={e => setText(t.id, { color: e.target.value })} aria-label="Colour" />
                </div>
              ))}
              <button className="ghost" onClick={addText}>{doc.texts.some(t => t.role === "sub") ? "+ text" : "+ instruments"}</button>
            </section>
            <section className="colors">
              <label className="swatch"><i style={{ background: doc.sheet }}><input type="color" value={doc.sheet} onChange={e => edit(d => ({ ...d, sheet: e.target.value }))} /></i><span>sheet</span></label>
              {(["title", "sub"] as const).map(role => { const t = doc.texts.find(x => x.role === role); return t ? <label key={role} className="swatch"><i style={{ background: t.color }}><input type="color" value={t.color} onChange={e => setRole(role, e.target.value)} /></i><span>{role === "sub" ? "inst's" : role}</span></label> : null; })}
              <label className="swatch"><i style={{ background: doc.mark.color }}><input type="color" value={doc.mark.color} onChange={e => edit(d => ({ ...d, mark: { ...d.mark, color: e.target.value } }))} /></i><span>logo</span></label>
              <div className="palettes">{coverPalettes.map(p => <button key={p.id} title={p.id} style={{ background: p.bg, color: p.ink, borderColor: p.band }} onClick={() => edit(d => recolor(d, p))}>A</button>)}</div>
            </section>
            <section className="strip">
              <header><span>random</span><button className="icon" onClick={() => setSeed(s => s + 1)} title="Shuffle" aria-label="Shuffle"><Shuffle size={12} /></button></header>
              <div className="thumbs">{random.map((d, i) => <button key={i} onClick={() => { commit(d); setSel(null); }} title={d.from ? `${d.from.layout} · ${d.from.palette}` : ""}><DocView doc={d} scale={0.084} /></button>)}</div>
            </section>
            <section className="strip">
              <header><span>saved</span><button className="icon" onClick={() => onSaved([...saved, doc])} title="Save this variant" aria-label="Save variant"><Plus size={12} /></button></header>
              <div className="thumbs">{saved.length ? saved.map((d, i) => <span key={i} className="saved"><button onClick={() => { commit(d); setSel(null); }}><DocView doc={d} scale={0.084} /></button><button className="del" onClick={() => onSaved(saved.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={10} /></button></span>) : <em>none yet</em>}</div>
            </section>
            <footer>
              <button className="use" disabled={!!busy} onClick={() => void apply()}>{busy === "apply" ? "Rendering…" : "Use this cover"}</button>
              {pending.length > 0 && <button disabled={!!busy} onClick={() => void all()}>{busy === "all" ? "Generating…" : `Generate all ${pending.length} without a cover`}</button>}
            </footer>
          </>
        ) : <p className="wait">composing…</p>}
      </aside>
    </div>
  );
}
