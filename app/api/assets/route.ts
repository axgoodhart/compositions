import { access, mkdir, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import { assetKind, type Asset } from "@/lib/assets";

const root = path.join(process.cwd(), "public");
const dev = process.env.NODE_ENV === "development";
const exists = (p: string) => access(p).then(() => true, () => false);

async function scan(dir: string, depth = 0): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (depth < 3) out.push(...await scan(full, depth + 1)); continue; }
    const kind = assetKind(entry.name);
    if (!kind) continue;
    out.push({ url: "/" + path.relative(root, full).split(path.sep).join("/"), name: entry.name, kind, size: (await stat(full)).size });
  }
  return out;
}

export async function GET() {
  if (!dev) return new Response(null, { status: 404 });
  const assets = (await scan(root)).sort((a, b) => a.url.localeCompare(b.url));
  return Response.json({ assets });
}

export async function POST(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const form = await request.formData();
  const folder = String(form.get("folder") ?? "images").replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "") || "images";
  const dir = path.join(root, folder);
  if (!dir.startsWith(root + path.sep)) return Response.json({ error: "Bad folder" }, { status: 400 });
  await mkdir(dir, { recursive: true });
  const saved: string[] = [];
  for (const value of form.getAll("files")) {
    if (!(value instanceof File) || !assetKind(value.name)) continue;
    const dot = value.name.lastIndexOf(".");
    const stem = value.name.slice(0, dot).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^\w.()-]/g, "") || "file";
    const ext = value.name.slice(dot).toLowerCase();
    let name = stem + ext;
    for (let n = 2; await exists(path.join(dir, name)); n++) name = `${stem}-${n}${ext}`; // never overwrite
    await writeFile(path.join(dir, name), Buffer.from(await value.arrayBuffer()));
    saved.push(`/${folder}/${name}`);
  }
  return Response.json({ saved });
}
