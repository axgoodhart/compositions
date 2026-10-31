"use client";
// Helpers and the asset picker, shared by /edit and /editlive.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Music, Upload, X } from "lucide-react";
import type { Catalog, Composition, Cover } from "@/lib/compositions";
import { folderFor, type Asset, type AssetKind } from "@/lib/assets";

// ==== SHARED ====
export const coverAspect = 512 / 662; // must match .score-artwork in globals.css
export const idPattern = /^[a-z0-9-]+$/i;
export const accept: Record<AssetKind, string> = { image: "image/*", video: "video/*,.m4v", audio: "audio/*" };

export const clean = <T extends object>(obj: T): T => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && v !== false && !(typeof v === "number" && Number.isNaN(v)))) as T;
export const pct = (s = "") => s.trim().split(/\s+/).map(parseFloat);
export const fmt = (n: number) => String(+n.toFixed(3));
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const fileSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
export const coverStyle = (c: Cover): CSSProperties => ({ backgroundImage: c.src ? `url("${c.src}")` : undefined, backgroundSize: c.size ?? "cover", backgroundPosition: c.position ?? "center", filter: c.filter });
export const blank = (id: string): Composition => ({ id, title: "New composition", lines: ["New", "composition"], year: "", place: "", ensemble: "", duration: "", world: "", note: "", cover: { src: "/placeholder.svg" }, room: { color: "#080d15" } });

export function validate(c: Catalog | null) {
  if (!c) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  c.compositions.forEach((p, i) => {
    const name = p.title || `#${i + 1}`;
    if (!p.id) out.push(`${name}: needs an id`);
    else if (!idPattern.test(p.id)) out.push(`${name}: the id may only use letters, numbers and dashes`);
    if (seen.has(p.id)) out.push(`Two compositions use the id “${p.id}”`);
    seen.add(p.id);
    if (!p.title) out.push(`#${i + 1}: needs a title`);
    if (!p.cover?.src) out.push(`${name}: the cover needs an image`);
    if (p.intro && !p.intro.src) out.push(`${name}: the intro video needs a file`);
    if (p.intro && !(p.intro.play > 0)) out.push(`${name}: the intro “play” time must be above 0`);
  });
  if (!c.compositions.some(p => p.id === c.settings.homeId)) out.push("The home piece is not in the list");
  return out;
}

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const reload = useCallback(async () => { const res = await fetch("/api/assets"); setAssets((await res.json()).assets ?? []); }, []);
  useEffect(() => { void reload(); }, [reload]);
  const upload = useCallback(async (files: FileList | File[], kind: AssetKind) => {
    const form = new FormData();
    form.append("folder", folderFor(kind));
    for (const file of Array.from(files)) form.append("files", file);
    const res = await fetch("/api/assets", { method: "POST", body: form });
    const { saved = [] } = (await res.json()) as { saved?: string[] };
    await reload();
    return saved;
  }, [reload]);
  return { assets, reload, upload };
}

// ==== ASSET PICKER ====
export function AssetThumb({ url, kind }: { url?: string; kind: AssetKind }) {
  if (!url) return <span className="thumb empty" />;
  if (kind === "image") return <span className="thumb" style={{ backgroundImage: `url("${url}")` }} />;
  if (kind === "video") return <video className="thumb" src={url} muted preload="metadata" playsInline />;
  return <span className="thumb icon"><Music size={16} /></span>;
}

export function AssetPicker({ kind, assets, onPick, onClose, onUpload }: { kind: AssetKind; assets: Asset[]; onPick: (url: string) => void; onClose: () => void; onUpload: (files: FileList | File[], kind: AssetKind) => Promise<string[]> }) {
  const list = assets.filter(a => a.kind === kind);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const saved = await onUpload(files, kind);
    setBusy(false);
    if (saved.length === 1) onPick(saved[0]);
  };
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Choose a file" onClick={e => e.stopPropagation()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void handle(e.dataTransfer.files); }}>
        <header><h2>{kind === "image" ? "Images" : kind === "video" ? "Videos" : "Recordings"}</h2><button className="icon" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <button className="dropzone" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Uploading…" : <><Upload size={16} /> Drop files here or click to add them to public/{folderFor(kind)}</>}</button>
        <input ref={input} type="file" multiple hidden accept={accept[kind]} onChange={e => void handle(e.target.files)} />
        {list.length ? (
          <ul className={`asset-grid ${kind}`}>{list.map(a => <li key={a.url}><button onClick={() => onPick(a.url)}><AssetThumb url={a.url} kind={kind} /><span>{a.name}</span><small>{fileSize(a.size)}</small></button></li>)}</ul>
        ) : (
          <p className="hint">Nothing here yet. Drop a file above.</p>
        )}
      </div>
    </div>
  );
}
