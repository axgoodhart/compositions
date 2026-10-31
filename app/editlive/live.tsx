"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Minus, Plus, Redo2, RotateCcw, Star, Trash2, Undo2, X } from "lucide-react";
import { CompositionBrowser, type EditorHooks } from "@/components/composition-browser";
import type { Catalog, Composition, Cover, Intro, Room, Settings } from "@/lib/compositions";
import type { AssetKind } from "@/lib/assets";
import { AssetPicker, blank, clamp, clean, coverAspect, fmt, pct, useAssets, validate } from "@/app/edit/shared";
import "@/app/edit/editor.css";
import "./live.css";

// ==== LIVE EDITOR ====
const historyLimit = 120;
const panelKey = "editlive-panel"; // remembers where you parked the inspector
const looks = [["brightness", 0.2, 2, 0.02, 1], ["contrast", 0.2, 2, 0.02, 1], ["saturate", 0, 2, 0.02, 1], ["grayscale", 0, 1, 0.02, 0], ["sepia", 0, 1, 0.02, 0], ["blur", 0, 20, 0.5, 0]] as const;
type TintKind = "none" | "left" | "right" | "top" | "bottom" | "glow" | "vignette";
const tintKinds: TintKind[] = ["none", "left", "right", "top", "bottom", "glow", "vignette"];
const tintDeg: Record<string, TintKind> = { 90: "left", 270: "right", 180: "top", 0: "bottom" };
const degOf: Partial<Record<TintKind, number>> = { left: 90, right: 270, top: 180, bottom: 0 };

// Undo history: update() changes the live draft, commit() records a step once a gesture ends.
function useHistory<T>() {
  const [live, setLive] = useState<T | null>(null);
  const current = useRef<T | null>(null);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, tick] = useState(0);
  const bump = () => tick(n => n + 1);
  const reset = useCallback((value: T) => { current.current = value; setLive(value); past.current = [value]; future.current = []; bump(); }, []);
  const update = useCallback((fn: (value: T) => T) => { if (!current.current) return; current.current = fn(current.current); setLive(current.current); }, []);
  const commit = useCallback(() => {
    const value = current.current;
    if (!value || past.current[past.current.length - 1] === value) return;
    past.current.push(value);
    if (past.current.length > historyLimit) past.current.shift();
    future.current = [];
    bump();
  }, []);
  const undo = useCallback(() => { if (past.current.length < 2) return; future.current.push(past.current.pop() as T); current.current = past.current[past.current.length - 1]; setLive(current.current); bump(); }, []);
  const redo = useCallback(() => { const next = future.current.pop(); if (!next) return; past.current.push(next); current.current = next; setLive(next); bump(); }, []);
  return { live, reset, update, commit, undo, redo, canUndo: past.current.length > 1, canRedo: future.current.length > 0 };
}

function useLater(fn: () => void, ms = 500) { // debounced commit for inputs that fire continuously, like the color wells
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => latest.current(), ms); }, [ms]);
}

