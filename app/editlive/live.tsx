"use client";
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { ChevronRight, Copy, EyeOff, FileText, Film, GripVertical, Music, Plus, Redo2, RotateCcw, Star, Trash2, Undo2, X } from "lucide-react";
import { CompositionBrowser, type EditorHooks } from "@/components/composition-browser";
import type { Catalog, Composition, Cover, Intro, Room, Settings } from "@/lib/compositions";
import { assetKind, mediaFolder, type AssetKind, type MediaRole } from "@/lib/assets";
import { AssetPicker, remember } from "./picker";
import { CoverStudio } from "./studio";
import { isPlaceholderCover } from "@/lib/cover-looks";
import type { CoverDoc } from "@/lib/cover-doc";
import { blank, clamp, clean, coverAspect, fileName, fmt, pct, useAssets, usedBy, validate, type Problem } from "./shared";
import "./live.css";

// ==== LIVE EDITOR ====
const historyLimit = 120;
const sectionKey = "editlive-section";
const importDefault = "/Users/alex/Documents/Cufolio/alexgoodhart/public/player/tracks.json";
const looks = [["brightness", 0.2, 2, 0.02, 1], ["contrast", 0.2, 2, 0.02, 1], ["saturate", 0, 2, 0.02, 1], ["grayscale", 0, 1, 0.02, 0], ["sepia", 0, 1, 0.02, 0], ["blur", 0, 20, 0.5, 0]] as const;
type Section = "piece" | "cover" | "room" | "video" | "sound" | "score" | "site";
type TintKind = "none" | "left" | "right" | "top" | "bottom" | "glow" | "vignette";
const tintKinds: TintKind[] = ["none", "left", "right", "top", "bottom", "glow", "vignette"];
const tintDeg: Record<string, TintKind> = { 90: "left", 270: "right", 180: "top", 0: "bottom" };
const degOf: Partial<Record<TintKind, number>> = { left: 90, right: 270, top: 180, bottom: 0 };
const sectionFor = (p: Problem): Section => (p.field === "cover" ? "cover" : p.field === "video" ? "video" : "piece");

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

function useNatural(...srcs: (string | undefined)[]) { // pixel sizes of the images on screen, for zoom math
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  useEffect(() => {
    for (const src of srcs) {
      if (!src || dims[src]) continue;
      const img = new Image();
      img.onload = () => setDims(d => ({ ...d, [src]: { w: img.naturalWidth, h: img.naturalHeight } }));
      img.src = src;
    }
  }, srcs); // eslint-disable-line react-hooks/exhaustive-deps
  return dims;
}

