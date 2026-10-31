// One-time pull from the older player catalog (tracks.json): one composition per "family".
import { access, copyFile, mkdir, readFile } from "fs/promises";
import path from "path";
import type { Composition } from "@/lib/compositions";

type Track = { family?: string; title: string; ensemble?: string; duration?: string; year?: number; mp3?: string; cover?: number | string; familyCover?: boolean };

const dev = process.env.NODE_ENV === "development";
const publicDir = path.join(process.cwd(), "public");
const toneSets = [[130.81, 196, 261.63, 293.66, 392, 523.25], [146.83, 174.61, 220, 293.66, 349.23, 440], [174.61, 220, 261.63, 349.23, 440, 523.25]];
const placeholderRoom = { color: "#0b0f17", overlay: "radial-gradient(ellipse at 50% 40%,#2a3447a0,transparent 60%)", stars: true };

const exists = (p: string) => access(p).then(() => true, () => false);
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const splitLines = (title: string) => { const words = title.split(/\s+/); if (words.length < 3) return [title]; const cut = Math.ceil(words.length / 2); return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]; };
const seconds = (d = "") => { const m = d.match(/(\d+)'(\d+)?/); return m ? +m[1] * 60 + +(m[2] ?? 0) : 0; };
const usable = (c: Track["cover"]) => c !== undefined && c !== "" && Number(c) !== 999;

export async function POST(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const { file, copyAudio } = (await request.json()) as { file: string; copyAudio?: boolean };
  let tracks: Track[];
  try { tracks = JSON.parse(await readFile(file, "utf8")); } catch { return Response.json({ error: `Could not read ${file}` }, { status: 400 }); }
  if (!Array.isArray(tracks)) return Response.json({ error: "That file is not a list of tracks" }, { status: 400 });
  const base = path.dirname(file); // covers/ sits beside tracks.json; mp3 paths are relative to its parent (public/)
  const families = new Map<string, Track[]>();
  for (const track of tracks) { const key = (track.family || track.title || "").trim(); if (key) families.set(key, [...(families.get(key) ?? []), track]); }
  await mkdir(path.join(publicDir, "content/covers/covers"), { recursive: true });
  if (copyAudio) await mkdir(path.join(publicDir, "audio"), { recursive: true });

  const compositions: Composition[] = [];
  let i = 0;
  for (const [family, list] of families) {
    const lead = list.find(t => t.familyCover && usable(t.cover)) ?? list.find(t => usable(t.cover)) ?? list[0];
    const coverId = usable(lead.cover) ? String(lead.cover) : "999";
    const coverFile = path.join(base, "covers", `${coverId}.webp`);
    let cover = "/placeholder.svg";
    if (await exists(coverFile)) { await copyFile(coverFile, path.join(publicDir, "content/covers/covers", `${coverId}.webp`)); cover = `/content/covers/covers/${coverId}.webp`; }
    const years = [...new Set(list.map(t => t.year).filter(Boolean))].sort();
    const durations = list.map(t => seconds(t.duration));
    const oneRecording = new Set(list.map(t => t.mp3)).size === 1; // movements sharing one file list the whole piece's length
    const total = oneRecording ? Math.max(...durations) : durations.reduce((a, b) => a + b, 0);
    const piece: Composition = {
      id: slug(family), title: family, lines: splitLines(family),
      year: years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] ?? ""),
      place: "", ensemble: lead.ensemble ?? "", duration: total ? `${Math.round(total / 60)} minutes` : "",
      world: "", note: "",
      tones: toneSets[i++ % toneSets.length],
      cover: { src: cover },
      room: { ...placeholderRoom },
    };
    const mp3 = lead.mp3 ?? list[0].mp3;
    if (copyAudio && mp3) {
      const src = path.join(base, "..", mp3);
      if (await exists(src)) { const name = path.basename(mp3); await copyFile(src, path.join(publicDir, "audio", name)); piece.audio = `/audio/${name}`; }
    }
    compositions.push(piece);
  }
  return Response.json({ compositions });
}