export function LiveEditor() {
  const { live: catalog, reset, update, commit, undo, redo, canUndo, canRedo } = useHistory<Catalog>();
  const [savedJson, setSavedJson] = useState("");
  const [view, setView] = useState({ index: 0, immersed: false });
  const [showIntro, setShowIntro] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [select, setSelect] = useState<{ index: number; nonce: number }>();
  const [picker, setPicker] = useState<{ kind: AssetKind; pick: (url: string) => void } | null>(null);
  const [toast, setToast] = useState("");
  const [open, setOpen] = useState(true);
  const [pos, setPos] = useState({ x: 24, y: 96 });
  const [hold, setHold] = useState(false); // park the video on its last frame
  const [compareMode, setCompareMode] = useState<"wipe" | "blend">("wipe");
  const [amount, setAmount] = useState(50); // wipe position or blend opacity, 0–100
  const [peek, setPeek] = useState(false); // hide the frame entirely while a button is held
  const { assets, upload } = useAssets();
  const later = useLater(commit);
  const errors = validate(catalog);
  const dirty = !!catalog && JSON.stringify(catalog) !== savedJson;
  const index = view.index;
  const piece = catalog?.compositions[index];
  const count = catalog?.compositions.length ?? 0;

  useEffect(() => {
    fetch("/api/catalog").then(r => r.json()).then((data: Catalog) => { reset(data); setSavedJson(JSON.stringify(data)); });
    try { const stored = JSON.parse(window.localStorage.getItem(panelKey) ?? ""); if (stored?.x >= 0 && stored?.y >= 0) setPos(stored); } catch { /* default spot */ }
  }, [reset]);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); };
  const save = useCallback(async () => {
    if (!catalog || errors.length) return;
    const res = await fetch("/api/catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(catalog) });
    if (res.ok) { setSavedJson(JSON.stringify(catalog)); setToast("Saved. The public page reloads itself."); }
    else setToast((await res.json()).error ?? "Save failed");
    window.setTimeout(() => setToast(""), 3200);
  }, [catalog, errors.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); void save(); }
      if (typing || !(e.metaKey || e.ctrlKey)) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [save, undo, redo, dirty]);
  useEffect(() => { setHold(false); }, [view.immersed, view.index]);

  // ==== PATCHES ==== all against the live draft, by the index the page is showing
  const patchPiece = (fn: (p: Composition) => Composition) => update(c => ({ ...c, compositions: c.compositions.map((q, i) => (i === index ? fn(q) : q)) }));
  const patch = (p: Partial<Composition>) => patchPiece(q => clean({ ...q, ...p }));
  const patchCover = (p: Partial<Cover>) => patchPiece(q => ({ ...q, cover: clean({ ...q.cover, ...p }) }));
  const patchRoom = (p: Partial<Room>) => patchPiece(q => ({ ...q, room: clean({ ...q.room, ...p }) }));
  const patchIntro = (p: Partial<Intro>) => patchPiece(q => ({ ...q, intro: clean({ ...(q.intro ?? { src: "", play: 4 }), ...p }) as Intro }));
  const patchSettings = (p: Partial<Settings>) => update(c => ({ ...c, settings: { ...c.settings, ...p } }));
  const renameId = (id: string) => update(c => ({ settings: { ...c.settings, homeId: c.settings.homeId === c.compositions[index]?.id ? id : c.settings.homeId }, compositions: c.compositions.map((q, i) => (i === index ? { ...q, id } : q)) }));
  const pick = (kind: AssetKind, set: (url: string) => void) => setPicker({ kind, pick: url => { set(url); setPicker(null); commit(); } });
  const go = (i: number) => setSelect({ index: i, nonce: Date.now() });
  const uniqueId = (base: string) => { const taken = new Set(catalog?.compositions.map(p => p.id)); let id = base; for (let n = 2; taken.has(id); n++) id = `${base}-${n}`; return id; };
  const addPiece = () => { update(c => ({ ...c, compositions: [...c.compositions, blank(uniqueId("new-piece"))] })); commit(); go(count); };
  const duplicate = () => {
    if (!piece) return;
    const copy = { ...structuredClone(piece), id: uniqueId(`${piece.id}-copy`), title: `${piece.title} copy` };
    update(c => ({ ...c, compositions: c.compositions.flatMap((q, i) => (i === index ? [q, copy] : [q])) }));
    commit();
    go(index + 1);
  };
  const remove = () => {
    if (!piece || count < 2 || !window.confirm(`Delete “${piece.title}”? Its files stay in public/.`)) return;
    update(c => { const rest = c.compositions.filter((_, i) => i !== index); return { settings: { ...c.settings, homeId: rest.some(p => p.id === c.settings.homeId) ? c.settings.homeId : rest[0].id }, compositions: rest }; });
    commit();
    go(Math.min(index, count - 2));
  };
  const move = (dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= count) return;
    update(c => { const list = [...c.compositions]; [list[index], list[j]] = [list[j], list[index]]; return { ...c, compositions: list }; });
    commit();
    go(j);
  };
  const startCrop = () => { // frame a quarter of the sheet in the cover's shape; then drag and scroll on the page
    if (!piece) return;
    const img = new Image();
    img.onload = () => { patchCover({ size: `400% ${fmt(400 / (img.naturalWidth / img.naturalHeight / coverAspect))}%`, position: "50% 50%" }); commit(); };
    img.src = piece.cover.src;
  };
  const zoomCover = (w: number) => { const [W, H] = pct(piece?.cover.size); if (W > 0 && H > 0) patchCover({ size: `${fmt(w)}% ${fmt((H * w) / W)}%` }); };

  // ==== LAST FRAME TOOLS ==== the still room is what shows once the video closes; these make it match
  const grabFrame = () => {
    const video = document.querySelector<HTMLVideoElement>(".composition-intro video");
    if (!video || !video.videoWidth) { notify("Turn on “Hold the last frame” first."); return null; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return canvas;
  };
  const frameColor = () => {
    const canvas = grabFrame();
    if (!canvas) return;
    try {
      const dot = document.createElement("canvas");
      dot.width = dot.height = 1;
      const ctx = dot.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0, 1, 1); // a 1×1 downscale is the average color
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      patchRoom({ color: `#${[r, g, b].map(n => n.toString(16).padStart(2, "0")).join("")}` });
      commit();
    } catch { notify("The browser would not read that video's pixels."); }
  };
  const frameAsRoom = () => {
    const canvas = grabFrame();
    if (!canvas || !piece) return;
    canvas.toBlob(async blob => {
      if (!blob) return notify("Could not capture the frame.");
      const [url] = await upload([new File([blob], `${piece.id}-last-frame.jpg`, { type: "image/jpeg" })], "image");
      if (!url) return notify("Upload failed.");
      patchRoom({ src: url, position: piece.intro?.fit === "contain" ? undefined : piece.intro?.position }); // same crop as the video
      commit();
      notify("The room image is now the video's last frame.");
    }, "image/jpeg", 0.92);
  };
  const copyLook = () => {
    if (!piece?.intro) return;
    const none = (v?: string) => (v === "none" ? undefined : v);
    patchRoom({ overlay: none(piece.intro.overlay), filter: none(piece.intro.filter) });
    commit();
  };
  const dragWipe = (e: ReactPointerEvent<HTMLElement>) => {
    const onMove = (ev: PointerEvent) => setAmount(Math.round(clamp((ev.clientX / window.innerWidth) * 100, 0, 100)));
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    e.preventDefault();
  };

  const hooks: EditorHooks = {
    showIntro, replayKey, select,
    hold, compare: hold ? { mode: compareMode, amount: peek ? 0 : amount } : undefined,
    onState: setView,
    onRoom: patchRoom,
    onField: (field, value) => { patch({ [field]: value }); commit(); },
    onLines: lines => { patch({ lines }); commit(); },
    onCover: patchCover,
    onIntro: patchIntro,
    onPickCover: () => pick("image", url => patchCover({ src: url })),
    onCommit: commit,
  };

  const dragPanel = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: PointerEvent) => setPos({ x: Math.max(0, ev.clientX - start.x), y: Math.max(0, ev.clientY - start.y) });
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); setPos(p => { try { window.localStorage.setItem(panelKey, JSON.stringify(p)); } catch { /* fine */ } return p; }); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!catalog) return <main className="editor loading">Loading catalog…</main>;
  const [coverW] = pct(piece?.cover.size);
  const cropping = coverW > 0;
  const video = typeof document === "undefined" ? null : document.querySelector<HTMLVideoElement>(".composition-intro video");

  return (
    <>
      <CompositionBrowser catalog={catalog} editor={hooks} />
      <div className="editor-ui">
        <aside className={`inspector ${open ? "" : "closed"}`} style={{ left: pos.x, top: pos.y }}>
          <header onPointerDown={dragPanel}>
            <span className="dot" /><strong>Live editor</strong>
            <span className="tools">
              <button className="icon" disabled={!canUndo} onClick={undo} title="Undo ⌘Z" aria-label="Undo"><Undo2 size={14} /></button>
              <button className="icon" disabled={!canRedo} onClick={redo} title="Redo ⇧⌘Z" aria-label="Redo"><Redo2 size={14} /></button>
              <button className={`save ${dirty ? "dirty" : ""}`} disabled={!dirty || errors.length > 0} onClick={() => void save()} title="⌘S">{dirty ? "Save" : "Saved"}</button>
              <button className="icon" onClick={() => setOpen(o => !o)} aria-label={open ? "Collapse" : "Expand"}>{open ? <Minus size={14} /> : <Plus size={14} />}</button>
            </span>
          </header>
          {open && piece && (
            <div className="body">
              {errors.length > 0 && <ul className="errors">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
              <p className="hint">Click any text on the page to edit it in place.{view.immersed ? " Drag the empty background to move the room image, or the video while it shows." : " Drag the cover to frame it, scroll over it to zoom, click it to change the image."}</p>

              <section>
                <h2>Composition {index + 1} of {count}</h2>
                <div className="row">
                  <input value={piece.title} onChange={e => patch({ title: e.target.value })} onBlur={commit} aria-label="Title" placeholder="Title" />
                  <input className="id" value={piece.id} onChange={e => renameId(e.target.value)} onBlur={commit} aria-label="Id" spellCheck={false} />
                </div>
                <div className="row buttons">
                  <button onClick={() => move(-1)} disabled={index === 0} aria-label="Move earlier"><ArrowLeft size={13} /></button>
                  <button onClick={() => move(1)} disabled={index === count - 1} aria-label="Move later"><ArrowRight size={13} /></button>
                  <button className={catalog.settings.homeId === piece.id ? "on" : ""} onClick={() => { patchSettings({ homeId: piece.id }); commit(); }}><Star size={13} /> Home</button>
                  <button onClick={addPiece}><Plus size={13} /> Add</button>
                  <button onClick={duplicate} aria-label="Duplicate"><Copy size={13} /></button>
                  <button className="danger" onClick={remove} disabled={count < 2} aria-label="Delete"><Trash2 size={13} /></button>
                </div>
                <button className="link" onClick={() => { patch({ lines: [...piece.lines, "line"] }); commit(); }}>+ Add a title line</button>
              </section>

              {!view.immersed ? (
                <>
                  <section>
                    <h2>Cover</h2>
                    <AssetRow label="Image" value={piece.cover.src} onPick={() => pick("image", url => patchCover({ src: url }))} />
                    <div className="chips">
                      <button className={cropping ? "" : "on"} onClick={() => { patchCover({ size: undefined, position: undefined }); commit(); }}>Whole image</button>
                      <button className={cropping ? "on" : ""} onClick={startCrop}>Crop from sheet</button>
                    </div>
                    {cropping && <Slider label="zoom" value={Math.round(coverW)} min={100} max={1200} step={1} unit="%" onChange={zoomCover} onCommit={commit} />}
                    <span className="label">Look</span>
                    <Look filter={piece.cover.filter} onChange={f => patchCover({ filter: f })} onCommit={commit} />
                  </section>
                  <section>
                    <h2>Gallery</h2>
                    <AssetRow label="Backdrop" value={catalog.settings.galleryImage} onPick={() => pick("image", url => patchSettings({ galleryImage: url }))} />
                    <Slider label="intro cooldown" value={catalog.settings.introCooldownHours} min={0} max={48} step={0.5} unit="h" onChange={v => patchSettings({ introCooldownHours: v })} onCommit={commit} />
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <h2>Room</h2>
                    <AssetRow label="Image" value={piece.room.src} onPick={() => pick("image", url => patchRoom({ src: url }))} onClear={() => { patchRoom({ src: undefined }); commit(); }} />
                    <div className="row">
                      <span className="label">Color</span>
                      <input type="color" value={hex(piece.room.color, "#080d15")} onChange={e => { patchRoom({ color: e.target.value }); later(); }} aria-label="Room color" />
                      <label className="check"><input type="checkbox" checked={!!piece.room.stars} onChange={e => { patchRoom({ stars: e.target.checked }); commit(); }} /> Stars</label>
                    </div>
                    <span className="label">Tint</span>
                    <Tint key={`room-${index}`} overlay={piece.room.overlay} onChange={o => patchRoom({ overlay: o })} onCommit={commit} />
                    <span className="label">Look</span>
                    <Look filter={piece.room.filter} onChange={f => patchRoom({ filter: f })} onCommit={commit} />
                  </section>
                  <section>
                    <div className="section-head"><h2>Intro video</h2><label className="check"><input type="checkbox" checked={!!piece.intro} onChange={e => { patch({ intro: e.target.checked ? { src: "", play: 4 } : undefined }); commit(); }} /> On</label></div>
                    {piece.intro && (
                      <>
                        <AssetRow label="Video" value={piece.intro.src} onPick={() => pick("video", url => patchIntro({ src: url }))} />
                        <div className="chips">
                          <button className={(piece.intro.fit ?? "cover") === "cover" ? "on" : ""} onClick={() => { patchIntro({ fit: "cover" }); commit(); }}>fill the screen</button>
                          <button className={piece.intro.fit === "contain" ? "on" : ""} onClick={() => { patchIntro({ fit: "contain" }); commit(); }}>whole frame</button>
                          <label className="check"><input type="checkbox" checked={showIntro} onChange={e => setShowIntro(e.target.checked)} /> Show</label>
                          <button onClick={() => setReplayKey(k => k + 1)}><RotateCcw size={12} /> Replay timing</button>
                        </div>
                        <Slider label="start" value={piece.intro.start ?? 0} min={0} max={Math.max(1, Math.ceil(video?.duration || 60))} step={0.1} unit="s" onChange={v => patchIntro({ start: v })} onCommit={commit} />
                        <Slider label="play" value={piece.intro.play} min={0.5} max={30} step={0.1} unit="s" onChange={v => patchIntro({ play: v })} onCommit={commit} />
                        <Slider label="speed" value={piece.intro.speed ?? 1} min={0.25} max={3} step={0.05} unit="×" onChange={v => patchIntro({ speed: v })} onCommit={commit} />
                        <Slider label="delay" value={piece.intro.delay ?? 0} min={0} max={10} step={0.1} unit="s" onChange={v => patchIntro({ delay: v })} onCommit={commit} />
                        <div className={`compare-box ${hold ? "on" : ""}`}>
                          <label className="check"><input type="checkbox" checked={hold} onChange={e => { setHold(e.target.checked); if (e.target.checked) setShowIntro(true); }} /> Hold the last frame and compare it with the room</label>
                          {hold && (
                            <>
                              <div className="chips">
                                <button className={compareMode === "wipe" ? "on" : ""} onClick={() => setCompareMode("wipe")}>wipe</button>
                                <button className={compareMode === "blend" ? "on" : ""} onClick={() => setCompareMode("blend")}>blend</button>
                                <button onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}>Hold to hide the frame</button>
                              </div>
                              <Slider label={compareMode === "wipe" ? "frame width" : "frame opacity"} value={peek ? 0 : amount} min={0} max={100} step={1} unit="%" onChange={setAmount} onCommit={() => undefined} />
                              <div className="chips">
                                <button onClick={frameAsRoom}>Use the frame as the room image</button>
                                <button onClick={frameColor}>Match the room color</button>
                                <button onClick={copyLook}>Copy tint and look to the room</button>
                              </div>
                              <p className="hint">Left of the line is the frame the visitor sees last; right of it is the room that appears when the video closes. When they match, the cut disappears.</p>
                            </>
                          )}
                        </div>
                        <span className="label">Tint</span>
                        <Tint key={`intro-${index}`} overlay={piece.intro.overlay} onChange={o => patchIntro({ overlay: o })} onCommit={commit} />
                        <span className="label">Look</span>
                        <Look filter={piece.intro.filter} onChange={f => patchIntro({ filter: f })} onCommit={commit} />
                      </>
                    )}
                  </section>
                  <section>
                    <h2>Sound</h2>
                    <AssetRow label="Recording" value={piece.audio} onPick={() => pick("audio", url => patch({ audio: url }))} onClear={() => { patch({ audio: undefined }); commit(); }} />
                  </section>
                </>
              )}
              <a className="link" href="/edit">Open the table editor <ExternalLink size={12} /></a>
            </div>
          )}
        </aside>
        {hold && compareMode === "wipe" && view.immersed && <div className="wipe" style={{ left: `${peek ? 0 : amount}%` }} onPointerDown={dragWipe}><b>last frame</b><i>room</i><span>⇔</span></div>}
        {picker && <AssetPicker kind={picker.kind} assets={assets} onPick={picker.pick} onClose={() => setPicker(null)} onUpload={upload} />}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

// ==== CONTROLS ====
const hex = (value: string | undefined, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value ?? "") ? (value as string) : fallback);
const alpha = (a: number) => Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0");