export function LiveEditor() {
  const { live: catalog, reset, update, commit, undo, redo, canUndo, canRedo } = useHistory<Catalog>();
  const [savedJson, setSavedJson] = useState("");
  const [view, setView] = useState({ index: 0, immersed: false });
  const [section, setSection] = useState<Section | null>("piece");
  const [bare, setBare] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [select, setSelect] = useState<{ index: number; nonce: number }>();
  const [immerse, setImmerse] = useState<{ value: boolean; nonce: number }>();
  const [picker, setPicker] = useState<{ kind: AssetKind; folder: string; current?: string; pick: (url: string) => void } | null>(null);
  const [studio, setStudio] = useState(false); // the cover studio sits over the stage
  const [toast, setToast] = useState("");
  const [hold, setHold] = useState(false); // park the video on its last frame
  const [compareMode, setCompareMode] = useState<"wipe" | "blend">("wipe");
  const [amount, setAmount] = useState(50); // wipe position or blend opacity, 0–100
  const [peek, setPeek] = useState(false); // hide the frame entirely while a button is held
  const [duration, setDuration] = useState(0); // of the intro video on the page
  const [adjust, setAdjust] = useState<Partial<Record<Section, boolean>>>({});
  const [importPath, setImportPath] = useState(importDefault);
  const [copyAudio, setCopyAudio] = useState(false);
  const [report, setReport] = useState(""); // the media organizer's last plan
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 1440, h: 900 }); // the real viewport: the page renders at this size and is scaled into the stage
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  const jump = useRef<HTMLInputElement>(null);
  const { assets, upload, reload } = useAssets();
  const later = useLater(commit);
  const problems = validate(catalog);
  const dirty = !!catalog && JSON.stringify(catalog) !== savedJson;
  const index = view.index;
  const piece = catalog?.compositions[index];
  const count = catalog?.compositions.length ?? 0;
  const roomMedia = piece?.room.video ?? piece?.room.src; // the room's fit, zoom and position belong to the video when there is one
  const natural = useNatural(piece?.cover.src);
  const uses = usedBy(catalog);

  useEffect(() => {
    fetch("/api/catalog").then(r => r.json()).then((data: Catalog) => { reset(data); setSavedJson(JSON.stringify(data)); });
    try { const s = window.localStorage.getItem(sectionKey); if (s) setSection(s === "none" ? null : (s as Section)); } catch { /* default */ }
    const onMeta = (e: Event) => { const v = e.target as HTMLVideoElement; if (v.matches?.(".composition-intro video")) setDuration(v.duration || 0); };
    document.addEventListener("loadedmetadata", onMeta, true);
    return () => document.removeEventListener("loadedmetadata", onMeta, true);
  }, [reset]);
  useEffect(() => { try { window.localStorage.setItem(sectionKey, section ?? "none"); } catch { /* fine */ } }, [section]);
  useEffect(() => { setDuration(document.querySelector<HTMLVideoElement>(".composition-intro video")?.duration || 0); }, [piece?.intro?.src, view.immersed]);
  useEffect(() => { // the open section follows the page when the page moves on its own
    setSection(s => (view.immersed && s === "cover" ? "room" : !view.immersed && (s === "room" || s === "video") ? "cover" : s));
  }, [view.immersed]);
  useEffect(() => {
    const read = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    const ro = new ResizeObserver(([e]) => setStageBox({ w: e.contentRect.width, h: e.contentRect.height }));
    if (stage.current) ro.observe(stage.current);
    return () => { window.removeEventListener("resize", read); ro.disconnect(); };
  }, [!!catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); };
  const go = (i: number) => setSelect({ index: i, nonce: Date.now() });
  const enterRoom = (value: boolean) => setImmerse({ value, nonce: Date.now() });
  const show = (s: Section) => { // open a section and put the page where that section is visible
    setSection(s);
    if (s === "cover" && view.immersed) enterRoom(false);
    if ((s === "room" || s === "video" || s === "score") && !view.immersed) enterRoom(true);
  };
  const toggleSection = (s: Section) => (section === s ? setSection(null) : show(s));
  const save = useCallback(async () => {
    if (!catalog) return;
    if (problems.length) { const p = problems[0]; go(p.index); show(sectionFor(p)); notify(p.message); return; }
    const res = await fetch("/api/catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(catalog) });
    if (res.ok) { setSavedJson(JSON.stringify(catalog)); notify("Saved"); }
    else notify((await res.json()).error ?? "Save failed");
  }, [catalog, problems]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); void save(); return; }
      if (typing) return;
      if (e.key === "\\") { e.preventDefault(); setBare(b => !b); }
      if (e.key === "/") { e.preventDefault(); setBare(false); jump.current?.focus(); }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [save, undo, redo, dirty]);

  // ==== PATCHES ==== all against the live draft, by the index the page is showing
  const patchPiece = (fn: (p: Composition) => Composition) => update(c => ({ ...c, compositions: c.compositions.map((q, i) => (i === index ? fn(q) : q)) }));
  const patch = (p: Partial<Composition>) => patchPiece(q => clean({ ...q, ...p }));
  const patchCover = (p: Partial<Cover>) => patchPiece(q => ({ ...q, cover: clean({ ...q.cover, ...p }) }));
  const setGenerated = (id: string, src: string, doc: CoverDoc) => { update(c => ({ ...c, compositions: c.compositions.map(p => (p.id === id ? { ...p, cover: clean({ ...p.cover, src, doc, size: undefined, position: undefined }) } : p)) })); commit(); };
  const setSavedDocs = (saved: CoverDoc[]) => { patchCover({ saved: saved.length ? saved : undefined }); commit(); };
  const coverBox = useCallback(() => { // where the current cover sits on the stage, in stage pixels
    const art = frame.current?.querySelector(".score-position.current"); const s = stage.current;
    if (!art || !s) return null;
    const a = art.getBoundingClientRect(), b = s.getBoundingClientRect();
    return { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height };
  }, []);
  const patchRoom = (p: Partial<Room>) => patchPiece(q => ({ ...q, room: clean({ ...q.room, ...p }) }));
  const patchIntro = (p: Partial<Intro>) => patchPiece(q => ({ ...q, intro: clean({ ...(q.intro ?? { src: "", play: 4 }), ...p }) as Intro }));
  const patchSettings = (p: Partial<Settings>) => update(c => ({ ...c, settings: { ...c.settings, ...p } }));
  const setLines = (lines: string[]) => patch({ lines, title: lines.filter(Boolean).join(" ") });
  const renameId = (id: string) => update(c => ({ settings: { ...c.settings, homeId: c.settings.homeId === c.compositions[index]?.id ? id : c.settings.homeId }, compositions: c.compositions.map((q, i) => (i === index ? { ...q, id } : q)) }));
  const pick = (kind: AssetKind, role: MediaRole, current: string | undefined, set: (url: string) => void) => setPicker({ kind, folder: mediaFolder[role], current, pick: url => { set(url); remember(kind, url); setPicker(null); commit(); } });
  const uniqueId = (base: string) => { const taken = new Set(catalog?.compositions.map(p => p.id)); let id = base; for (let n = 2; taken.has(id); n++) id = `${base}-${n}`; return id; };
  const addPiece = () => { update(c => ({ ...c, compositions: [...c.compositions, blank(uniqueId("new-piece"))] })); commit(); go(count); show("piece"); };
  const duplicate = () => {
    if (!piece) return;
    const copy = { ...structuredClone(piece), id: uniqueId(`${piece.id}-copy`) };
    update(c => ({ ...c, compositions: c.compositions.flatMap((q, i) => (i === index ? [q, copy] : [q])) }));
    commit();
    go(index + 1);
  };
  const remove = () => {
    if (!piece || count < 2) return;
    update(c => { const rest = c.compositions.filter((_, i) => i !== index); return { settings: { ...c.settings, homeId: rest.some(p => p.id === c.settings.homeId) ? c.settings.homeId : rest[0].id }, compositions: rest }; });
    commit();
    go(Math.min(index, count - 2));
    notify(`Deleted “${piece.title}” · ⌘Z brings it back`);
  };
  const move = (from: number, to: number) => {
    if (from === to) return;
    update(c => { const list = [...c.compositions]; const [m] = list.splice(from, 1); list.splice(to, 0, m); return { ...c, compositions: list }; });
    commit();
    go(to);
  };
  const resolve = (size: string | undefined, position: string | undefined) => { // the cover's crop as numbers for its zoom slider
    const [W, H] = pct(size);
    const [X = 50, Y = 50] = pct(position).map(v => (Number.isNaN(v) ? 50 : v));
    return W > 0 && H > 0 ? { W, H, X, Y } : null;
  };
  const rescale = (g: { W: number; H: number; X: number; Y: number }, w: number) => ({ size: `${fmt(w)}% ${fmt((g.H * w) / g.W)}%`, position: `${fmt(g.X)}% ${fmt(g.Y)}%` });
  const startCrop = () => { // frame a quarter of the sheet in the cover's shape; then drag and scroll on the page
    const d = piece && natural[piece.cover.src];
    if (!d) return;
    patchCover({ size: `400% ${fmt(400 / (d.w / d.h / coverAspect))}%`, position: "50% 50%" });
    commit();
  };
  const importOld = async () => {
    if (!catalog) return;
    const res = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: importPath, copyAudio }) });
    const data = (await res.json()) as { compositions?: Composition[]; error?: string };
    if (!res.ok || !data.compositions) return notify(data.error ?? "Import failed");
    const have = new Set(catalog.compositions.map(p => p.id));
    const fresh = data.compositions.filter(p => !have.has(p.id));
    update(c => ({ ...c, compositions: [...c.compositions, ...fresh] }));
    commit();
    notify(`${fresh.length} added, ${data.compositions.length - fresh.length} already here`);
    if (fresh.length) go(count);
  };
  const dropFile = async (e: DragEvent) => { // a file dropped on the page lands where you are looking
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !piece) return;
    const kind = assetKind(file.name);
    if (!kind) return notify("Not an image, video, recording or PDF");
    const role: MediaRole = kind === "pdf" ? "scores" : kind === "audio" ? "audio" : kind === "video" ? (view.immersed && section === "room" ? "room" : "intro") : view.immersed ? "room" : "cover"; // a video dropped with Room open is the room's
    const [url] = await upload([file], mediaFolder[role]);
    if (!url) return notify("Upload failed");
    remember(kind, url);
    let where = "cover";
    if (role === "scores") { patch({ score: url }); where = "score"; }
    else if (role === "audio") { patch({ audio: url }); where = "recording"; }
    else if (role === "intro") { patchIntro({ src: url }); where = "intro video"; show("video"); }
    else if (role === "room" && kind === "video") { patchRoom({ video: url, zoom: undefined, position: undefined }); where = "room video"; }
    else if (role === "room") { patchRoom({ src: url }); where = "room"; }
    else patchCover({ src: url });
    commit();
    notify(`${fileName(url)} → ${where}`);
  };

  // ==== LAST FRAME TOOLS ==== the still room is what shows once the video closes; these make it match
  const grabFrame = () => {
    const video = document.querySelector<HTMLVideoElement>(".composition-intro video");
    if (!video || !video.videoWidth) { notify("Turn on Compare first"); return null; }
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
    } catch { notify("The browser would not read that video's pixels"); }
  };
  const frameAsRoom = () => {
    const canvas = grabFrame();
    if (!canvas || !piece) return;
    canvas.toBlob(async blob => {
      if (!blob) return notify("Could not capture the frame");
      const [url] = await upload([new File([blob], `${piece.id}-last-frame.jpg`, { type: "image/jpeg" })], mediaFolder.room);
      if (!url) return notify("Upload failed");
      patchRoom({ src: url, fit: piece.intro?.fit === "contain" ? "contain" : undefined, zoom: piece.intro?.zoom, position: piece.intro?.position }); // framed as the video is
      commit();
      notify("The room image is now the last frame");
    }, "image/jpeg", 0.92);
  };
  const copyLook = () => {
    if (!piece?.intro) return;
    const none = (v?: string) => (v === "none" ? undefined : v);
    patchRoom({ overlay: none(piece.intro.overlay), filter: none(piece.intro.filter) });
    commit();
  };
  const organize = async (apply: boolean) => { // files every asset under public/media; the plan comes back as text (lib/media.ts)
    const res = await fetch("/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apply }) });
    const data = (await res.json()) as { report?: string; summary?: string; error?: string };
    if (!res.ok || !data.report) return notify(data.error ?? "Could not plan the files");
    setReport(data.report);
    if (apply) { const fresh = (await (await fetch("/api/catalog")).json()) as Catalog; reset(fresh); setSavedJson(JSON.stringify(fresh)); await reload(); }
    notify(data.summary ?? "Done");
  };
  const dragWipe = (e: ReactPointerEvent<HTMLElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const onMove = (ev: PointerEvent) => setAmount(Math.round(clamp(((ev.clientX - box.left) / box.width) * 100, 0, 100)));
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    e.preventDefault();
  };

  const hooks: EditorHooks = {
    showIntro, replayKey, select, immerse,
    hold, compare: hold ? { mode: compareMode, amount: peek ? 0 : amount } : undefined,
    onState: setView,
    onRoom: patchRoom,
    onField: (field, value) => { patch({ [field]: value }); commit(); },
    onLines: lines => { setLines(lines); commit(); },
    onCover: patchCover,
    onIntro: patchIntro,
    onPickCover: () => pick("image", "cover", piece?.cover.src, url => patchCover({ src: url })),
    onCommit: commit,
  };

  if (!catalog) return <div className="live loading">Loading catalog…</div>;
  const problem = (field: Problem["field"]) => problems.find(p => p.index === index && p.field === field)?.message;
  const scale = stageBox.w && stageBox.h ? Math.min(1, stageBox.w / vp.w, stageBox.h / vp.h) : 1;
  const frameBox = { left: Math.max(0, (stageBox.w - vp.w * scale) / 2), top: Math.max(0, (stageBox.h - vp.h * scale) / 2), width: vp.w * scale, height: vp.h * scale };
  const cover = piece ? resolve(piece.cover.size, piece.cover.position) : null; // whole image has no zoom
  const roomFit = piece?.room.fit ?? "cover", roomZoom = piece?.room.zoom ?? 1;
  const setRoomFit = (fit: NonNullable<Room["fit"]>) => { patchRoom({ fit: fit === "cover" ? undefined : fit, zoom: fit !== "contain" && roomZoom < 1 ? undefined : piece?.room.zoom }); commit(); }; // only whole image goes smaller than the room
  const roomZoomSlider = (label: string) => <Slider label={label} value={roomZoom} min={roomFit === "contain" ? 0.25 : 1} max={6} step={0.01} unit="×" onChange={z => patchRoom({ zoom: z === 1 ? undefined : z })} onCommit={commit} />;
  const intro = piece?.intro;
  const introStart = intro?.start ?? 0, introSpeed = intro?.speed ?? 1, introEnd = introStart + (intro?.play ?? 0) * introSpeed;
  const clipMax = Math.max(duration || 0, introEnd + 1, 5);
  const isHome = !!piece && catalog.settings.homeId === piece.id;
  const open = (s: Section) => section === s;
  const adjusting = (s: Section) => !!adjust[s];
  const toggleAdjust = (s: Section) => setAdjust(a => ({ ...a, [s]: !a[s] }));

  return (
    <div className={`live ${bare ? "bare" : ""}`}>
      <Rail catalog={catalog} index={index} jumpRef={jump} onGo={go} onMove={move} onAdd={addPiece} />

      <div ref={stage} className="stage" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={e => { if (e.dataTransfer.files.length) void dropFile(e); }}>
        <div ref={frame} className="frame" style={{ width: vp.w, height: vp.h, left: frameBox.left, top: frameBox.top, transform: `scale(${scale})` }}>
          <CompositionBrowser catalog={catalog} editor={hooks} />
        </div>
        {hold && compareMode === "wipe" && view.immersed && <div className="wipe" style={{ left: frameBox.left + ((peek ? 0 : amount) / 100) * frameBox.width, top: frameBox.top, height: frameBox.height }} onPointerDown={dragWipe}><b>last frame</b><i>room</i><span>⇔</span></div>}
        {studio && piece && <CoverStudio key={piece.id} piece={piece} pending={catalog.compositions.filter(p => isPlaceholderCover(p.cover.src))} getBox={coverBox} onApply={setGenerated} onSaved={setSavedDocs} onClose={() => setStudio(false)} notify={notify} />}
        {bare && <button className="panels" onClick={() => setBare(false)}>Panels</button>}
        {toast && <div className="toast">{toast}</div>}
      </div>

      <aside className="inspector">
        <header>
          <button className="icon" disabled={!canUndo} onClick={undo} title="Undo ⌘Z" aria-label="Undo"><Undo2 size={14} /></button>
          <button className="icon" disabled={!canRedo} onClick={redo} title="Redo ⇧⌘Z" aria-label="Redo"><Redo2 size={14} /></button>
          <span className="grow" />
          <button className="ghost" onClick={() => setBare(true)} title="Hide the panels  \">Hide</button>
          <button className={`save ${dirty ? "dirty" : ""} ${problems.length ? "blocked" : ""}`} onClick={() => void save()} title={problems[0]?.message ?? "⌘S"}>{dirty ? (problems.length ? "Fix" : "Save") : "Saved"}</button>
        </header>

        {picker ? (
          <AssetPicker kind={picker.kind} folder={picker.folder} assets={assets} uses={uses} current={picker.current} onPick={picker.pick} onClose={() => setPicker(null)} onUpload={upload} />
        ) : piece && (
          <div className="sections">
            <Sec title="Piece" meta={`${index + 1} / ${count}`} open={open("piece")} onOpen={() => toggleSection("piece")}>
              <div className="lines">
                {piece.lines.map((line, i) => <input key={i} value={line} placeholder="title line" onChange={e => setLines(piece.lines.map((l, j) => (j === i ? e.target.value : l)))} onBlur={() => { setLines(piece.lines.filter(Boolean)); commit(); }} />)}
                <button className="ghost" onClick={() => setLines([...piece.lines, ""])}>+ line</button>
              </div>
              <Err text={problem("title")} />
              <label className="field"><span>id</span><input className="mono" value={piece.id} spellCheck={false} onChange={e => renameId(e.target.value)} onBlur={commit} /></label>
              <Err text={problem("id") ?? problem("home")} />
              <div className="grid2">
                <label className="field"><span>year</span><input value={piece.year ?? ""} onChange={e => patch({ year: e.target.value })} onBlur={commit} /></label>
                <label className="field"><span>place</span><input value={piece.place ?? ""} onChange={e => patch({ place: e.target.value })} onBlur={commit} /></label>
                <label className="field"><span>ensemble</span><input value={piece.ensemble ?? ""} onChange={e => patch({ ensemble: e.target.value })} onBlur={commit} /></label>
                <label className="field"><span>duration</span><input value={piece.duration ?? ""} onChange={e => patch({ duration: e.target.value })} onBlur={commit} /></label>
                <label className="field"><span>players</span><input type="number" min={1} step={1} inputMode="numeric" placeholder="sorts only" value={piece.players ?? ""} onChange={e => patch({ players: e.target.value === "" ? undefined : Math.max(1, Math.round(Number(e.target.value))) })} onBlur={commit} /></label>
              </div>
              <div className="chips">
                <button className={isHome ? "on" : ""} onClick={() => { patchSettings({ homeId: piece.id }); commit(); }}><Star size={12} /> Home</button>
                <button className={piece.hidden ? "on" : ""} onClick={() => { patch({ hidden: !piece.hidden }); commit(); }} title="Keep it here, leave it off the site"><EyeOff size={12} /> Hidden</button>
                <button onClick={duplicate}><Copy size={12} /> Duplicate</button>
                <button className="danger" onClick={remove} disabled={count < 2}><Trash2 size={12} /> Delete</button>
              </div>
            </Sec>

            <Sec title="Cover" meta={isPlaceholderCover(piece.cover.src) ? "none yet" : fileName(piece.cover.src)} open={open("cover")} onOpen={() => toggleSection("cover")}>
              <AssetRow kind="image" cover value={piece.cover.src} onPick={() => pick("image", "cover", piece.cover.src, url => patchCover({ src: url, size: undefined, position: undefined }))} />
              <Err text={problem("cover")} />
              <div className="chips">
                <button className={cover ? "" : "on"} onClick={() => { patchCover({ size: undefined, position: undefined }); commit(); }}>whole image</button>
                <button className={cover ? "on" : ""} onClick={startCrop} disabled={!natural[piece.cover.src]}>crop</button>
                <button className={studio ? "on" : ""} onClick={() => setStudio(v => !v)}>{piece.cover.doc ? "edit" : "generate"}</button>
              </div>
              {cover && <Slider label="zoom" value={Math.round(cover.W)} min={100} max={1200} step={1} unit="%" onChange={w => patchCover(rescale(cover, w))} onCommit={commit} />}
              <Adjust open={adjusting("cover")} onToggle={() => toggleAdjust("cover")} active={!!piece.cover.filter}>
                <Look filter={piece.cover.filter} onChange={f => patchCover({ filter: f })} onCommit={commit} />
              </Adjust>
            </Sec>

            <Sec title="Room" meta={fileName(roomMedia) || "color only"} open={open("room")} onOpen={() => toggleSection("room")}>
              <AssetRow kind="image" label="image" value={piece.room.src} onPick={() => pick("image", "room", piece.room.src, url => patchRoom({ src: url, zoom: undefined, position: undefined }))} onClear={() => { patchRoom({ src: undefined, zoom: undefined, position: undefined }); commit(); }} />
              <AssetRow kind="video" label="video" value={piece.room.video} onPick={() => pick("video", "room", piece.room.video, url => patchRoom({ video: url, zoom: undefined, position: undefined }))} onClear={() => { patchRoom({ video: undefined, zoom: undefined, position: undefined }); commit(); }} />
              {roomMedia && <>
                <div className="chips">
                  <button className={roomFit === "cover" ? "on" : ""} onClick={() => setRoomFit("cover")}>fill</button>
                  <button className={roomFit === "contain" ? "on" : ""} onClick={() => setRoomFit("contain")}>{piece.room.video ? "whole frame" : "whole image"}</button>
                  <button className={roomFit === "stretch" ? "on" : ""} onClick={() => setRoomFit("stretch")} title="Fill the room exactly, giving up the proportions">stretch</button>
                </div>
                {roomZoomSlider("zoom")}
              </>}
              <div className="row">
                <label className="swatch"><input type="color" value={hex(piece.room.color, "#080d15")} onChange={e => { patchRoom({ color: e.target.value }); later(); }} aria-label="Room color" /><span>color</span></label>
              </div>
              <Tint key={`room-${index}`} overlay={piece.room.overlay} onChange={o => patchRoom({ overlay: o })} onCommit={commit} />
              <Adjust open={adjusting("room")} onToggle={() => toggleAdjust("room")} active={!!piece.room.filter}>
                <Look filter={piece.room.filter} onChange={f => patchRoom({ filter: f })} onCommit={commit} />
              </Adjust>
            </Sec>

            <Sec title="Video" meta={intro ? `${fileName(intro.src) || "no file"} · ${+intro.play.toFixed(1)}s` : "off"} open={open("video")} onOpen={() => toggleSection("video")}>
              <div className="chips">
                <button className={intro ? "on" : ""} onClick={() => { patch({ intro: intro ? undefined : { src: "", play: 4 } }); commit(); }}>{intro ? "on" : "off"}</button>
                {intro && <>
                  <span className="grow" />
                  <button className={showIntro ? "on" : ""} onClick={() => setShowIntro(s => !s)} title="Keep the video looping on the page">show</button>
                  <button onClick={() => setReplayKey(k => k + 1)} title="Run delay, play and fade once"><RotateCcw size={11} /> replay</button>
                </>}
              </div>
              {intro && <>
                <AssetRow kind="video" value={intro.src} onPick={() => pick("video", "intro", intro.src, url => patchIntro({ src: url }))} />
                <Err text={problem("video")} />
                <div className="chips">
                  <button className={(intro.fit ?? "cover") === "cover" ? "on" : ""} onClick={() => { patchIntro({ fit: "cover" }); commit(); }}>fill</button>
                  <button className={intro.fit === "contain" ? "on" : ""} onClick={() => { patchIntro({ fit: "contain" }); commit(); }}>whole frame</button>
                </div>
                <Slider label="zoom" value={intro.zoom ?? 1} min={intro.fit === "contain" ? 0.25 : 1} max={6} step={0.01} unit="×" onChange={z => patchIntro({ zoom: z === 1 ? undefined : z })} onCommit={commit} />
                <Slider label="from" value={introStart} min={0} max={clipMax} step={0.05} unit="s" onChange={v => patchIntro({ start: v || undefined, play: Math.max(0.1, (introEnd - v) / introSpeed) })} onCommit={commit} />
                <Slider label="to" value={introEnd} min={0} max={clipMax} step={0.05} unit="s" onChange={v => patchIntro({ play: Math.max(0.1, (v - introStart) / introSpeed) })} onCommit={commit} />
                <Slider label="speed" value={introSpeed} min={0.25} max={3} step={0.05} unit="×" onChange={v => patchIntro({ speed: v === 1 ? undefined : v, play: Math.max(0.1, (introEnd - introStart) / v) })} onCommit={commit} />
                <Slider label="delay" value={intro.delay ?? 0} min={0} max={10} step={0.1} unit="s" onChange={v => patchIntro({ delay: v || undefined })} onCommit={commit} />
                <Slider label="fade" value={intro.fade ?? 0.4} min={0} max={4} step={0.1} unit="s" onChange={v => patchIntro({ fade: v === 0.4 ? undefined : v })} onCommit={commit} />
                <p className="meta-line">on screen <b>{+intro.play.toFixed(2)}s</b>{duration ? <> · file <b>{+duration.toFixed(1)}s</b></> : null}</p>

                <div className={`compare ${hold ? "on" : ""}`}>
                  <div className="chips">
                    <button className={hold ? "on" : ""} onClick={() => { setHold(h => !h); if (!hold) setShowIntro(true); }}>compare last frame</button>
                    {hold && <>
                      <button className={compareMode === "wipe" ? "on" : ""} onClick={() => setCompareMode("wipe")}>wipe</button>
                      <button className={compareMode === "blend" ? "on" : ""} onClick={() => setCompareMode("blend")}>blend</button>
                      <button onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)} title="Hold to see the room alone">peek</button>
                    </>}
                  </div>
                  {hold && <>
                    <Slider label={compareMode === "wipe" ? "frame width" : "frame opacity"} value={peek ? 0 : amount} min={0} max={100} step={1} unit="%" onChange={setAmount} onCommit={() => undefined} />
                    {roomMedia && roomZoomSlider("room zoom")}
                    <div className="chips">
                      <button onClick={frameAsRoom}>frame → room image</button>
                      <button onClick={frameColor}>room color ← frame</button>
                      <button onClick={copyLook}>look → room</button>
                    </div>
                  </>}
                </div>

                <Adjust open={adjusting("video")} onToggle={() => toggleAdjust("video")} active={!!(intro.filter || intro.overlay)}>
                  <Tint key={`intro-${index}`} overlay={intro.overlay} onChange={o => patchIntro({ overlay: o })} onCommit={commit} />
                  <Look filter={intro.filter} onChange={f => patchIntro({ filter: f })} onCommit={commit} />
                </Adjust>
              </>}
            </Sec>

            <Sec title="Sound" meta={fileName(piece.audio) || "none"} open={open("sound")} onOpen={() => toggleSection("sound")}>
              <AssetRow kind="audio" value={piece.audio} onPick={() => pick("audio", "audio", piece.audio, url => patch({ audio: url }))} onClear={() => { patch({ audio: undefined }); commit(); }} />
            </Sec>

            <Sec title="Score" meta={fileName(piece.score) || "none"} open={open("score")} onOpen={() => toggleSection("score")}>
              <AssetRow kind="pdf" value={piece.score} onPick={() => pick("pdf", "scores", piece.score, url => patch({ score: url }))} onClear={() => { patch({ score: undefined }); commit(); }} />
            </Sec>

            <Sec title="Site" meta="" open={open("site")} onOpen={() => toggleSection("site")}>
              <AssetRow kind="image" label="backdrop" value={catalog.settings.galleryImage} onPick={() => pick("image", "site", catalog.settings.galleryImage, url => patchSettings({ galleryImage: url }))} />
              <Slider label="intro cooldown" value={catalog.settings.introCooldownHours} min={0} max={48} step={0.5} unit="h" onChange={v => patchSettings({ introCooldownHours: v })} onCommit={commit} />
              <label className="field"><span>import tracks.json</span><input className="mono" value={importPath} onChange={e => setImportPath(e.target.value)} spellCheck={false} /></label>
              <div className="chips">
                <label className="check"><input type="checkbox" checked={copyAudio} onChange={e => setCopyAudio(e.target.checked)} /> copy recordings</label>
                <span className="grow" />
                <button onClick={() => void importOld()}>Import</button>
              </div>
              <div className="chips">
                <span className="lbl">files</span>
                <span className="grow" />
                <button onClick={() => void organize(false)} title="Show what would move, without moving anything">preview</button>
                <button onClick={() => void organize(true)} disabled={dirty} title={dirty ? "Save first" : "Move every file under public/media, named after its piece"}>organize</button>
              </div>
              {report && <pre className="report">{report}</pre>}
            </Sec>
          </div>
        )}
      </aside>
    </div>
  );
}

