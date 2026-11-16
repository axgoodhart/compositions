// The media organizer, for the editor's Site section. Development only, like the rest of the editor.
import { organize } from "@/lib/media";

const dev = process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  if (!dev) return new Response(null, { status: 404 });
  const { apply } = (await request.json().catch(() => ({}))) as { apply?: boolean };
  try { return Response.json(await organize(process.cwd(), { apply: !!apply })); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