function Slider({ label, value, min, max, step, unit, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; onCommit: () => void }) {
  return <label className="slider"><span>{label}<b>{+value.toFixed(2)}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} onPointerUp={onCommit} onKeyUp={onCommit} /></label>;
}

function AssetRow({ label, value, onPick, onClear }: { label: string; value?: string; onPick: () => void; onClear?: () => void }) {
  return (
    <div className="asset-row">
      <span className="label">{label}</span>
      <span className={`path ${value ? "" : "none"}`} title={value}>{value ? value.split("/").pop() : "none"}</span>
      <button onClick={onPick}>Choose</button>
      {onClear && value && <button className="icon" aria-label="Clear" onClick={onClear}><X size={13} /></button>}
    </div>
  );
}

// CSS filter as sliders. Functions it does not know stay untouched at the front of the string.
function parseLook(filter = "") {
  const values: Record<string, number> = {};
  const rest: string[] = [];
  for (const m of filter.matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
    const v = parseFloat(m[2]);
    if (looks.some(l => l[0] === m[1]) && !Number.isNaN(v)) values[m[1]] = v;
    else rest.push(m[0]);
  }
  return { values, rest };
}
function composeLook(values: Record<string, number>, rest: string[]) {
  const parts = [...rest];
  for (const [k, , , , d] of looks) if (values[k] !== undefined && values[k] !== d) parts.push(`${k}(${values[k]}${k === "blur" ? "px" : ""})`);
  return parts.join(" ") || undefined;
}
function Look({ filter, onChange, onCommit }: { filter?: string; onChange: (f: string | undefined) => void; onCommit: () => void }) {
  const { values, rest } = parseLook(filter);
  return (
    <div className="look">
      {looks.map(([k, min, max, step, d]) => <Slider key={k} label={k} value={values[k] ?? d} min={min} max={max} step={step} onChange={v => onChange(composeLook({ ...values, [k]: v }, rest))} onCommit={onCommit} />)}
      {filter && filter !== "none" && <button className="link" onClick={() => { onChange(undefined); onCommit(); }}>Reset look</button>}
    </div>
  );
}

