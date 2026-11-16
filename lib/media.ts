// Files every asset under public/media, named after the piece that uses it: covers/raven.webp, rooms/raven.png, intros/raven.m4v, audio/raven.mp3.
// Scores are filed as scores/raven.pdf. Unused media goes to media/library, unused PDFs to media/scores under their own names, byte-identical copies are removed, and lib/catalog.json follows. Dry run unless apply is set.
// Used by `npm run media` (scripts/organize-media.ts) and the editor's Site section (app/api/media/route.ts).
import { createHash } from "crypto";
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { assetKind, mediaFolder, type MediaRole } from "./assets.ts";

// ==== RULES ====
const codeDirs = ["app", "components", "lib"]; // a URL string found here pins its file where it is
const codeFile = /\.(tsx?|css)$/;
const urlLiteral = /["'(](\/(?:media|content|images|audio|videos)\/[^"')\s]+)/g;
const roleOrder: MediaRole[] = ["cover", "room", "intro", "audio", "scores", "site"]; // a file used twice is named by the first
const tmpSuffix = ".moving"; // breaks rename cycles

type Kind = "image" | "video" | "audio" | "pdf" | "other";
type Entry = { rel: string; size: number; kind: Kind; hash?: string; dest: string; refs: Ref[]; pins: string[]; keeper?: Entry };
type Ref = { url: string; role: MediaRole; name: string; who: string; set: (url: string) => void };
type Catalog = { settings: { galleryImage: string }; compositions: { id: string; title: string; cover: { src: string }; room: { src?: string; video?: string }; intro?: { src: string }; audio?: string; score?: string }[] };
export type Result = { report: string; summary: string; changes: number };

const kindOf = (name: string): Kind => (name.toLowerCase().endsWith(".pdf") ? "pdf" : assetKind(name) ?? "other");
const ext = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();
const slug = (name: string) => { const dot = name.lastIndexOf("."); const stem = name.slice(0, dot < 0 ? undefined : dot).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^\w.()-]/g, "") || "file"; return dot < 0 ? stem : stem + ext(name); };
const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`);
const toRel = (url: string) => { try { return decodeURIComponent(url).replace(/^\//, ""); } catch { return url.replace(/^\//, ""); } };
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

async function walk(dir: string, root: string, skipRoot: boolean, out: string[] = [], depth = 0) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, skipRoot, out, depth + 1);
    else if (depth > 0 || !skipRoot) out.push(path.relative(root, full).split(path.sep).join("/")); // files at the root of public/ (icons, placeholders) stay
  }
  return out;
}
const numeric = (rel: string) => /^\d+\.\w+$/.test(path.basename(rel)); // "13.webp" says less than "aviary.webp"
const sha = async (file: string) => createHash("sha1").update(await readFile(file)).digest("hex");

export async function organize(cwd: string, { apply = false } = {}): Promise<Result> {
  const pub = path.join(cwd, "public");
  const catalogFile = path.join(cwd, "lib/catalog.json");
  const catalog = JSON.parse(await readFile(catalogFile, "utf8")) as Catalog;
  const entries = new Map<string, Entry>();
  for (const rel of await walk(pub, pub, true)) entries.set(rel, { rel, size: (await stat(path.join(pub, rel))).size, kind: kindOf(rel), dest: rel, refs: [], pins: [] });

  // what the catalog and the code point at
  const refs: Ref[] = [];
  for (const p of catalog.compositions) {
    refs.push({ url: p.cover.src, role: "cover", name: p.id, who: p.title, set: u => { p.cover.src = u; } });
    if (p.room.src) refs.push({ url: p.room.src, role: "room", name: p.id, who: p.title, set: u => { p.room.src = u; } });
    if (p.room.video) refs.push({ url: p.room.video, role: "room", name: `${p.id}-video`, who: p.title, set: u => { p.room.video = u; } });
    if (p.intro?.src) refs.push({ url: p.intro.src, role: "intro", name: p.id, who: p.title, set: u => { p.intro!.src = u; } });
    if (p.audio) refs.push({ url: p.audio, role: "audio", name: p.id, who: p.title, set: u => { p.audio = u; } });
    if (p.score) refs.push({ url: p.score, role: "scores", name: p.id, who: p.title, set: u => { p.score = u; } });
  }
  refs.push({ url: catalog.settings.galleryImage, role: "site", name: "gallery", who: "gallery backdrop", set: u => { catalog.settings.galleryImage = u; } });
  const missing: Ref[] = [];
  for (const ref of refs) { const e = entries.get(toRel(ref.url)); if (e) e.refs.push(ref); else if (ref.url.startsWith("/") && !ref.url.startsWith("/placeholder")) missing.push(ref); }
  for (const dir of codeDirs) {
    const files = await walk(path.join(cwd, dir), cwd, false).catch(() => [] as string[]);
    for (const file of files.filter(f => codeFile.test(f))) {
      const text = await readFile(path.join(cwd, file), "utf8");
      for (const m of text.matchAll(urlLiteral)) entries.get(toRel(m[1]))?.pins.push(file);
    }
  }

  // identical files: one copy stays, the rest go
  const bySize = new Map<number, Entry[]>();
  for (const e of entries.values()) bySize.set(e.size, [...(bySize.get(e.size) ?? []), e]);
  for (const group of bySize.values()) if (group.length > 1) for (const e of group) e.hash = await sha(path.join(pub, e.rel));
  const byHash = new Map<string, Entry[]>();
  for (const e of entries.values()) if (e.hash) byHash.set(e.hash, [...(byHash.get(e.hash) ?? []), e]);
  const rank = (e: Entry) => (e.pins.length ? 0 : e.refs.length ? 1 + refs.indexOf(e.refs[0]) / refs.length : 2); // pinned, then first referenced, then the better name
  const depth = (rel: string) => rel.split("/").length;
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const [keeper, ...rest] = [...group].sort((a, b) => rank(a) - rank(b) || +numeric(a.rel) - +numeric(b.rel) || depth(a.rel) - depth(b.rel) || byName(a.rel, b.rel));
    for (const e of rest) { e.keeper = keeper; keeper.refs.push(...e.refs); e.refs = []; }
  }

  // where each file belongs
  const taken = new Set<string>();
  const unique = (dest: string) => { let out = dest, n = 2; const dot = dest.lastIndexOf("."); while (taken.has(out)) out = dot < 0 ? `${dest}-${n++}` : `${dest.slice(0, dot)}-${n++}${dest.slice(dot)}`; taken.add(out); return out; };
  const live = [...entries.values()].filter(e => !e.keeper);
  const pinned = live.filter(e => e.pins.length);
  for (const e of pinned) taken.add(e.rel);
  const skipped: Entry[] = [];
  for (const e of live.filter(e => !e.pins.length).sort((a, b) => byName(a.rel, b.rel))) {
    if (e.refs.length) { const ref = e.refs.slice().sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || refs.indexOf(a) - refs.indexOf(b))[0]; e.dest = unique(`${mediaFolder[ref.role]}/${ref.name}${ext(e.rel)}`); }
    else if (e.kind === "pdf") e.dest = unique(`${mediaFolder.scores}/${path.basename(e.rel)}`);
    else if (e.kind === "other") { skipped.push(e); taken.add(e.rel); }
    else e.dest = unique(`${mediaFolder.library}/${slug(path.basename(e.rel))}`);
  }
  let rewritten = 0;
  for (const e of live) for (const ref of e.refs) if (ref.url !== `/${e.dest}`) { ref.set(`/${e.dest}`); rewritten++; }
  const moves = live.filter(e => e.dest !== e.rel);
  const inUse = moves.filter(e => e.refs.length), toLibrary = moves.filter(e => !e.refs.length && e.kind !== "pdf"), toScores = moves.filter(e => !e.refs.length && e.kind === "pdf");
  const deletes = [...entries.values()].filter(e => e.keeper);
  const freed = deletes.reduce((n, e) => n + e.size, 0);
  const changes = moves.length + deletes.length;

  if (apply && changes) {
    for (const e of deletes) await unlink(path.join(pub, e.rel));
    const onDisk = new Set([...entries.values()].filter(e => !e.keeper).map(e => e.rel));
    let pending = moves.map(e => ({ from: e.rel, to: e.dest }));
    while (pending.length) {
      const ready = pending.filter(m => !onDisk.has(m.to));
      if (!ready.length) { const m = pending[0]; await rename(path.join(pub, m.from), path.join(pub, m.from + tmpSuffix)); onDisk.delete(m.from); onDisk.add(m.from + tmpSuffix); m.from += tmpSuffix; continue; }
      for (const m of ready) { await mkdir(path.dirname(path.join(pub, m.to)), { recursive: true }); await rename(path.join(pub, m.from), path.join(pub, m.to)); onDisk.delete(m.from); onDisk.add(m.to); }
      pending = pending.filter(m => !ready.includes(m));
    }
    await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + "\n");
    await prune(pub, pub);
  }

  // the plan, as text
  const lines: string[] = [];
  const total = [...entries.values()].reduce((n, e) => n + e.size, 0);
  lines.push(`${entries.size} files under public/ · ${mb(total)}`, "");
  const section = (title: string, items: string[]) => { if (items.length) lines.push(title, ...items.map(s => `  ${s}`), ""); };
  const who = (e: Entry) => { const names = [...new Set(e.refs.map(r => r.who))]; return names.length > 1 ? ` (${names.join(", ")})` : ""; };
  section(`${apply ? "Moved" : "Move"} ${inUse.length} files in use next to their piece`, inUse.map(e => `/${e.rel} → /${e.dest}${who(e)}`));
  section(`${apply ? "Moved" : "Move"} ${toLibrary.length} unused files to the library`, toLibrary.map(e => `/${e.rel} → /${e.dest}`));
  section(`${apply ? "Moved" : "Move"} ${toScores.length} scores`, toScores.map(e => `/${e.rel} → /${e.dest}`));
  section(`${apply ? "Removed" : "Remove"} ${deletes.length} duplicate copies · ${mb(freed)}`, deletes.map(e => `/${e.rel} (same as /${e.keeper!.dest})`));
  section(`Named in code, staying put (${pinned.length})`, pinned.map(e => `/${e.rel} ← ${[...new Set(e.pins)].join(", ")}`));
  section(`Not media, left alone (${skipped.length})`, skipped.map(e => `/${e.rel}`));
  section(`Missing files (${missing.length})`, missing.map(r => `${r.url} ← ${r.who}`));
  lines.push(`Catalog: ${rewritten} paths${apply ? " rewritten" : " to rewrite"}`, "");
  const summary = changes ? `${apply ? "" : "Would move "}${moves.length}${apply ? " moved" : ""}, ${deletes.length} duplicates${apply ? " removed" : ""} · ${mb(freed)}${apply ? " freed" : ""}` : "Everything is already in place";
  lines.push(apply ? (changes ? "Done." : summary) : changes ? "Dry run, nothing changed yet. `npm run media -- --apply` or the editor's organize button does it." : summary);
  return { report: lines.join("\n"), summary, changes };
}

async function prune(dir: string, pub: string) { // empty folders go, .DS_Store does not keep one alive
  for (const entry of await readdir(dir, { withFileTypes: true })) if (entry.isDirectory()) await prune(path.join(dir, entry.name), pub);
  if (dir === pub) return;
  const left = await readdir(dir);
  if (left.length === 1 && left[0] === ".DS_Store") { await unlink(path.join(dir, ".DS_Store")); left.length = 0; }
  if (!left.length) await rmdir(dir);
}
