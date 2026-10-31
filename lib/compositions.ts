// Everything the page shows lives in lib/catalog.json. Edit it visually at http://localhost:3000/edit while `npm run dev` runs.
// Files inside public/ use a URL without "public": public/images/x.png -> /images/x.png
import catalog from "./catalog.json";

// ==== FIELDS ====
export type Catalog = { settings: Settings; compositions: Composition[] };
export type Settings = {
  introCooldownHours: number; // hours between intro videos per piece and browser; 0 = every time
  homeId: string; // piece selected on load and when clicking the wordmark / home
  galleryImage: string; // backdrop behind the scrolling covers
};
export type Composition = {
  id: string; // unique; letters, numbers, dashes
  title: string;
  lines: string[]; // title as display lines
  year: string;
  place: string;
  ensemble: string;
  duration: string;
  world: string; // eyebrow text inside the composition
  note: string; // paragraph inside the composition
  audio?: string; // audio file for the in-room player; omit to use the synth preview
  tones?: number[]; // synth preview pitches in Hz when there is no audio file
  cover: Cover;
  room: Room;
  intro?: Intro; // omit for no video
};
export type Cover = {
  src: string;
  size?: string; // CSS background-size; default cover
  position?: string; // CSS background-position; default center
  filter?: string; // CSS filter, e.g. "grayscale(1)"; default none
};
export type Room = {
  src?: string; // background image; omit for gradients only
  overlay?: string; // CSS gradient layers drawn over the image
  position?: string; // CSS background-position of the image; default center
  color?: string; // CSS color behind everything; default #080d15
  filter?: string; // CSS filter on the image and overlay; default none
  stars?: boolean; // twinkling star layer
};
export type Intro = {
  src: string;
  start?: number; // seconds into the file; default 0
  play: number; // seconds on screen
  speed?: number; // playback rate; 1 = normal, 0.5 = half, 2 = double
  delay?: number; // seconds after entering before the video appears; default 0
  fit?: "cover" | "contain"; // default cover
  position?: string; // CSS object-position; default center
  filter?: string; // CSS filter; default none
  overlay?: string; // CSS color or gradient over the video; default none
};

// ==== DATA ====
const data = catalog as unknown as Catalog;
export const { introCooldownHours, homeId, galleryImage } = data.settings;
export const compositions = data.compositions;
