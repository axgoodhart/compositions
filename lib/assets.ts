// Shared between the asset API, the editor and the media organizer (lib/media.ts).
export type AssetKind = "image" | "video" | "audio" | "pdf";
export type Asset = { url: string; name: string; kind: AssetKind; size: number };
export type MediaRole = "cover" | "room" | "intro" | "audio" | "site" | "scores" | "library";

// ==== LAYOUT ==== under public/; uploads land by role, `npm run media` renames each file after the piece that uses it
export const mediaFolder: Record<MediaRole, string> = { cover: "media/covers", room: "media/rooms", intro: "media/intros", audio: "media/audio", site: "media/site", scores: "media/scores", library: "media/library" };

const kinds: Record<string, AssetKind> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".svg": "image", ".avif": "image",
  ".mp4": "video", ".m4v": "video", ".webm": "video", ".mov": "video",
  ".mp3": "audio", ".m4a": "audio", ".wav": "audio", ".ogg": "audio", ".aac": "audio", ".flac": "audio",
  ".pdf": "pdf",
};
export const assetKind = (name: string): AssetKind | undefined => kinds[name.slice(name.lastIndexOf(".")).toLowerCase()];
