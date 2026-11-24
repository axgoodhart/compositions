"use client";
// File picker: search, folders, real proportions, who uses what. Lives in the inspector column.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, FileCode, FileText, Music, Plus } from "lucide-react";
import { assetKind, type Asset, type AssetKind } from "@/lib/assets";
import { accept, fileSize } from "./shared";

const recentKey = "editlive-recent";
const recentLimit = 12;
const labels: Record<AssetKind, string> = { image: "images", video: "videos", audio: "recordings", pdf: "scores", html: "HTML files" };
const rowIcons: Partial<Record<AssetKind, typeof FileCode>> = { audio: Music, pdf: FileText, html: FileCode };
const byName = (a: Asset, b: Asset) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const readRecent = (): Record<string, string[]> => { try { return JSON.parse(window.localStorage.getItem(recentKey) ?? "{}"); } catch { return {}; } };
export const remember = (kind: AssetKind, url: string) => { try { const all = readRecent(); all[kind] = [url, ...(all[kind] ?? []).filter(u => u !== url)].slice(0, recentLimit); window.localStorage.setItem(recentKey, JSON.stringify(all)); } catch { /* fine */ } };

type Props = { kind: AssetKind; folder: string; assets: Asset[]; uses: Map<string, string[]>; current?: string; onPick: (url: string) => void; onClose: () => void; onUpload: (files: FileList | File[], folder: string) => Promise<string[]> };

export function AssetPicker({ kind, folder, assets, uses, current, onPick, onClose, onUpload }: Props) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [recent] = useState(() => readRecent()[kind] ?? []);
  const input = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const RowIcon = rowIcons[kind];
  const q = query.trim().toLowerCase();
  const list = useMemo(() => assets.filter(a => a.kind === kind && (!q || a.url.toLowerCase().includes(q))), [assets, kind, q]);
  const groups = useMemo(() => {
    const out: { name: string; items: Asset[] }[] = [];
    const recents = recent.map(u => list.find(a => a.url === u)).filter((a): a is Asset => !!a);
    if (recents.length && !q) out.push({ name: "Recent", items: recents });
    const folders = new Map<string, Asset[]>();
    for (const a of list) { const folder = a.url.slice(0, a.url.lastIndexOf("/")) || "/"; folders.set(folder, [...(folders.get(folder) ?? []), a]); }
    for (const name of [...folders.keys()].sort()) out.push({ name, items: folders.get(name)!.sort(byName) });
    return out;
  }, [list, recent, q]);

  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);

  const handle = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    const matching = Array.from(files).filter(file => assetKind(file.name) === kind);
    if (!matching.length) { setUploadError(`Choose ${labels[kind]}.`); return; }
    setUploadError("");
    setBusy(true);
    try {
      const saved = await onUpload(matching, folder);
      if (saved.length === 1) onPick(saved[0]);
      else if (!saved.length) setUploadError("Upload failed. Try again.");
    } catch {
      setUploadError("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (name: string) => setClosed(s => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  return (
    <div className={`picker ${kind}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void handle(e.dataTransfer.files); }}>
      <header>
        <button className="icon" onClick={onClose} aria-label="Back"><ArrowLeft size={14} /></button>
        <input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${list.length} ${labels[kind]}`} aria-label={`Search ${labels[kind]}`} spellCheck={false}
          onKeyDown={e => { if (e.key === "Enter" && list.length === 1) onPick(list[0].url); }} />
        <button className="icon" onClick={() => input.current?.click()} disabled={busy} aria-label="Add files" title={`Add files to public/${folder}`}><Plus size={14} /></button>
        <input ref={input} type="file" multiple hidden accept={accept[kind]} onChange={e => { void handle(e.currentTarget.files); e.currentTarget.value = ""; }} />
      </header>
      <div className="groups">
        {(busy || uploadError) && <p className="note" role="status">{busy ? "Uploading…" : uploadError}</p>}
        {!busy && !uploadError && !groups.length && <p className="note">{q ? "No match." : "Nothing here yet. Drop a file."}</p>}
        {groups.map(g => (
          <section key={g.name} className={closed.has(g.name) ? "closed" : ""}>
            <button className="folder" onClick={() => toggle(g.name)}><ChevronRight size={12} /><span>{g.name}</span><small>{g.items.length}</small></button>
            {!closed.has(g.name) && (RowIcon ? (
              <ul className="rows">{g.items.map(a => <li key={a.url}><button className={a.url === current ? "on" : ""} onClick={() => onPick(a.url)} title={a.name}><RowIcon size={13} /><span>{a.name}</span><small>{fileSize(a.size)}</small><Uses who={uses.get(a.url)} /></button></li>)}</ul>
            ) : (
              <ul className="tiles">{g.items.map(a => <li key={a.url}><button className={a.url === current ? "on" : ""} onClick={() => onPick(a.url)} title={`${a.name} · ${fileSize(a.size)}`}>
                <span className="tile">{kind === "image" ? <img src={a.url} alt="" loading="lazy" /> : <video src={a.url} muted preload="metadata" playsInline />}<Uses who={uses.get(a.url)} /></span>
                <span className="name">{a.name}</span>
              </button></li>)}</ul>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Uses({ who }: { who?: string[] }) {
  if (!who?.length) return null;
  return <b className="uses" title={who.join(", ")}>{who.length}</b>;
}
