"use client";
// Helpers for the live editor.
import { useCallback, useEffect, useState } from "react";
import type { Catalog, Composition } from "@/lib/compositions";
import type { Asset, AssetKind } from "@/lib/assets";

// ==== SHARED ====
export const coverAspect = 512 / 662; // must match .score-artwork in globals.css
export const idPattern = /^[a-z0-9-]+$/i;
export const accept: Record<AssetKind, string> = { image: "image/*", video: "video/*,.m4v", audio: "audio/*", pdf: "application/pdf,.pdf", html: ".html" };

export const clean = <T extends object>(obj: T): T => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && v !== false && !(typeof v === "number" && Number.isNaN(v)))) as T;
export const pct = (s = "") => s.trim().split(/\s+/).map(parseFloat);
export const fmt = (n: number) => String(+n.toFixed(3));
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const fileSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
export const fileName = (url = "") => decodeURIComponent(url.split("/").pop() ?? "");
export const blank = (id: string): Composition => ({ id, title: "New composition", lines: ["New", "composition"], year: "", place: "", ensemble: "", duration: "", cover: { src: "/placeholder.svg" }, room: { color: "#080d15" } });

// ==== VALIDATION ==== one problem per field, so the inspector can point at it
export type Problem = { index: number; field: "id" | "title" | "cover" | "video" | "home"; message: string };
export function validate(c: Catalog | null): Problem[] {
  if (!c) return [];
  const out: Problem[] = [];
  const seen = new Set<string>();
  c.compositions.forEach((p, index) => {
    if (!p.id) out.push({ index, field: "id", message: "Needs an id" });
    else if (!idPattern.test(p.id)) out.push({ index, field: "id", message: "Letters, numbers and dashes only" });
    else if (seen.has(p.id)) out.push({ index, field: "id", message: "Another piece uses this id" });
    seen.add(p.id);
    if (!p.lines.some(Boolean)) out.push({ index, field: "title", message: "Needs a title" });
    if (!p.cover?.src) out.push({ index, field: "cover", message: "Needs an image" });
    if (p.intro && !p.intro.src) out.push({ index, field: "video", message: "Needs a file, or turn the video off" });
    if (p.intro && !(p.intro.play > 0)) out.push({ index, field: "video", message: "The clip has no length" });
  });
  const home = c.compositions.find(p => p.id === c.settings.homeId);
  if (!home) out.push({ index: 0, field: "home", message: "No piece is marked Home" });
  else if (home.hidden) out.push({ index: c.compositions.indexOf(home), field: "home", message: "The Home piece is hidden on the site" });
  if (c.compositions.length && c.compositions.every(p => p.hidden)) out.push({ index: 0, field: "home", message: "Every piece is hidden" });
  return out;
}

// Which pieces reference each file, for the picker.
export function usedBy(c: Catalog | null) {
  const map = new Map<string, string[]>();
  const add = (url: string | undefined, who: string) => { if (url) map.set(url, [...(map.get(url) ?? []), who]); };
  if (!c) return map;
  add(c.settings.galleryImage, "gallery backdrop");
  for (const p of c.compositions) { add(p.cover.src, p.title); add(p.room.src, p.title); add(p.room.video, p.title); add(p.room.html, p.title); add(p.intro?.src, p.title); add(p.audio, p.title); add(p.score, p.title); }
  return map;
}

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const reload = useCallback(async () => { const res = await fetch("/api/assets"); setAssets((await res.json()).assets ?? []); }, []);
  useEffect(() => { void reload(); }, [reload]);
  const upload = useCallback(async (files: FileList | File[], folder: string) => { // folder under public/, from mediaFolder
    const form = new FormData();
    form.append("folder", folder);
    for (const file of Array.from(files)) form.append("files", file);
    const res = await fetch("/api/assets", { method: "POST", body: form });
    const { saved = [] } = (await res.json()) as { saved?: string[] };
    await reload();
    return saved;
  }, [reload]);
  return { assets, reload, upload };
}
