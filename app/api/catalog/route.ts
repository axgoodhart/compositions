import { readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { Catalog } from "@/lib/compositions";

const file = path.join(process.cwd(), "lib/catalog.json");
const dev = process.env.NODE_ENV === "development";

export async function GET() {
  if (!dev) return new Response(null, { status: 404 });
  return new Response(await readFile(file, "utf8"), { headers: { "content-type": "application/json" } });
}

export async function PUT(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const body = (await request.json()) as Catalog;
  if (!body?.settings || !Array.isArray(body.compositions)) return Response.json({ error: "Malformed catalog" }, { status: 400 });
  const ids = body.compositions.map(piece => piece.id);
  if (new Set(ids).size !== ids.length) return Response.json({ error: "Two compositions share an id" }, { status: 400 });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(body, null, 2) + "\n");
  await rename(tmp, file); // atomic swap so the dev server never reads a half-written file
  return Response.json({ ok: true });
}