// ==== RAIL ==== every piece, always; type to jump, drag to reorder
function Rail({ catalog, index, jumpRef, onGo, onMove, onAdd }: { catalog: Catalog; index: number; jumpRef: RefObject<HTMLInputElement | null>; onGo: (i: number) => void; onMove: (from: number, to: number) => void; onAdd: () => void }) {
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const needle = q.trim().toLowerCase();
  const matches = catalog.compositions.map((_, i) => i).filter(i => !needle || String(i + 1) === needle || catalog.compositions[i].title.toLowerCase().includes(needle));
  useEffect(() => { list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" }); }, [index]);
  const jumpTo = () => { if (matches.length) { onGo(matches[0]); setQ(""); jumpRef.current?.blur(); } };
  return (
    <nav className="rail">
      <input ref={jumpRef} className="jump" value={q} placeholder={`Jump · ${catalog.compositions.length} pieces`} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") jumpTo(); if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }} />
      <ol ref={list}>
        {matches.map(i => {
          const p = catalog.compositions[i];
          return <li key={p.id + i} className={`${i === index ? "active" : ""} ${p.hidden ? "hidden" : ""} ${over === i && drag !== null && drag !== i ? (drag < i ? "after" : "before") : ""}`} draggable={!needle}
            onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
            onDragOver={e => { if (drag !== null) { e.preventDefault(); setOver(i); } }}
            onDrop={e => { e.preventDefault(); if (drag !== null) onMove(drag, i); setDrag(null); setOver(null); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}>
            <button onClick={() => onGo(i)}>
              <GripVertical size={12} className="grip" />
              <span className="n">{i + 1}</span>
              <span className="thumb" style={{ backgroundImage: `url("${p.cover.src}")`, backgroundSize: p.cover.size ?? "cover", backgroundPosition: p.cover.position ?? "center" }} />
              <span className="t">{p.title || "Untitled"}</span>
              {p.hidden && <EyeOff size={10} className="eye" />}
              {catalog.settings.homeId === p.id && <Star size={10} className="home" />}
            </button>
          </li>;
        })}
      </ol>
      <button className="add" onClick={onAdd}><Plus size={13} /> Add a piece</button>
    </nav>
  );
}

// ==== CONTROLS ====
const hex = (value: string | undefined, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value ?? "") ? (value as string) : fallback);
const alpha = (a: number) => Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0");

function Sec({ title, meta, open, onOpen, children }: { title: string; meta: string; open: boolean; onOpen: () => void; children: ReactNode }) {
  return (
    <section className={`sec ${open ? "open" : ""}`}>
      <button className="head" onClick={onOpen}><ChevronRight size={12} /><span>{title}</span><span className="meta" title={meta}>{meta}</span></button>
      {open && <div className="content">{children}</div>}
    </section>
  );
}

function Adjust({ open, onToggle, active, children }: { open: boolean; onToggle: () => void; active: boolean; children: ReactNode }) {
  return (
    <div className={`adjust ${open ? "open" : ""}`}>
      <button className="ghost" onClick={onToggle}><ChevronRight size={11} /> adjust{active && !open ? <i className="dot" /> : null}</button>
      {open && children}
    </div>
  );
}

function Err({ text }: { text?: string }) {
  return text ? <small className="err">{text}</small> : null;
}

function Slider({ label, value, min, max, step, unit, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; onCommit: () => void }) {
  return <label className="slider"><span>{label}<b>{+value.toFixed(2)}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} onPointerUp={onCommit} onKeyUp={onCommit} /></label>;
}

function AssetRow({ kind, label, value, cover, onPick, onClear }: { kind: AssetKind; label?: string; value?: string; cover?: boolean; onPick: () => void; onClear?: () => void }) {
  return (
    <div className="asset">
      <button className={`thumb ${cover ? "cover" : ""} ${value ? "" : "empty"}`} onClick={onPick} style={kind === "image" && value ? { backgroundImage: `url("${value}")` } : undefined} aria-label="Choose">
        {value && kind === "video" && <Film size={13} />}{value && kind === "audio" && <Music size={13} />}{value && kind === "pdf" && <FileText size={13} />}
      </button>
      <button className="name" onClick={onPick} title={value}>{label && <span className="lbl">{label}</span>}{value ? fileName(value) : "choose…"}</button>
      {onClear && value && <button className="icon" aria-label="Clear" onClick={onClear}><X size={12} /></button>}
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
      {filter && filter !== "none" && <button className="ghost" onClick={() => { onChange(undefined); onCommit(); }}>reset</button>}
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
        <span className="lbl">tint</span>
        {tintKinds.map(k => <button key={k} className={!custom && tint.kind === k ? "on" : ""} onClick={() => { setCustom(false); onChange(composeTint({ ...tint, kind: k })); onCommit(); }}>{k}</button>)}
        <button className={custom ? "on" : ""} onClick={() => setCustom(true)}>css</button>
      </div>
      {custom ? (
        <textarea rows={2} value={overlay ?? ""} onChange={e => onChange(e.target.value || undefined)} onBlur={onCommit} placeholder="gradient(s)" spellCheck={false} />
      ) : tint.kind !== "none" && (
        <div className="row">
          <label className="swatch"><input type="color" value={tint.color} onChange={e => { onChange(composeTint({ ...tint, color: e.target.value })); later(); }} aria-label="Tint color" /></label>
          <Slider label="strength" value={+tint.strength.toFixed(2)} min={0} max={1} step={0.02} onChange={v => onChange(composeTint({ ...tint, strength: v }))} onCommit={onCommit} />
        </div>
      )}
    </div>
  );
}
