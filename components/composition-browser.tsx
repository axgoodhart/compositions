"use client";

import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Headphones, Play, X } from "lucide-react";
import { ScoreArtwork } from "@/components/score-artwork";
import { ScoreReader } from "@/components/score-reader";
import { compositions, galleryImage, homeId, introCooldownHours, type Catalog, type Composition, type Cover, type Intro, type Room } from "@/lib/compositions";

const defaultCatalog: Catalog = { settings: { introCooldownHours, homeId, galleryImage }, compositions };

// ==== SORT ==== "none" is the catalog order the editor's rail writes
export type SortKey = "none" | "alpha" | "year" | "duration" | "players";
export const sortKeys: SortKey[] = ["none", "alpha", "year", "duration", "players"];
const sortLabel: Record<SortKey, string> = { none: "NONE", alpha: "A–Z", year: "YEAR", duration: "DURATION", players: "PLAYERS" };
const sortStorageKey = "composition-sort";
const firstNumber = (s = "") => { const m = s.match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const sortTitle = (t: string) => t.replace(/^(the|a|an)\s+/i, "");
const rank = (p: Composition, key: SortKey) => { // year newest first; duration and players smallest first; missing values last
  const n = key === "year" ? -firstNumber(p.year) : key === "duration" ? firstNumber(p.duration) : p.players ?? NaN;
  return Number.isNaN(n) ? Infinity : n;
};
export const sortOrder = (pieces: Composition[], key: SortKey): number[] => { // catalog indices in display order
  const order = pieces.map((_, i) => i);
  if (key === "none") return order;
  if (key === "alpha") return order.sort((a, b) => sortTitle(pieces[a].title).localeCompare(sortTitle(pieces[b].title), undefined, { numeric: true, sensitivity: "base" }) || a - b);
  return order.sort((a, b) => rank(pieces[a], key) - rank(pieces[b], key) || a - b);
};
const emptyPiece: Composition = { id: "", title: "", lines: [], year: "", place: "", ensemble: "", duration: "", cover: { src: "" }, room: {} };
const pct = (s = "") => s.trim().split(/\s+/).map(parseFloat);
const clamp = (n: number) => Math.min(100, Math.max(0, n));
const fmt = (n: number) => String(+n.toFixed(3));

// ==== PLAYER ====
const countdownSeconds = 3; // entering a room with a recording counts down, then plays
const scrubFadeMs = 70; // volume ramps out before a seek and back in after it
const showPlaylist = false; // the roman-numeral list waits for multi-movement recordings
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const numerals: [number, string][] = [[100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
const roman = (n: number) => numerals.reduce((out, [value, glyph]) => { while (n >= value) { out += glyph; n -= value; } return out; }, "");

// ==== EDITOR HOOKS ==== only /editlive passes these; the public site never does
export type TextField = "year" | "place" | "ensemble" | "duration";
export type EditorHooks = {
  showIntro: boolean; // keep the intro video looping inside a composition
  replayKey: number; // bump to run the real delay → play → stop sequence once
  select?: { index: number; nonce: number }; // bump nonce to move the gallery to a piece
  immerse?: { value: boolean; nonce: number }; // bump nonce to enter or leave the room
  hold?: boolean; // park the intro video on the frame the visitor sees last
  compare?: { mode: "wipe" | "blend"; amount: number }; // reveal the still room under the held frame, 0–100
  onState: (state: { index: number; immersed: boolean }) => void;
  onField: (field: TextField, value: string) => void;
  onLines: (lines: string[]) => void;
  onCover: (patch: Partial<Cover>) => void;
  onIntro: (patch: Partial<Intro>) => void;
  onRoom: (patch: Partial<Room>) => void;
  onPickCover: () => void;
  onCommit: () => void; // a gesture ended; the editor records an undo step
};

export function CompositionBrowser({ catalog = defaultCatalog, editor }: { catalog?: Catalog; editor?: EditorHooks } = {}) {
  const [sort, setSort] = useState<SortKey>("none");
  const editing = !!editor;
  const all = useMemo(() => (editing ? catalog.compositions : catalog.compositions.filter(p => !p.hidden)), [catalog.compositions, editing]); // the editor keeps hidden pieces on the page
  const order = useMemo(() => sortOrder(all, sort), [all, sort]);
  const pieces = useMemo(() => order.map(i => all[i]), [order, all]);
  const { homeId, galleryImage, introCooldownHours } = catalog.settings;
  const count = Math.max(1, pieces.length);
  const homeIndex = Math.max(0, pieces.findIndex(piece => piece.id === homeId));
  const hold = !!editor?.hold;
  const compare = editor?.compare;
  const hooks = useRef(editor);
  hooks.current = editor;
  const wasHold = useRef(false);
  const [cursor, setCursor] = useState(homeIndex);
  const selected = ((cursor % count) + count) % count;
  const prevPieces = useRef(pieces);
  useEffect(() => { // when the order changes, stay on the same piece rather than the same slot
    if (prevPieces.current === pieces) return;
    const position = pieces.findIndex(p => p.id === prevPieces.current[selected]?.id);
    prevPieces.current = pieces;
    if (position >= 0 && position !== selected) setCursor(position);
  }, [pieces, selected]);
  useEffect(() => { try { const stored = window.localStorage.getItem(sortStorageKey) as SortKey | null; if (stored && sortKeys.includes(stored)) setSort(stored); } catch { /* default order */ } }, []);
  const changeSort = (key: SortKey) => { setSort(key); try { window.localStorage.setItem(sortStorageKey, key); } catch { /* fine */ } };
  const [immersed, setImmersed] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false); // the visitor asked for the score; every entry into a room starts without it
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState<Composition | null>(null); // the recording in the player, independent of the gallery cursor
  const [countdown, setCountdown] = useState<number | null>(null);
  const [time, setTime] = useState(0); // recording seconds
  const [duration, setDuration] = useState(0);
  const rampFrame = useRef(0);
  const scrub = useRef<{ x: number; faded: boolean; up: boolean } | null>(null); // a drag in progress
  const listRef = useRef<HTMLDivElement>(null);
  const recordings = useMemo(() => pieces.filter(p => p.audio), [pieces]);
  const [panel, setPanel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [introActive, setIntroActive] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const introStarted = useRef(false);
  const oneShot = useRef(false); // editor: run the intro once instead of looping
  const introTimer = useRef<number | undefined>(undefined);
  const wheelTimer = useRef<number | undefined>(undefined);
  const dragged = useRef(false);
  const natural = useRef<Record<string, { w: number; h: number }>>({}); // editor: cover and room image pixel sizes
  const lastIntros = useRef<Record<string, number>>({});
  const lastWheel = useRef(0);
  const touchStart = useRef(0);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const piece = pieces[selected] ?? emptyPiece;
  const reading = immersed && scoreOpen && !!piece.score; // the score reader is over the room
  const intro = piece.intro;
  const introStart = intro?.start ?? 0;
  const introSpeed = intro?.speed ?? 1;
  const introZoom = intro?.zoom ?? 1;
  const introFade = intro?.fade ?? 0.4;
  const introEnd = editing && !(intro && intro.play > 0) ? Infinity : introStart + (intro?.play ?? 0) * introSpeed; // media seconds
  const introShowing = introActive && introVisible && immersed;
  const roomVideo = piece.room.video;
  const roomMedia = roomVideo ?? piece.room.src; // what the room's size and position apply to
  const [roomW, roomH] = pct(piece.room.size), [roomX = 50, roomY = 50] = pct(piece.room.position).map(v => (Number.isNaN(v) ? 50 : v));
  const roomVideoStyle: CSSProperties = roomW > 0 && roomH > 0 ? { width: `${roomW}%`, height: `${roomH}%`, left: `${((100 - roomW) * roomX) / 100}%`, top: `${((100 - roomH) * roomY) / 100}%`, objectFit: "fill" } : { objectPosition: `${roomX}% ${roomY}%` }; // background-size and -position, as an element
  const roomStyle = {
    "--gallery-image": `url("${galleryImage}")`,
    "--room-layers": [!roomVideo && piece.room.overlay, piece.room.src && `url("${piece.room.src}")`].filter(Boolean).join(",") || undefined,
    "--room-overlay": roomVideo ? piece.room.overlay : undefined, // with a video the tint draws above it
    "--room-color": piece.room.color,
    "--room-size": piece.room.size,
    "--room-position": piece.room.position,
    "--room-filter": piece.room.filter,
  } as CSSProperties;
  const introStyle = { "--intro-fit": intro?.fit, "--intro-zoom": introZoom, "--intro-fade": `${introFade}s`, "--intro-position": intro?.position, "--intro-filter": intro?.filter, "--intro-overlay": intro?.overlay } as CSSProperties;
  const stopIntro = useCallback(() => { window.clearTimeout(introTimer.current); setIntroActive(false); setIntroVisible(false); }, []);
  const closeIntro = (video: HTMLVideoElement, then?: () => void) => { // dissolve the last frame into the room, then unmount
    video.pause();
    window.clearTimeout(introTimer.current);
    setIntroVisible(false);
    introTimer.current = window.setTimeout(() => { setIntroActive(false); then?.(); }, introFade * 1000);
  };
  const navigate = useCallback((direction: number) => {
    setCursor(current => current + direction);
    setCountdown(null);
    setImmersed(false);
    setPanel(null);
    stopIntro();
  }, [stopIntro]);
  const selectPiece = useCallback((index: number) => {
    setCursor(current => {
      const currentIndex = ((current % count) + count) % count;
      const forward = (index - currentIndex + count) % count;
      return current + (forward > count / 2 ? forward - count : forward);
    });
  }, [count]);

  useEffect(() => { setReady(true); setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return; // typing in the editor
      if (reading) return; // the reader turns pages with the arrows and closes on Escape
      if (event.key === "Escape") { setPanel(null); setImmersed(false); setCountdown(null); stopIntro(); }
      if (event.key === "ArrowRight") navigate(1);
      if (event.key === "ArrowLeft") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, stopIntro, reading]);

  useEffect(() => {
    const element = audioElement.current;
    if (!element) { if (playing) setPlaying(false); return; }
    if (playing) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [playing, track]);
  useEffect(() => { setTime(0); setDuration(0); }, [track?.id]);
  useEffect(() => { // 3, 2, 1, play
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); setPlaying(true); return; }
    const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);
  useEffect(() => { // keep the active row in view; scrollIntoView would also scroll the drawer's hidden overflow
    const list = listRef.current, row = list?.querySelector<HTMLElement>("li.active");
    if (!list || !row) return;
    const l = list.getBoundingClientRect(), r = row.getBoundingClientRect();
    list.scrollTop += r.top < l.top ? r.top - l.top : r.bottom > l.bottom ? r.bottom - l.bottom : 0;
  }, [selected]);

  useEffect(() => {
    if (!introActive || !introVisible || !intro || (editing && !oneShot.current)) return;
    // Restore the still image even if playback stalls before the clip ends.
    const timeout = window.setTimeout(stopIntro, (intro.play + introFade + 1) * 1000);
    return () => window.clearTimeout(timeout);
  }, [introActive, introVisible, intro, introFade, stopIntro, editing]);

  // ==== EDITOR WIRING ====
  useEffect(() => { hooks.current?.onState({ index: order[selected] ?? selected, immersed }); }, [selected, immersed, order]); // the editor speaks in catalog indices
  useEffect(() => { const position = editor?.select ? order.indexOf(editor.select.index) : -1; if (position >= 0) selectPiece(position); }, [editor?.select?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editor?.immerse) { if (editor.immerse.value) enter(); else exit(); } }, [editor?.immerse?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (videoElement.current) videoElement.current.playbackRate = introSpeed; }, [introSpeed]);
  useEffect(() => {
    if (!editing || !immersed || !intro) return;
    if (editor.showIntro) { oneShot.current = false; setIntroActive(true); } else stopIntro();
  }, [editing, editor?.showIntro, immersed, intro?.src, stopIntro]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editing || !editor.replayKey || !immersed || !intro) return;
    stopIntro();
    oneShot.current = true;
    const timer = window.setTimeout(() => setIntroActive(true), (intro.delay ?? 0) * 1000);
    return () => window.clearTimeout(timer);
  }, [editor?.replayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editing) return;
    for (const src of [piece.cover.src, piece.room.src]) {
      if (!src || natural.current[src]) continue;
      const img = new Image();
      img.onload = () => { natural.current[src] = { w: img.naturalWidth, h: img.naturalHeight }; };
      img.src = src;
    }
  }, [editing, piece.cover.src, piece.room.src]);
  const seekToEnd = (video: HTMLVideoElement) => { // park on the frame the visitor sees last
    video.pause();
    const end = Math.min(Number.isFinite(introEnd) ? introEnd : video.duration, video.duration - 0.05);
    if (Number.isFinite(end)) video.currentTime = Math.max(0, end);
    setIntroVisible(true);
  };
  useEffect(() => {
    if (!editing || !immersed || !intro) return;
    const video = videoElement.current;
    if (hold) { oneShot.current = false; window.clearTimeout(introTimer.current); setIntroActive(true); if (video && video.readyState >= 1) seekToEnd(video); }
    else if (wasHold.current) { if (!hooks.current?.showIntro) stopIntro(); else if (video) video.currentTime = introStart; } // released: resume the loop
    wasHold.current = hold;
  }, [hold, introEnd, immersed, intro?.src]); // eslint-disable-line react-hooks/exhaustive-deps

  // Image geometry as numbers: size in % of the box, focus in %; "cover" resolved from the file's pixels.
  const explicit = (src: string, size: string | undefined, position: string | undefined, box: DOMRect) => {
    const [W, H] = pct(size);
    const [X = 50, Y = 50] = pct(position).map(v => (Number.isNaN(v) ? 50 : v));
    if (W > 0 && H > 0) return { W, H, X, Y };
    const dims = natural.current[src];
    if (!dims) return null;
    const scale = Math.max(box.width / dims.w, box.height / dims.h);
    return { W: (dims.w * scale) / box.width * 100, H: (dims.h * scale) / box.height * 100, X: 50, Y: 50 };
  };
  const dragImage = (event: ReactPointerEvent<HTMLElement>, box: DOMRect, start: { W: number; H: number; X: number; Y: number }, apply: (size: string, position: string) => void) => {
    const origin = { x: event.clientX, y: event.clientY };
    const slackX = box.width * (1 - start.W / 100), slackY = box.height * (1 - start.H / 100);
    dragged.current = false;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true;
      apply(`${fmt(start.W)}% ${fmt(start.H)}%`, `${fmt(slackX ? clamp(start.X + (dx / slackX) * 100) : start.X)}% ${fmt(slackY ? clamp(start.Y + (dy / slackY) * 100) : start.Y)}%`);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (dragged.current) hooks.current?.onCommit(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.preventDefault();
  };
  const zoomImage = (event: ReactWheelEvent<HTMLElement>, current: { W: number; H: number; X: number; Y: number }, apply: (size: string, position: string) => void) => {
    const factor = Math.max(event.deltaY > 0 ? 0.97 : 1.03, 100 / current.W, 100 / current.H); // never smaller than the box
    apply(`${fmt(current.W * factor)}% ${fmt(current.H * factor)}%`, `${fmt(current.X)}% ${fmt(current.Y)}%`);
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => hooks.current?.onCommit(), 400);
  };
  const coverDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const art = event.currentTarget.querySelector<HTMLElement>(".score-artwork");
    if (!art || event.button !== 0) return;
    const box = art.getBoundingClientRect();
    const start = explicit(piece.cover.src, piece.cover.size, piece.cover.position, box);
    if (start) dragImage(event, box, start, (size, position) => hooks.current?.onCover({ size, position }));
  };
  const coverZoom = (event: ReactWheelEvent<HTMLElement>) => {
    event.stopPropagation();
    const art = event.currentTarget.querySelector<HTMLElement>(".score-artwork");
    const current = art && explicit(piece.cover.src, piece.cover.size, piece.cover.position, art.getBoundingClientRect());
    if (current) zoomImage(event, current, (size, position) => hooks.current?.onCover({ size, position }));
  };
  const roomBox = (element: HTMLElement) => (element.parentElement ?? element).getBoundingClientRect(); // the room fills .music-room
  const roomDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!roomMedia || event.button !== 0) return;
    const box = roomBox(event.currentTarget);
    const start = explicit(roomMedia, piece.room.size, piece.room.position, box);
    if (start) dragImage(event, box, start, (size, position) => hooks.current?.onRoom({ size, position }));
  };
  const roomZoom = (event: ReactWheelEvent<HTMLElement>) => {
    const current = roomMedia && explicit(roomMedia, piece.room.size, piece.room.position, roomBox(event.currentTarget));
    if (current) zoomImage(event, current, (size, position) => hooks.current?.onRoom({ size, position }));
  };
  const videoDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const video = videoElement.current;
    if (!video || !intro || event.button !== 0) return;
    const box = video.getBoundingClientRect();
    const [X = 50, Y = 50] = pct(intro.position).map(v => (Number.isNaN(v) ? 50 : v));
    const scale = (intro.fit === "contain" ? Math.min : Math.max)(box.width / video.videoWidth, box.height / video.videoHeight) * introZoom;
    const slackX = box.width - video.videoWidth * scale, slackY = box.height - video.videoHeight * scale;
    const origin = { x: event.clientX, y: event.clientY };
    const move = (e: PointerEvent) => hooks.current?.onIntro({ position: `${fmt(Math.abs(slackX) > 1 ? clamp(X + ((e.clientX - origin.x) / slackX) * 100) : X)}% ${fmt(Math.abs(slackY) > 1 ? clamp(Y + ((e.clientY - origin.y) / slackY) * 100) : Y)}%` });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); hooks.current?.onCommit(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.preventDefault();
  };
  const videoZoom = (event: ReactWheelEvent<HTMLElement>) => {
    if (!intro) return;
    const zoom = Math.min(6, Math.max(intro.fit === "contain" ? 0.25 : 1, introZoom * (event.deltaY > 0 ? 0.97 : 1.03)));
    hooks.current?.onIntro({ zoom: +zoom.toFixed(3) });
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => hooks.current?.onCommit(), 400);
  };
  const onVideoSide = (clientX: number, element: HTMLElement) => { // while comparing, each side of the wipe line edits its own layer
    if (!introShowing) return false;
    if (!compare) return true;
    if (compare.mode === "blend") return compare.amount > 0;
    const box = roomBox(element);
    return ((clientX - box.left) / box.width) * 100 < compare.amount;
  };
  const finishIntro = (video: HTMLVideoElement) => {
    if (editing && !oneShot.current) { video.currentTime = introStart; return; } // loop while editing; onSeeked resumes playback
    if (!editing) { closeIntro(video); return; }
    closeIntro(video, () => { oneShot.current = false; if (hooks.current?.showIntro) introTimer.current = window.setTimeout(() => setIntroActive(true), 900); });
  };
  const setLine = (index: number, value: string) => hooks.current?.onLines(value ? piece.lines.map((line, i) => (i === index ? value : line)) : piece.lines.filter((_, i) => i !== index));
  const title = <h1>{piece.lines.map((line, i) => <Editable key={i} tag="span" value={line} editing={editing} onCommit={value => setLine(i, value)} />)}</h1>;

  const enter = () => {
    setImmersed(true);
    setScoreOpen(false);
    setPanel(null);
    stopIntro();
    introStarted.current = false;
    if (piece.audio && !(track?.id === piece.id && playing)) { setTrack(piece); setPlaying(false); setCountdown(editing ? null : countdownSeconds); } // the room's recording takes the player
    if (!intro) return;
    if (editing) { oneShot.current = false; if (hooks.current?.showIntro || hooks.current?.hold) setIntroActive(true); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!Number.isFinite(introStart) || introStart < 0 || !Number.isFinite(intro.play) || intro.play <= 0) return;
    let lastPlayed = lastIntros.current[piece.id] ?? 0;
    try {
      const stored = Number(window.localStorage.getItem(`${piece.id}-intro-last-played`));
      if (Number.isFinite(stored)) lastPlayed = Math.max(lastPlayed, stored);
    } catch { /* Storage may be unavailable; keep the cooldown for this page session. */ }
    if (introCooldownHours !== 0 && Date.now() - lastPlayed < introCooldownHours * 60 * 60 * 1000) return;
    const delay = intro.delay ?? 0;
    if (delay > 0) introTimer.current = window.setTimeout(() => setIntroActive(true), delay * 1000);
    else setIntroActive(true);
  };
  const exit = () => { setImmersed(false); setCountdown(null); stopIntro(); }; // leaving cancels a pending autoplay; a playing recording continues
  const goHome = () => { exit(); setPanel(null); selectPiece(homeIndex); };
  const jump = (index: number) => { selectPiece(index); exit(); setPanel(null); };
  const skip = (direction: number) => { // prev/next walk the recordings and leave the gallery where it is
    if (!recordings.length) return;
    const at = recordings.findIndex(p => p.id === track?.id);
    setTrack(recordings[(at + direction + recordings.length) % recordings.length]);
    setCountdown(null);
    setPlaying(true);
  };
  const showTrack = () => { const i = track ? pieces.findIndex(p => p.id === track.id) : -1; if (i >= 0) jump(i); }; // the title brings the gallery to the playing piece
  const ramp = (to: number, ms: number) => { // fade so a seek never clicks
    const element = audioElement.current;
    if (!element) return;
    const from = element.volume, start = performance.now();
    cancelAnimationFrame(rampFrame.current);
    const tick = (now: number) => { const k = Math.min(1, Math.max(0, (now - start) / ms)); element.volume = Math.min(1, Math.max(0, from + (to - from) * k)); if (k < 1) rampFrame.current = requestAnimationFrame(tick); }; // frame timestamps can predate start
    rampFrame.current = requestAnimationFrame(tick);
  };
  const seekAt = (clientX: number, bar: HTMLElement) => {
    if (!duration) return;
    const box = bar.getBoundingClientRect();
    const at = (clamp(((clientX - box.left) / box.width) * 100) / 100) * duration;
    if (audioElement.current) audioElement.current.currentTime = at;
    setTime(at);
  };
  const scrubStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bar = event.currentTarget;
    bar.setPointerCapture(event.pointerId);
    scrub.current = { x: event.clientX, faded: false, up: false };
    ramp(0, scrubFadeMs);
    window.setTimeout(() => { // faded out: seek to the latest position, and let go if the pointer already did
      const s = scrub.current;
      if (!s) return;
      s.faded = true;
      seekAt(s.x, bar);
      if (s.up) { scrub.current = null; ramp(1, scrubFadeMs * 3); }
    }, scrubFadeMs);
  };
  const scrubMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = scrub.current;
    if (!s || !(event.buttons & 1)) return;
    s.x = event.clientX;
    if (s.faded) seekAt(s.x, event.currentTarget);
  };
  const scrubEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = scrub.current;
    if (!s) return;
    if (event.type === "pointerup") s.x = event.clientX;
    s.up = true;
    if (s.faded) { scrub.current = null; ramp(1, scrubFadeMs * 3); }
  };
  const swallow = (event: SyntheticEvent) => event.stopPropagation(); // the bar never scrolls or swipes the gallery
  const progress = duration ? (time / duration) * 100 : 0;

  return (
    <main className={`music-room ${immersed ? "immersed" : ""} ${reading ? "reading" : ""} ${introShowing ? "intro-playing" : ""} ${editing ? "editing" : ""} ${track ? "player-out" : ""}`} style={roomStyle} data-piece={piece.id} data-ready={ready} data-hidden={editing && piece.hidden ? "" : undefined} onWheel={event => {
      if (immersed || panel || Math.abs(event.deltaX) + Math.abs(event.deltaY) < 20 || Date.now() - lastWheel.current < 900) return;
      lastWheel.current = Date.now(); navigate((event.deltaX || event.deltaY) > 0 ? 1 : -1);
    }} onTouchStart={event => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={event => {
      if (immersed || panel) return;
      const difference = touchStart.current - event.changedTouches[0].clientX;
      if (Math.abs(difference) > 55) navigate(difference > 0 ? 1 : -1);
    }}>
      <div className="room-background" aria-hidden="true" />
      <div className="environment" aria-hidden="true">
        {immersed && roomVideo && <video key={roomVideo} className="room-video" src={roomVideo} style={roomVideoStyle} autoPlay={!reducedMotion} loop muted playsInline disablePictureInPicture preload="auto" onLoadedMetadata={event => { natural.current[roomVideo] = { w: event.currentTarget.videoWidth, h: event.currentTarget.videoHeight }; }} />}
        {introActive && immersed && intro && <div className={`composition-intro ${introVisible ? "visible" : ""} ${compare && introVisible ? "compare" : ""}`} style={{ ...introStyle, ...(compare && introVisible ? compare.mode === "wipe" ? { clipPath: `inset(0 ${100 - compare.amount}% 0 0)` } : { opacity: compare.amount / 100 } : {}) }}>
          <video key={`${piece.id}-${intro.src}`} ref={videoElement} src={intro.src} preload="auto" muted playsInline disablePictureInPicture onLoadedMetadata={event => {
            const video = event.currentTarget;
            video.playbackRate = introSpeed;
            if (hooks.current?.hold) { seekToEnd(video); return; }
            if (introStart >= video.duration) { stopIntro(); return; }
            if (introStart > 0) video.currentTime = introStart;
            else void video.play().catch(stopIntro);
          }} onSeeked={event => { if (hooks.current?.hold) { event.currentTarget.pause(); setIntroVisible(true); return; } void event.currentTarget.play().catch(stopIntro); }} onPlaying={() => {
            setIntroVisible(true);
            if (introStarted.current || editing) return;
            introStarted.current = true;
            lastIntros.current[piece.id] = Date.now();
            try { window.localStorage.setItem(`${piece.id}-intro-last-played`, String(lastIntros.current[piece.id])); }
            catch { /* The in-memory timestamp still prevents repeats in this page session. */ }
          }} onTimeUpdate={event => {
            if (!hooks.current?.hold && introVisible && event.currentTarget.currentTime >= introEnd) finishIntro(event.currentTarget);
          }} onEnded={event => { if (!hooks.current?.hold && introVisible) finishIntro(event.currentTarget); }} onError={stopIntro} />
        </div>}
      </div>
      <div className="room-grain" aria-hidden="true" />
      {track?.audio && <audio key={track.id} ref={audioElement} src={track.audio} preload="metadata" onEnded={() => setPlaying(false)} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onDurationChange={event => setDuration(event.currentTarget.duration)} />}
      <header className="room-header">
        <button className="wordmark" onClick={goHome}>Alex GOODHART<span>COMPOSER</span></button>
        <nav className="sort" aria-label="Sort compositions" inert={reading}>{sortKeys.map(key => <button key={key} className={sort === key ? "active" : ""} aria-pressed={sort === key} onClick={() => changeSort(key)}>{sortLabel[key]}</button>)}</nav>
      </header>
      <aside className={`player-bar ${track ? "out" : ""}`} aria-label="Player" aria-hidden={!track} inert={!track} onWheel={swallow} onTouchStart={swallow} onTouchEnd={swallow}>
        {countdown !== null ? <div className="player-countdown">
          <button className="countdown-stop" onClick={() => setCountdown(null)}>stop</button>
          <span>playing in</span>
          {Array.from({ length: countdownSeconds }, (_, i) => countdownSeconds - i).map(n => <b key={n} className={n === countdown ? "now" : n > countdown ? "done" : ""}>{n}</b>)}
        </div> : <>
          <button className="player-title" onClick={showTrack} title="Show in the gallery">{track?.title}</button>
          <div className="player-scrub" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} onPointerDown={scrubStart} onPointerMove={scrubMove} onPointerUp={scrubEnd} onPointerCancel={scrubEnd}>
            <div className="scrub-track"><div className="scrub-fill" style={{ width: `${progress}%` }} /></div>
            <div className="scrub-pearl" style={{ left: `${progress}%` }} />
          </div>
          <div className="player-time"><span>{clock(time)} /</span><span>{duration ? clock(duration) : "–:––"}</span></div>
          <div className="player-controls">
            <button aria-label="Previous recording" onClick={() => skip(-1)}><svg viewBox="0 0 36 24"><rect x="2" y="4" width="3" height="16" /><polygon points="16,12 28,4 28,20" /><polygon points="4,12 16,4 16,20" /></svg></button>
            <button aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>{playing ? <svg viewBox="0 0 36 24"><rect x="12" y="4" width="4" height="16" /><rect x="20" y="4" width="4" height="16" /></svg> : <svg viewBox="0 0 36 24"><polygon points="10,4 26,12 10,20" /></svg>}</button>
            <button aria-label="Next recording" onClick={() => skip(1)}><svg viewBox="0 0 36 24"><polygon points="8,4 20,12 8,20" /><polygon points="20,4 32,12 20,20" /><rect x="32" y="4" width="3" height="16" /></svg></button>
          </div>
        </>}
        {showPlaylist && <div className="player-list" ref={listRef}>
          <h2 className="playlist-title">{piece.title}</h2>
          <ol>{pieces.map((item, i) => <li key={item.id} className={`${i === selected ? "active" : ""} ${item.audio ? "" : "silent"}`}><button onClick={() => jump(i)} aria-current={i === selected ? "true" : undefined}><span className="track-num">{roman(i + 1)}.</span><span className="track-name">{item.title}</span></button></li>)}</ol>
        </div>}
      </aside>

      <section className="gallery" aria-label="Browse compositions" inert={immersed || !!panel}>
        {/* Stable strip positions let copies wrap only after they are offscreen. */}
        {Array.from({ length: 5 }, (_, slot) => {
          const offset = slot - 2;
          const stripIndex = cursor + offset;
          const item = pieces[((stripIndex % count) + count) % count] ?? emptyPiece;
          const position = ["before", "previous", "current", "next", "after"][slot];
          const framing = editing && offset === 0; // the current cover is a drag-and-zoom surface in the editor
          return <button key={stripIndex} className={`score-position ${position}`} inert={Math.abs(offset) > 1} aria-hidden={Math.abs(offset) > 1 ? true : undefined} aria-label={offset === 0 ? `Enter ${item.title}` : `Browse ${item.title}`}
            onClick={() => { if (framing) { if (!dragged.current) hooks.current?.onPickCover(); return; } if (offset === 0) enter(); else navigate(offset); }}
            onPointerDown={framing ? coverDrag : undefined} onWheel={framing ? coverZoom : undefined}>
            <ScoreArtwork piece={item} />
          </button>;
        })}
        <div className="composition-info" key={piece.id} aria-live="polite">
          {title}
          <div className="piece-details">
            <p><Editable value={piece.year} editing={editing} onCommit={v => hooks.current?.onField("year", v)} />{(piece.place || editing) && <>, <Editable value={piece.place} editing={editing} onCommit={v => hooks.current?.onField("place", v)} /></>}</p>
            <p><Editable value={piece.ensemble} editing={editing} onCommit={v => hooks.current?.onField("ensemble", v)} /></p>
            <p><Editable value={piece.duration} editing={editing} onCommit={v => hooks.current?.onField("duration", v)} /></p>
          </div>
          <button className="enter-button" onClick={enter}>{piece.audio ? "play" : "enter"} <span>{piece.audio ? <Play size={18} strokeWidth={1} /> : <ArrowRight size={18} strokeWidth={1} />}</span></button>
          <span className="enter-hint"></span>
        </div>
      </section>

      {immersed && <section className="immersive-content" aria-label={piece.title} inert={reading}
        onPointerDown={editing ? event => { if (event.target !== event.currentTarget) return; if (onVideoSide(event.clientX, event.currentTarget)) videoDrag(event); else roomDrag(event); } : undefined}
        onWheel={editing ? event => { if (event.target !== event.currentTarget) return; if (onVideoSide(event.clientX, event.currentTarget)) videoZoom(event); else roomZoom(event); } : undefined}>
        <button className="back-button" onClick={exit}><ArrowLeft size={16} /> back to the room</button>
        <div className="immersive-heading">
          {title}
          <div className="immersive-meta"><Editable value={piece.ensemble} editing={editing} onCommit={v => hooks.current?.onField("ensemble", v)} /> <span>·</span> <Editable value={piece.duration} editing={editing} onCommit={v => hooks.current?.onField("duration", v)} /></div>
          {piece.score && <button className="score-button" onClick={() => setScoreOpen(true)}>score <span><ArrowRight size={16} strokeWidth={1} /></span></button>}
        </div>
      </section>}
      {reading && <ScoreReader key={`score-${piece.id}`} src={piece.score!} title={piece.title} onClose={() => setScoreOpen(false)} />}

      {panel && <section className="info-panel" aria-labelledby="panel-title"><button className="close-panel" aria-label="Close information" onClick={() => setPanel(null)}><X size={22} /></button><span className="piece-eyebrow">Alex GOODHART</span><h2 id="panel-title">{panel}</h2>{panel === "about" ? <p>Music for voices, pianos, and the spaces in between. Explore selected compositions by Alex Goodhart, each with a world of its own.</p> : panel === "learn" ? <><p>Move through the collection with your trackpad, the arrows below, or your keyboard. On a touch screen, swipe left or right.</p><p>Select a score or press play to step inside its world. Press Escape to return.</p></> : panel === "ideas" ? <p>What if a piece of music could become a place? These rooms explore that idea: a midnight sky, a candlelit chamber, and a living forest.</p> : <p>For performance and score inquiries, contact details will be added here. Original recordings and downloadable scores have not yet been provided.</p>}<button className="panel-return" onClick={() => setPanel(null)}>return to the music <ArrowRight size={16} /></button></section>}
      <div className="room-glass" />
      <aside className="glass-sidebar"><span className="sidebar-top">AG / MUSIC</span><nav aria-label="Main navigation">{["home", "about", "learn", "listen", "ideas", "contact"].map(item => <button key={item} className={(panel === item || (!panel && item === "listen")) ? "active" : ""} onClick={() => { if (item === "home") goHome(); else if (item === "listen") { exit(); setPanel(null); } else { setScoreOpen(false); setPanel(item); } }}>{item}</button>)}</nav><button className="monogram" aria-label="Alex Goodhart home" onClick={goHome}><img src="/media/site/logomark.webp" alt="" /></button><span className="sidebar-bottom">https://alexgoodh.art</span></aside>
      <footer className="room-footer" inert={reading}><div className="browse-controls"><button onClick={() => navigate(-1)} aria-label="Previous composition"><ArrowLeft size={25} strokeWidth={1} /></button><span>scroll</span><button onClick={() => navigate(1)} aria-label="Next composition"><ArrowRight size={25} strokeWidth={1} /></button><span className="browse-count">{String(selected + 1).padStart(2, "0")}<span> / {String(pieces.length).padStart(2, "0")}</span></span></div><div className="pagination" aria-label="Choose composition">{pieces.map((item, i) => <button key={i} className={i === selected ? "selected" : ""} aria-label={`Select ${item.title}`} aria-current={i === selected ? "true" : undefined} onClick={() => { selectPiece(i); exit(); setPanel(null); }} />)}</div><span className="headphone-note"><Headphones size={13} strokeWidth={1.5} /> best experienced with headphones</span></footer>
    </main>
  );
}

// Text that becomes editable in place when the live editor is driving. React never owns the text node, so typing cannot fight a re-render.
function Editable({ tag = "span", className, value, editing, onCommit }: { tag?: "span" | "p"; className?: string; value: string; editing: boolean; onCommit: (value: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (ref.current && ref.current.textContent !== value) ref.current.textContent = value; }, [value]);
  if (!editing) return createElement(tag, { className }, value);
  return createElement(tag, {
    ref, className: [className, "editable"].filter(Boolean).join(" "), contentEditable: true, suppressContentEditableWarning: true, spellCheck: false,
    onBlur: (event: FocusEvent<HTMLElement>) => { const text = event.currentTarget.textContent ?? ""; if (text !== value) onCommit(text); },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.currentTarget.textContent = value; event.currentTarget.blur(); }
    },
    onPointerDown: (event: ReactPointerEvent) => event.stopPropagation(),
    onClick: (event: ReactMouseEvent) => event.stopPropagation(),
  });
}
