"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type InputHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Upload, X } from "lucide-react";
import type { Catalog, Composition, Cover, Intro, Room } from "@/lib/compositions";
import { folderFor, type Asset, type AssetKind } from "@/lib/assets";
import { AssetPicker, AssetThumb, blank, clamp, clean, coverAspect, coverStyle, fmt, pct, validate } from "./shared";
import "./editor.css";

// ==== EDITOR ====
const importDefault = "/Users/alex/Documents/Cufolio/alexgoodhart/public/player/tracks.json";

type Selection = "settings" | number;
type PickFile = (kind: AssetKind, set: (url: string) => void) => void;


export function Editor() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [selected, setSelected] = useState<Selection>("settings");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [picker, setPicker] = useState<{ kind: AssetKind; pick: (url: string) => void } | null>(null);
  const [toast, setToast] = useState("");
  const [showImport, setShowImport] = useState(false);
  const dirty = !!catalog && JSON.stringify(catalog) !== savedJson;
  const errors = useMemo(() => validate(catalog), [catalog]);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); };
  const loadAssets = useCallback(async () => { const res = await fetch("/api/assets"); setAssets((await res.json()).assets); }, []);

  useEffect(() => {
    fetch("/api/catalog").then(r => r.json()).then((data: Catalog) => {
      setCatalog(data);
      setSavedJson(JSON.stringify(data));
      const home = data.compositions.findIndex(p => p.id === data.settings.homeId);
      setSelected(home >= 0 ? home : "settings");
    });
    void loadAssets();
  }, [loadAssets]);

  const save = useCallback(async () => {
    if (!catalog || errors.length) return;
    const res = await fetch("/api/catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(catalog) });
    if (res.ok) { setSavedJson(JSON.stringify(catalog)); setToast("Saved. The gallery reloads itself."); }
    else setToast((await res.json()).error ?? "Save failed");
    window.setTimeout(() => setToast(""), 3200);
  }, [catalog, errors]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); void save(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [save, dirty]);

  const update = (fn: (c: Catalog) => Catalog) => setCatalog(c => (c ? fn(c) : c));
  const patchAt = (index: number, patch: Partial<Composition>) => update(c => ({ ...c, compositions: c.compositions.map((p, i) => (i === index ? clean({ ...p, ...patch }) : p)) }));
  const rename = (index: number, id: string) => update(c => ({ settings: { ...c.settings, homeId: c.settings.homeId === c.compositions[index].id ? id : c.settings.homeId }, compositions: c.compositions.map((p, i) => (i === index ? { ...p, id } : p)) }));
  const uniqueId = (base: string) => { const taken = new Set(catalog?.compositions.map(p => p.id)); let id = base; for (let n = 2; taken.has(id); n++) id = `${base}-${n}`; return id; };
  const addPiece = () => { if (!catalog) return; update(c => ({ ...c, compositions: [...c.compositions, blank(uniqueId("new-piece"))] })); setSelected(catalog.compositions.length); };
  const duplicate = (index: number) => {
    if (!catalog) return;
    const source = catalog.compositions[index];
    const copy = { ...structuredClone(source), id: uniqueId(`${source.id}-copy`), title: `${source.title} copy` };
    update(c => ({ ...c, compositions: c.compositions.flatMap((p, i) => (i === index ? [p, copy] : [p])) }));
    setSelected(index + 1);
  };
  const remove = (index: number) => {
    if (!catalog || !window.confirm(`Delete “${catalog.compositions[index].title}”? Its files stay in public/.`)) return;
    const rest = catalog.compositions.filter((_, i) => i !== index);
    update(c => ({ settings: { ...c.settings, homeId: rest.some(p => p.id === c.settings.homeId) ? c.settings.homeId : rest[0]?.id ?? "" }, compositions: rest }));
    setSelected(rest.length ? Math.min(index, rest.length - 1) : "settings");
  };
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (!catalog || j < 0 || j >= catalog.compositions.length) return;
    update(c => { const list = [...c.compositions]; [list[index], list[j]] = [list[j], list[index]]; return { ...c, compositions: list }; });
    setSelected(j);
  };
  const pick: PickFile = (kind, set) => setPicker({ kind, pick: url => { set(url); setPicker(null); } });

  const upload = async (files: FileList | File[], kind: AssetKind) => {
    const form = new FormData();
    form.append("folder", folderFor(kind));
    for (const file of Array.from(files)) form.append("files", file);
    const res = await fetch("/api/assets", { method: "POST", body: form });
    const { saved = [] } = (await res.json()) as { saved?: string[] };
    await loadAssets();
    return saved;
  };

  const runImport = async (file: string, copyAudio: boolean) => {
    const res = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file, copyAudio }) });
    const data = (await res.json()) as { compositions?: Composition[]; error?: string };
    if (!res.ok || !data.compositions || !catalog) return notify(data.error ?? "Import failed");
    const have = new Set(catalog.compositions.map(p => p.id));
    const fresh = data.compositions.filter(p => !have.has(p.id));
    const skipped = data.compositions.length - fresh.length;
    update(c => ({ ...c, compositions: [...c.compositions, ...fresh] }));
    void loadAssets();
    setShowImport(false);
    if (fresh.length) setSelected(catalog.compositions.length);
    notify(`Added ${fresh.length} composition${fresh.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} already here` : ""}. Save to keep them.`);
  };

  if (!catalog) return <main className="editor loading">Loading catalog…</main>;
  const index = typeof selected === "number" ? selected : -1;
  const piece = catalog.compositions[index];

  return (
    <main className="editor">
      <aside className="rail">
        <header className="rail-head">
          <div><span className="eyebrow">Alexander Goodhart</span><h1>Catalog</h1></div>
          <button className={`save ${dirty ? "dirty" : ""}`} onClick={() => void save()} disabled={!dirty || errors.length > 0} title="⌘S">{dirty ? "Save" : "Saved"}</button>
        </header>
        {errors.length > 0 && <ul className="errors">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
        <button className={`rail-item ${selected === "settings" ? "active" : ""}`} onClick={() => setSelected("settings")}>
          <span className="thumb" style={{ backgroundImage: `url("${catalog.settings.galleryImage}")` }} />
          <span><strong>Site settings</strong><small>home piece, backdrop, cooldown</small></span>
        </button>
        <div className="rail-label"><span>Compositions</span><span>{catalog.compositions.length}</span></div>
        <ol className="pieces">
          {catalog.compositions.map((p, i) => (
            <li key={i} className={i === index ? "active" : ""}>
              <button className="rail-item" onClick={() => setSelected(i)}>
                <span className="thumb cover" style={coverStyle(p.cover)} />
                <span><strong>{p.title || "Untitled"}</strong><small>{[p.year, p.ensemble].filter(Boolean).join(" · ") || p.id}</small></span>
              </button>
              <span className="row-tools">
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                <button aria-label="Move down" disabled={i === catalog.compositions.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
              </span>
            </li>
          ))}
        </ol>
        <div className="rail-actions">
          <button onClick={addPiece}><Plus size={14} /> Add</button>
          <button onClick={() => setShowImport(s => !s)}><Upload size={14} /> Import…</button>
        </div>
        {showImport && <ImportForm onImport={runImport} onClose={() => setShowImport(false)} />}
      </aside>

      <section className="form">
        {piece ? (
          <PieceForm key={index} piece={piece} patch={patch => patchAt(index, patch)} rename={id => rename(index, id)} pick={pick} onDuplicate={() => duplicate(index)} onDelete={() => remove(index)} />
        ) : (
          <SettingsForm catalog={catalog} update={update} pick={pick} />
        )}
      </section>

      <aside className="preview">
        <span className="eyebrow">Preview</span>
        {piece ? <PiecePreview piece={piece} /> : <div className="preview-room"><div className="layers" style={{ backgroundImage: `url("${catalog.settings.galleryImage}")` }} /><div className="heading"><small>Gallery backdrop</small></div></div>}
        <p className="hint">Save, then look at the gallery tab. It reloads on its own.</p>
      </aside>

      {picker && <AssetPicker kind={picker.kind} assets={assets} onPick={picker.pick} onClose={() => setPicker(null)} onUpload={upload} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

// ==== FORMS ====
function SettingsForm({ catalog, update, pick }: { catalog: Catalog; update: (fn: (c: Catalog) => Catalog) => void; pick: PickFile }) {
  const settings = (patch: Partial<Catalog["settings"]>) => update(c => ({ ...c, settings: { ...c.settings, ...patch } }));
  return (
    <>
      <header className="form-head"><div><span className="eyebrow">Site</span><h1>Settings</h1></div></header>
      <section className="card">
        <div className="grid">
          <Field label="Home piece" hint="Selected on load and when clicking the wordmark.">
            <select value={catalog.settings.homeId} onChange={e => settings({ homeId: e.target.value })}>{catalog.compositions.map(p => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}</select>
          </Field>
          <Field label="Intro cooldown (hours)" hint="0 plays a video on every entry. 24 plays once a day per piece and browser.">
            <Num value={catalog.settings.introCooldownHours} onChange={v => settings({ introCooldownHours: v ?? 0 })} min={0} step={0.5} />
          </Field>
          <Field label="Gallery backdrop" hint="Image behind the scrolling covers." wide>
            <AssetField value={catalog.settings.galleryImage} kind="image" onChange={v => settings({ galleryImage: v ?? "" })} pick={pick} />
          </Field>
        </div>
      </section>
    </>
  );
}

function PieceForm({ piece, patch, rename, pick, onDuplicate, onDelete }: { piece: Composition; patch: (p: Partial<Composition>) => void; rename: (id: string) => void; pick: PickFile; onDuplicate: () => void; onDelete: () => void }) {
  const cover = (p: Partial<Cover>) => patch({ cover: clean({ ...piece.cover, ...p }) });
  const room = (p: Partial<Room>) => patch({ room: clean({ ...piece.room, ...p }) });
  const intro = (p: Partial<Intro>) => patch({ intro: clean({ ...(piece.intro ?? { src: "", play: 4 }), ...p }) as Intro });
  const cropping = !!piece.cover.size;
  const startCrop = () => { // frame a quarter of the sheet, in the cover's aspect
    const img = new Image();
    img.onload = () => cover({ size: `400% ${fmt(400 / (img.naturalWidth / img.naturalHeight / coverAspect))}%`, position: "50% 50%" });
    img.src = piece.cover.src;
  };
  return (
    <>
      <header className="form-head">
        <div><span className="eyebrow">Composition</span><h1>{piece.title || "Untitled"}</h1></div>
        <div className="head-tools"><button onClick={onDuplicate}><Copy size={14} /> Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={14} /> Delete</button></div>
      </header>

      <section className="card">
        <h2>Text</h2>
        <div className="grid">
          <Field label="Title"><Text value={piece.title} onChange={v => patch({ title: v })} /></Field>
          <Field label="Id" hint="Letters, numbers, dashes. Used by the home setting and the browser's memory."><Text value={piece.id} onChange={rename} spellCheck={false} /></Field>
          <Field label="Display lines" hint="One row per line, as the title breaks on the page." wide><Area rows={2} value={piece.lines.join("\n")} onChange={v => patch({ lines: v.split("\n") })} /></Field>
          <Field label="Year"><Text value={piece.year} onChange={v => patch({ year: v })} /></Field>
          <Field label="Place"><Text value={piece.place} onChange={v => patch({ place: v })} /></Field>
          <Field label="Ensemble"><Text value={piece.ensemble} onChange={v => patch({ ensemble: v })} /></Field>
          <Field label="Duration"><Text value={piece.duration} onChange={v => patch({ duration: v })} placeholder="24 minutes" /></Field>
          <Field label="World" hint="Small eyebrow text inside the composition." wide><Text value={piece.world} onChange={v => patch({ world: v })} /></Field>
          <Field label="Note" hint="The paragraph inside the composition." wide><Area rows={3} value={piece.note} onChange={v => patch({ note: v })} /></Field>
        </div>
      </section>

      <section className="card">
        <h2>Cover</h2>
        <Field label="Image" hint="The score artwork in the gallery."><AssetField value={piece.cover.src} kind="image" onChange={v => cover({ src: v ?? "" })} pick={pick} /></Field>
        <div className="segmented">
          <button className={cropping ? "" : "on"} onClick={() => cover({ size: undefined, position: undefined })}>Whole image</button>
          <button className={cropping ? "on" : ""} onClick={startCrop}>Crop from a sheet</button>
        </div>
        {cropping && <CropTool key={piece.cover.src} cover={piece.cover} onChange={cover} />}
        <Field label="Filter" hint="CSS filter, e.g. grayscale(1) or sepia(.4)."><Text value={piece.cover.filter} onChange={v => cover({ filter: v })} placeholder="none" /></Field>
      </section>

      <section className="card">
        <h2>Room</h2>
        <Field label="Background image" hint="Leave empty for a gradient-only room."><AssetField value={piece.room.src} kind="image" onChange={v => room({ src: v })} pick={pick} allowEmpty /></Field>
        <Field label="Overlay" hint="Gradient layers over the image, several separated by commas."><Area rows={2} value={piece.room.overlay} onChange={v => room({ overlay: v })} placeholder="linear-gradient(90deg,#0b080787,#0b080715)" /></Field>
        <div className="grid">
          <Field label="Color" hint="Flat color behind everything."><ColorText value={piece.room.color} onChange={v => room({ color: v })} fallback="#080d15" /></Field>
          <Field label="Filter" hint="e.g. grayscale(1) or brightness(.8)."><Text value={piece.room.filter} onChange={v => room({ filter: v })} placeholder="none" /></Field>
          <Field label="Image position" hint="Where the image is anchored, e.g. 50% 100%."><Text value={piece.room.position} onChange={v => room({ position: v })} placeholder="center" /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={!!piece.room.stars} onChange={e => room({ stars: e.target.checked })} /> Twinkling stars</label>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Intro video</h2>
          <label className="check"><input type="checkbox" checked={!!piece.intro} onChange={e => patch({ intro: e.target.checked ? { src: "", play: 4 } : undefined })} /> Play a video on entry</label>
        </header>
        {piece.intro && (
          <>
            <Field label="Video" hint="H.264 MP4 or M4V. Plays silently behind the text."><AssetField value={piece.intro.src} kind="video" onChange={v => intro({ src: v ?? "" })} pick={pick} /></Field>
            <div className="grid four">
              <Field label="Start (s)" hint="Seconds into the file."><Num value={piece.intro.start} onChange={v => intro({ start: v })} placeholder="0" min={0} step={0.1} /></Field>
              <Field label="Play (s)" hint="Seconds on screen."><Num value={piece.intro.play} onChange={v => intro({ play: v as number })} min={0} step={0.1} /></Field>
              <Field label="Speed" hint="0.5 half, 2 double."><Num value={piece.intro.speed} onChange={v => intro({ speed: v })} placeholder="1" min={0.1} step={0.1} /></Field>
              <Field label="Delay (s)" hint="Wait before it appears."><Num value={piece.intro.delay} onChange={v => intro({ delay: v })} placeholder="0" min={0} step={0.1} /></Field>
            </div>
            <div className="grid">
              <Field label="Fit"><select value={piece.intro.fit ?? "cover"} onChange={e => intro({ fit: e.target.value as Intro["fit"] })}><option value="cover">cover · fill the screen</option><option value="contain">contain · whole frame</option></select></Field>
              <Field label="Position" hint="Crop focus when fit is cover, e.g. 50% 100%."><Text value={piece.intro.position} onChange={v => intro({ position: v })} placeholder="center" /></Field>
              <Field label="Filter"><Text value={piece.intro.filter} onChange={v => intro({ filter: v })} placeholder="none" /></Field>
              <Field label="Overlay" hint="A color or gradient tint over the video."><Text value={piece.intro.overlay} onChange={v => intro({ overlay: v })} placeholder="none" /></Field>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Sound</h2>
        <Field label="Recording" hint="Leave empty to use the synth preview."><AssetField value={piece.audio} kind="audio" onChange={v => patch({ audio: v })} pick={pick} allowEmpty /></Field>
        <Field label="Preview tones (Hz)" hint="Comma-separated pitches, used only without a recording."><Tones value={piece.tones} onChange={v => patch({ tones: v })} /></Field>
      </section>
    </>
  );
}

function ImportForm({ onImport, onClose }: { onImport: (file: string, copyAudio: boolean) => Promise<void>; onClose: () => void }) {
  const [file, setFile] = useState(importDefault);
  const [copyAudio, setCopyAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form className="import" onSubmit={async e => { e.preventDefault(); setBusy(true); await onImport(file, copyAudio); setBusy(false); }}>
      <span className="field-label">Older tracks.json</span>
      <input value={file} onChange={e => setFile(e.target.value)} spellCheck={false} />
      <label className="check"><input type="checkbox" checked={copyAudio} onChange={e => setCopyAudio(e.target.checked)} /> Also copy recordings into public/audio (hundreds of MB)</label>
      <small>One composition per family. Covers are copied into public/content/covers/covers. Nothing is written until you save.</small>
      <div className="row"><button type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</button><button type="button" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

// ==== PREVIEW ====
function PiecePreview({ piece }: { piece: Composition }) {
  const { room, intro } = piece;
  return (
    <>
      <div className="preview-cover" style={coverStyle(piece.cover)} />
      <div className="preview-room" style={{ backgroundColor: room.color ?? "#080d15" }}>
        <div className="layers" style={{ backgroundImage: [room.overlay, room.src && `url("${room.src}")`].filter(Boolean).join(",") || undefined, backgroundPosition: room.position, filter: room.filter }} />
        {room.stars && <div className="stars" />}
        <div className="heading"><small>{piece.world || "World"}</small>{piece.lines.map((line, i) => <span key={i}>{line}</span>)}</div>
      </div>
      {intro?.src && (
        <div className="preview-intro">
          <video key={intro.src} src={intro.src} muted loop autoPlay playsInline ref={v => { if (v) v.playbackRate = intro.speed ?? 1; }} style={{ objectFit: intro.fit ?? "cover", objectPosition: intro.position, filter: intro.filter }} />
          <div className="tint" style={{ background: intro.overlay }} />
        </div>
      )}
    </>
  );
}

// ==== CROP ====
function CropTool({ cover, onChange }: { cover: Cover; onChange: (patch: Partial<Cover>) => void }) {
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const ratio = img ? img.w / img.h / coverAspect : 1; // frame height = width × ratio, in sheet fractions
  const [W, H] = pct(cover.size);
  const [X, Y] = pct(cover.position);
  const rw = W > 0 ? Math.min(1, 100 / W) : 0.25;
  const rh = H > 0 ? Math.min(1, 100 / H) : rw * ratio;
  const left = (1 - rw) * (X >= 0 ? X : 50) / 100;
  const top = (1 - rh) * (Y >= 0 ? Y : 50) / 100;

  const commit = (l: number, t: number, w: number) => {
    const nw = clamp(w, 0.02, 1), nh = Math.min(1, nw * ratio);
    const nl = clamp(l, 0, 1 - nw), nt = clamp(t, 0, 1 - nh);
    onChange({ size: `${fmt(100 / nw)}% ${fmt(100 / nh)}%`, position: `${fmt(nw < 1 ? (nl / (1 - nw)) * 100 : 50)}% ${fmt(nh < 1 ? (nt / (1 - nh)) * 100 : 50)}%` });
  };

  useEffect(() => { const el = new Image(); el.onload = () => setImg({ w: el.naturalWidth, h: el.naturalHeight }); el.src = cover.src; }, [cover.src]);
  useEffect(() => { // React registers wheel passively, so zoom needs a native listener
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const f = e.deltaY > 0 ? 1.04 : 0.96; commit(left + (rw * (1 - f)) / 2, top + (rh * (1 - f)) / 2, rw * f); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const drag = (e: ReactPointerEvent, mode: "move" | "resize") => {
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    const start = { x: e.clientX, y: e.clientY, left, top, rw };
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width, dy = (ev.clientY - start.y) / box.height;
      if (mode === "move") commit(start.left + dx, start.top + dy, start.rw);
      else commit(start.left, start.top, start.rw + dx);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    e.preventDefault();
  };

  if (!img) return <p className="hint">Loading sheet…</p>;
  return (
    <div className="crop">
      <div ref={area} className="crop-sheet" style={{ aspectRatio: `${img.w} / ${img.h}`, backgroundImage: `url("${cover.src}")` }}>
        <div className="crop-rect" style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${rw * 100}%`, height: `${rh * 100}%` }} onPointerDown={e => drag(e, "move")}>
          <span className="crop-handle" onPointerDown={e => { e.stopPropagation(); drag(e, "resize"); }} />
        </div>
      </div>
      <label className="crop-zoom"><span>Frame</span><input type="range" min={2} max={100} step={0.5} value={rw * 100} onChange={e => { const w = +e.target.value / 100; commit(left + (rw - w) / 2, top + (rh - w * ratio) / 2, w); }} /></label>
      <small className="hint">Drag the frame to move it. Drag its corner or scroll to resize. Size {cover.size} · Position {cover.position}</small>
    </div>
  );
}

