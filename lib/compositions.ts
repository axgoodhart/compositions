// Everything the page shows for a composition lives in this one file.
// Files inside public/ use a URL without "public": public/images/x.png -> /images/x.png

// ==== SETTINGS ====
export const introCooldownHours = 0; // hours between intro videos per piece and browser; 0 = every time
export const homeId = "raven"; // piece selected on load and when clicking the wordmark / home
export const galleryImage = "/images/piano-room.png"; // backdrop behind the scrolling covers

// ==== FIELDS ====
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

// ==== COMPOSITIONS ====
export const compositions: Composition[] = [
  {
    id: "midnight",
    title: "Sonnets of Midnight", lines: ["Sonnets of", "Midnight"],
    year: "2018", place: "San Francisco", ensemble: "tenor, two pianos", duration: "24 minutes",
    world: "Beyond the midnight sky",
    note: "A quiet constellation of voice and piano. Step beyond the walls and into the night.",
    tones: [130.81, 196, 261.63, 293.66, 392, 523.25],
    cover: { src: "/images/reference.png", size: "675.908% 268.736%", position: "0% 7.753%" },
    room: { overlay: "radial-gradient(ellipse at 70% 32%,#55707575,transparent 35%),radial-gradient(ellipse at 30% 70%,#41365680,transparent 50%)", color: "#070d19", stars: true },
  },
  {
    id: "raven",
    title: "The Raven Cantata", lines: ["The Raven", "Cantata"],
    year: "2019", place: "San Francisco", ensemble: "vocal, chamber orchestra", duration: "32 minutes",
    world: "Inside the raven’s chamber",
    note: "For baritone solo, mixed chorus, piano & strings. A world of shadow, memory, and the words of Edgar Allan Poe.",
    tones: [146.83, 174.61, 220, 293.66, 349.23, 440],
    cover: { src: "/images/reference.png", size: "400% 183.08%", position: "26.0417% 27.0909%" },
    room: { src: "/images/raven-room.png", overlay: "linear-gradient(90deg,#0b080787,#0b080715)" },
    intro: { src: "/images/Ravenical.m4v", start: 0, play: 4, speed: 1, delay: 0, fit: "cover", position: "50% 100%", filter: "none", overlay: "none" },
  },
  {
    id: "mountain",
    title: "yes (mountain flower)", lines: ["yes", "(mountain flower)"],
    year: "2020", place: "San Francisco", ensemble: "double choir", duration: "18 minutes",
    world: "Where the walls become woodland",
    note: "Two choirs, an open landscape. A space for voices to unfold like the first light through the trees.",
    tones: [174.61, 220, 261.63, 349.23, 440, 523.25],
    cover: { src: "/images/reference.png", size: "593.623% 269.933%", position: "81.033% 10.616%" },
    room: { src: "/images/forest-room.png", overlay: "linear-gradient(90deg,#07170fb0,#07170f10)" },
  },
];
