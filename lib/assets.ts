// Shared between the asset API and the editor.
export type AssetKind = "image" | "video" | "audio";
export type Asset = { url: string; name: string; kind: AssetKind; size: number };

const kinds: Record<string, AssetKind> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".svg": "image", ".avif": "image",
  ".mp4": "video", ".m4v": "video", ".webm": "video", ".mov": "video",
  ".mp3": "audio", ".m4a": "audio", ".wav": "audio", ".ogg": "audio", ".aac": "audio", ".flac": "audio",
};
export const assetKind = (name: string): AssetKind | undefined => kinds[name.slice(name.lastIndexOf(".")).toLowerCase()];
export const folderFor = (kind: AssetKind) => (kind === "audio" ? "audio" : "images"); // upload destination under public/
