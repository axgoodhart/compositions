// Everything the page shows lives in lib/catalog.json. Edit it visually at http://localhost:3000/editlive while `npm run dev` runs.
// Files inside public/ use a URL without "public": public/media/covers/raven.webp -> /media/covers/raven.webp. `npm run media` files them by piece.
import catalog from "./catalog.json";
import type { CoverDoc } from "./cover-doc";

// ==== FIELDS ====
export type Catalog = { settings: Settings; compositions: Composition[] };
export type Settings = {
  introCooldownHours: number; // hours between intro videos per piece and browser; 0 = every time
  homeId: string; // piece selected on load and when clicking the wordmark / home
  galleryImage: string; // backdrop behind the scrolling covers
};
export type Composition = {
  id: string; // unique; letters, numbers, dashes
  title: string; // the display lines joined; used in labels and captions
  lines: string[]; // title as display lines
  year: string;
  place: string;
  ensemble: string;
  duration: string;
  players?: number; // number of performers; drives the "players" sort, not shown
  hidden?: boolean; // kept in the editor, left off the site
  audio?: string; // recording for the in-room player; omit for no player
  score?: string; // PDF for the in-room score reader; omit for no score button
  cover: Cover;
  room: Room;
  intro?: Intro; // omit for no video
};
export type Cover = {
  src: string;
  doc?: CoverDoc; // the generated document behind src, so it can be edited again
  saved?: CoverDoc[]; // variants kept in the cover studio
  size?: string; // CSS background-size; default cover
  position?: string; // CSS background-position; default center
  filter?: string; // CSS filter, e.g. "grayscale(1)"; default none
};
export type Room = {
  src?: string; // background image; omit for gradients only
  video?: string; // looping silent video over the image, inside the composition; shares size, position and filter
  overlay?: string; // CSS gradient layers drawn over the image
  size?: string; // CSS background-size of the image, e.g. "140% 120%"; default cover
  position?: string; // CSS background-position of the image; default center
  color?: string; // CSS color behind everything; default #080d15
  filter?: string; // CSS filter on the image and overlay; default none
};
export type Intro = {
  src: string;
  start?: number; // seconds into the file; default 0
  play: number; // seconds on screen
  speed?: number; // playback rate; 1 = normal, 0.5 = half, 2 = double
  delay?: number; // seconds after entering before the video appears; default 0
  fade?: number; // seconds the last frame takes to dissolve into the room; default 0.4
  fit?: "cover" | "contain"; // default cover
  zoom?: number; // scale on top of fit; default 1
  position?: string; // CSS object-position; default center
  filter?: string; // CSS filter; default none
  overlay?: string; // CSS color or gradient over the video; default none
};

// ==== DATA ====
const data = catalog as unknown as Catalog;
export const { introCooldownHours, homeId, galleryImage } = data.settings;
export const compositions = data.compositions;