// Overlay gradients as a direction, a color and a strength. Anything else shows as custom CSS.
type TintValue = { kind: TintKind; color: string; strength: number };
function parseTint(overlay = ""): TintValue | null {
  if (!overlay || overlay === "none") return { kind: "none", color: "#000000", strength: 0.5 };
  let m = overlay.match(/^linear-gradient\((\d+)deg,(#[0-9a-f]{6})([0-9a-f]{2}),\2[0-9a-f]{2}\)$/i);
  if (m && tintDeg[m[1]]) return { kind: tintDeg[m[1]], color: m[2], strength: parseInt(m[3], 16) / 255 };
  m = overlay.match(/^radial-gradient\(ellipse at 50% 40%,(#[0-9a-f]{6})([0-9a-f]{2}),transparent 60%\)$/i);
  if (m) return { kind: "glow", color: m[1], strength: parseInt(m[2], 16) / 255 };
  m = overlay.match(/^radial-gradient\(ellipse at center,transparent 40%,(#[0-9a-f]{6})([0-9a-f]{2})\)$/i);
  if (m) return { kind: "vignette", color: m[1], strength: parseInt(m[2], 16) / 255 };
  return null;
}
function composeTint({ kind, color, strength }: TintValue) {
  if (kind === "none") return undefined;
  if (kind === "glow") return `radial-gradient(ellipse at 50% 40%,${color}${alpha(strength)},transparent 60%)`;
  if (kind === "vignette") return `radial-gradient(ellipse at center,transparent 40%,${color}${alpha(strength)})`;
  return `linear-gradient(${degOf[kind]}deg,${color}${alpha(strength)},${color}${alpha(strength * 0.15)})`;
}
function Tint({ overlay, onChange, onCommit }: { overlay?: string; onChange: (o: string | undefined) => void; onCommit: () => void }) {
  const parsed = parseTint(overlay);
  const [custom, setCustom] = useState(!parsed);
  const tint = parsed ?? { kind: "none" as TintKind, color: "#000000", strength: 0.5 };
  const later = useLater(onCommit);
  return (
    <div className="tint">
      <div className="chips">
        {tintKinds.map(k => <button key={k} className={!custom && tint.kind === k ? "on" : ""} onClick={() => { setCustom(false); onChange(composeTint({ ...tint, kind: k })); onCommit(); }}>{k}</button>)}
        <button className={custom ? "on" : ""} onClick={() => setCustom(true)}>custom</button>
      </div>
      {custom ? (
        <textarea rows={2} value={overlay ?? ""} onChange={e => onChange(e.target.value || undefined)} onBlur={onCommit} placeholder="any CSS gradient, several separated by commas" spellCheck={false} />
      ) : tint.kind !== "none" && (
        <div className="row">
          <input type="color" value={tint.color} onChange={e => { onChange(composeTint({ ...tint, color: e.target.value })); later(); }} aria-label="Tint color" />
          <Slider label="strength" value={+tint.strength.toFixed(2)} min={0} max={1} step={0.02} onChange={v => onChange(composeTint({ ...tint, strength: v }))} onCommit={onCommit} />
        </div>
      )}
    </div>
  );
}