// ==== ASSETS ====
function AssetField({ value, kind, onChange, pick, allowEmpty }: { value?: string; kind: AssetKind; onChange: (v: string | undefined) => void; pick: PickFile; allowEmpty?: boolean }) {
  return (
    <div className="asset-field">
      <AssetThumb url={value} kind={kind} />
      <input value={value ?? ""} placeholder={`/${folderFor(kind)}/…`} spellCheck={false} onChange={e => onChange(e.target.value || undefined)} />
      <button type="button" onClick={() => pick(kind, onChange)}>Choose</button>
      {allowEmpty && value && <button type="button" className="icon" aria-label="Clear" onClick={() => onChange(undefined)}><X size={14} /></button>}
    </div>
  );
}

// ==== FIELDS ====
function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return <div className={`field ${wide ? "wide" : ""}`}><span className="field-label">{label}</span>{children}{hint && <small>{hint}</small>}</div>;
}
type TextProps = { value?: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;
function Text({ value, onChange, ...rest }: TextProps) { return <input {...rest} value={value ?? ""} onChange={e => onChange(e.target.value)} />; }
type AreaProps = { value?: string; onChange: (v: string) => void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">;
function Area({ value, onChange, ...rest }: AreaProps) { return <textarea {...rest} value={value ?? ""} onChange={e => onChange(e.target.value)} />; }
type NumProps = { value?: number; onChange: (v: number | undefined) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;
function Num({ value, onChange, ...rest }: NumProps) { return <input type="number" {...rest} value={value ?? ""} onChange={e => onChange(e.target.value === "" ? undefined : +e.target.value)} />; }
function ColorText({ value, onChange, fallback }: { value?: string; onChange: (v: string) => void; fallback: string }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : fallback;
  return <span className="color-field"><input type="color" value={hex} onChange={e => onChange(e.target.value)} /><input value={value ?? ""} placeholder={fallback} spellCheck={false} onChange={e => onChange(e.target.value)} /></span>;
}
function Tones({ value, onChange }: { value?: number[]; onChange: (v: number[] | undefined) => void }) {
  const [text, setText] = useState(value?.join(", ") ?? ""); // keep what is typed while commas are in flight
  return <input value={text} spellCheck={false} placeholder="146.83, 174.61, 220" onChange={e => { setText(e.target.value); const list = e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 0); onChange(list.length ? list : undefined); }} />;
}
