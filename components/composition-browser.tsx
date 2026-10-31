"use client";

import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Headphones, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { ScoreArtwork } from "@/components/score-artwork";
import { compositions, galleryImage, homeId, introCooldownHours, type Catalog, type Composition, type Cover, type Intro, type Room } from "@/lib/compositions";

const defaultCatalog: Catalog = { settings: { introCooldownHours, homeId, galleryImage }, compositions };
const emptyPiece: Composition = { id: "", title: "", lines: [], year: "", place: "", ensemble: "", duration: "", world: "", note: "", cover: { src: "" }, room: {} };
const pct = (s = "") => s.trim().split(/\s+/).map(parseFloat);
const clamp = (n: number) => Math.min(100, Math.max(0, n));
const fmt = (n: number) => String(+n.toFixed(3));

// ==== EDITOR HOOKS ==== only /editlive passes these; the public site never does
export type TextField = "year" | "place" | "ensemble" | "duration" | "world" | "note";
export type EditorHooks = {
  showIntro: boolean; // keep the intro video looping inside a composition
  replayKey: number; // bump to run the real delay → play → stop sequence once
  select?: { index: number; nonce: number }; // bump nonce to move the gallery to a piece
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
  const pieces = catalog.compositions;
  const { homeId, galleryImage, introCooldownHours } = catalog.settings;
  const count = Math.max(1, pieces.length);
  const homeIndex = Math.max(0, pieces.findIndex(piece => piece.id === homeId));
  const total = String(pieces.length).padStart(2, "0");
  const editing = !!editor;
  const hold = !!editor?.hold;
  const compare = editor?.compare;
  const hooks = useRef(editor);
  hooks.current = editor;
  const wasHold = useRef(false);
  const [cursor, setCursor] = useState(homeIndex);
  const selected = ((cursor % count) + count) % count;
  const [immersed, setImmersed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [introActive, setIntroActive] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const introStarted = useRef(false);
  const oneShot = useRef(false); // editor: run the intro once instead of looping
  const introTimer = useRef<number | undefined>(undefined);
  const wheelTimer = useRef<number | undefined>(undefined);
  const dragged = useRef(false);
  const natural = useRef<Record<string, { w: number; h: number }>>({}); // editor: cover sheet pixel sizes
  const lastIntros = useRef<Record<string, number>>({});
  const lastWheel = useRef(0);
  const touchStart = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const piece = pieces[selected] ?? emptyPiece;
  const intro = piece.intro;
  const introStart = intro?.start ?? 0;
  const introSpeed = intro?.speed ?? 1;
  const introEnd = editing && !(intro && intro.play > 0) ? Infinity : introStart + (intro?.play ?? 0) * introSpeed; // media seconds
  const introShowing = introActive && introVisible && immersed;
  const roomStyle = {
    "--gallery-image": `url("${galleryImage}")`,
    "--room-layers": [piece.room.overlay, piece.room.src && `url("${piece.room.src}")`].filter(Boolean).join(",") || undefined,
    "--room-color": piece.room.color,
    "--room-position": piece.room.position,
    "--room-filter": piece.room.filter,
  } as CSSProperties;
  const introStyle = { "--intro-fit": intro?.fit, "--intro-position": intro?.position, "--intro-filter": intro?.filter, "--intro-overlay": intro?.overlay } as CSSProperties;
  const stopIntro = useCallback(() => { window.clearTimeout(introTimer.current); setIntroActive(false); setIntroVisible(false); }, []);
  const navigate = useCallback((direction: number) => {
    setCursor(current => current + direction);
    setPlaying(false);
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

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return; // typing in the editor
      if (event.key === "Escape") { setPanel(null); setImmersed(false); setPlaying(false); stopIntro(); }
      if (event.key === "ArrowRight") navigate(1);
      if (event.key === "ArrowLeft") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, stopIntro]);

  useEffect(() => {
    const element = audioElement.current;
    if (!element) return;
    if (playing) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [playing, immersed, piece]);

  useEffect(() => {
    if (!playing || muted || piece.audio) return;
    const context = audio.current;
    if (!context) return;
    const tones = piece.tones ?? [220, 277.18, 329.63, 440];
    let step = 0;
    const ring = () => {
      const oscillator = context.createOscillator();
      const harmonic = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      const frequency = tones[(step * 7 + Math.floor(step / 6)) % tones.length];
      oscillator.type = "sine";
      harmonic.type = "sine";
      oscillator.frequency.value = frequency;
      harmonic.frequency.value = frequency * 2.002;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
      oscillator.connect(gain); harmonic.connect(gain); gain.connect(context.destination);
      oscillator.start(); harmonic.start(); oscillator.stop(now + 3); harmonic.stop(now + 3);
      step++;
    };
    ring();
    const interval = window.setInterval(ring, 1100);
    return () => { window.clearInterval(interval); void context.suspend(); };
  }, [playing, muted, piece]);

  useEffect(() => () => { void audio.current?.close(); }, []);

  useEffect(() => {
    if (!introActive || !introVisible || !intro || (editing && !oneShot.current)) return;
    // Restore the still image even if playback stalls before the clip ends.
    const timeout = window.setTimeout(stopIntro, (intro.play + 1) * 1000);
    return () => window.clearTimeout(timeout);
  }, [introActive, introVisible, intro, stopIntro, editing]);

  // ==== EDITOR WIRING ====
  useEffect(() => { hooks.current?.onState({ index: selected, immersed }); }, [selected, immersed]);
  useEffect(() => { if (editor?.select) selectPiece(editor.select.index); }, [editor?.select?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (hold) { oneShot.current = false; setIntroActive(true); if (video && video.readyState >= 1) seekToEnd(video); }
    else if (wasHold.current) { if (!hooks.current?.showIntro) stopIntro(); else if (video) video.currentTime = introStart; } // released: resume the loop
    wasHold.current = hold;
  }, [hold, introEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const explicitCover = (cover: Cover, box: DOMRect) => { // background-size/position as numbers, resolving "cover" to percentages
    const [W, H] = pct(cover.size);
    const [X = 50, Y = 50] = pct(cover.position).map(v => (Number.isNaN(v) ? 50 : v));
    if (W > 0 && H > 0) return { W, H, X, Y };
    const dims = natural.current[cover.src];
    if (!dims) return null;
    const scale = Math.max(box.width / dims.w, box.height / dims.h);
    return { W: (dims.w * scale) / box.width * 100, H: (dims.h * scale) / box.height * 100, X: 50, Y: 50 };
  };
  const coverDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const art = event.currentTarget.querySelector<HTMLElement>(".score-artwork");
    if (!art || event.button !== 0) return;
    const box = art.getBoundingClientRect();
    const start = explicitCover(piece.cover, box);
    if (!start) return;
    const origin = { x: event.clientX, y: event.clientY };
    const slackX = box.width * (1 - start.W / 100), slackY = box.height * (1 - start.H / 100);
    dragged.current = false;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true;
      hooks.current?.onCover({ size: `${fmt(start.W)}% ${fmt(start.H)}%`, position: `${fmt(slackX ? clamp(start.X + (dx / slackX) * 100) : start.X)}% ${fmt(slackY ? clamp(start.Y + (dy / slackY) * 100) : start.Y)}%` });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (dragged.current) hooks.current?.onCommit(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const coverZoom = (event: ReactWheelEvent<HTMLElement>) => {
    event.stopPropagation();
    const art = event.currentTarget.querySelector<HTMLElement>(".score-artwork");
    const current = art && explicitCover(piece.cover, art.getBoundingClientRect());
    if (!current) return;
    const factor = Math.max(event.deltaY > 0 ? 0.97 : 1.03, 100 / current.W, 100 / current.H); // never smaller than the cover box
    hooks.current?.onCover({ size: `${fmt(current.W * factor)}% ${fmt(current.H * factor)}%`, position: `${fmt(current.X)}% ${fmt(current.Y)}%` });
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => hooks.current?.onCommit(), 400);
  };
  const videoDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const video = videoElement.current;
    if (!video || !intro || event.button !== 0) return;
    const box = video.getBoundingClientRect();
    const [X = 50, Y = 50] = pct(intro.position).map(v => (Number.isNaN(v) ? 50 : v));
    const scale = (intro.fit === "contain" ? Math.min : Math.max)(box.width / video.videoWidth, box.height / video.videoHeight);
    const slackX = box.width - video.videoWidth * scale, slackY = box.height - video.videoHeight * scale;
    const origin = { x: event.clientX, y: event.clientY };
    const move = (e: PointerEvent) => hooks.current?.onIntro({ position: `${fmt(Math.abs(slackX) > 1 ? clamp(X + ((e.clientX - origin.x) / slackX) * 100) : X)}% ${fmt(Math.abs(slackY) > 1 ? clamp(Y + ((e.clientY - origin.y) / slackY) * 100) : Y)}%` });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); hooks.current?.onCommit(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.preventDefault();
  };
  const roomDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const src = piece.room.src, dims = src ? natural.current[src] : undefined;
    if (!dims || event.button !== 0) return;
    const box = (event.currentTarget.parentElement ?? event.currentTarget).getBoundingClientRect();
    const [X = 50, Y = 50] = pct(piece.room.position).map(v => (Number.isNaN(v) ? 50 : v));
    const scale = Math.max(box.width / dims.w, box.height / dims.h); // background-size: cover
    const slackX = box.width - dims.w * scale, slackY = box.height - dims.h * scale;
    const origin = { x: event.clientX, y: event.clientY };
    const move = (e: PointerEvent) => hooks.current?.onRoom({ position: `${fmt(Math.abs(slackX) > 1 ? clamp(X + ((e.clientX - origin.x) / slackX) * 100) : X)}% ${fmt(Math.abs(slackY) > 1 ? clamp(Y + ((e.clientY - origin.y) / slackY) * 100) : Y)}%` });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); hooks.current?.onCommit(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.preventDefault();
  };
  const finishIntro = (video: HTMLVideoElement) => {
    if (editing && !oneShot.current) { video.currentTime = introStart; return; } // loop while editing; onSeeked resumes playback
    stopIntro();
    if (!editing) return;
    oneShot.current = false;
    if (hooks.current?.showIntro) introTimer.current = window.setTimeout(() => setIntroActive(true), 900);
  };
  const setLine = (index: number, value: string) => hooks.current?.onLines(value ? piece.lines.map((line, i) => (i === index ? value : line)) : piece.lines.filter((_, i) => i !== index));
  const title = <h1>{piece.lines.map((line, i) => <Editable key={i} tag="span" value={line} editing={editing} onCommit={value => setLine(i, value)} />)}</h1>;

  const togglePlayback = () => {
    if (!playing && !piece.audio) {
      if (!audio.current) audio.current = new AudioContext();
      void audio.current.resume();
    }
    setPlaying(!playing);
  };
  const enter = () => {
    setImmersed(true);
    setPanel(null);
    stopIntro();
    introStarted.current = false;
    if (!intro) return;
    if (editing) { oneShot.current = false; if (hooks.current?.showIntro) setIntroActive(true); return; }
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
  const exit = () => { setImmersed(false); setPlaying(false); stopIntro(); };
  const goHome = () => { exit(); setPanel(null); selectPiece(homeIndex); };

  return (
    <main className={`music-room ${immersed ? "immersed" : ""} ${introShowing ? "intro-playing" : ""} ${editing ? "editing" : ""}`} style={roomStyle} data-piece={piece.id} data-ready={ready} onWheel={event => {
      if (immersed || panel || Math.abs(event.deltaX) + Math.abs(event.deltaY) < 20 || Date.now() - lastWheel.current < 900) return;
      lastWheel.current = Date.now(); navigate((event.deltaX || event.deltaY) > 0 ? 1 : -1);
    }} onTouchStart={event => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={event => {
      if (immersed || panel) return;
      const difference = touchStart.current - event.changedTouches[0].clientX;
      if (Math.abs(difference) > 55) navigate(difference > 0 ? 1 : -1);
    }}>
      <div className="room-background" aria-hidden="true" />
      <div className="environment" aria-hidden="true">
        {piece.room.stars && <div className="stars" />}
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
            if (!hooks.current?.hold && event.currentTarget.currentTime >= introEnd) finishIntro(event.currentTarget);
          }} onEnded={event => { if (!hooks.current?.hold) finishIntro(event.currentTarget); }} onError={stopIntro} />
        </div>}
      </div>
      <div className="room-grain" aria-hidden="true" />
      <header className="room-header">
        <button className="wordmark" onClick={goHome}>ALEXANDER GOODHART<span>COMPOSER</span></button>
        <span className="collection-label">SELECTED COMPOSITIONS <span> / </span> 01—{total}</span>
      </header>

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
            <ScoreArtwork piece={item} /><span className="artwork-caption">{framing ? "DRAG TO FRAME · SCROLL TO ZOOM · CLICK TO CHANGE" : offset === 0 ? "ENTER THE COMPOSITION" : item.title}<ArrowUpRight size={12} /></span>
          </button>;
        })}
        <div className="composition-info" key={piece.id} aria-live="polite">
          <div className="piece-eyebrow"><span /> SELECTED WORK / {String(selected + 1).padStart(2, "0")}</div>
          {title}
          <div className="piece-details">
            <p><Editable value={piece.year} editing={editing} onCommit={v => hooks.current?.onField("year", v)} />, <Editable value={piece.place} editing={editing} onCommit={v => hooks.current?.onField("place", v)} /></p>
            <p><Editable value={piece.ensemble} editing={editing} onCommit={v => hooks.current?.onField("ensemble", v)} /></p>
            <p><Editable value={piece.duration} editing={editing} onCommit={v => hooks.current?.onField("duration", v)} /></p>
          </div>
          <button className="enter-button" onClick={enter}>play <span><Play size={18} strokeWidth={1} /></span></button>
          <span className="enter-hint"></span>
        </div>
      </section>

      {immersed && <section className="immersive-content" aria-label={piece.world} onPointerDown={editing ? event => { if (event.target !== event.currentTarget) return; if (introShowing) videoDrag(event); else roomDrag(event); } : undefined}>
        <button className="back-button" onClick={exit}><ArrowLeft size={16} /> back to the room</button>
        <div className="immersive-heading">
          <Editable tag="span" className="piece-eyebrow" value={piece.world} editing={editing} onCommit={v => hooks.current?.onField("world", v)} />
          {title}
          <Editable tag="p" value={piece.note} editing={editing} onCommit={v => hooks.current?.onField("note", v)} />
          <div className="immersive-meta"><Editable value={piece.ensemble} editing={editing} onCommit={v => hooks.current?.onField("ensemble", v)} /> <span>·</span> <Editable value={piece.duration} editing={editing} onCommit={v => hooks.current?.onField("duration", v)} /></div>
        </div>
        {piece.audio && <audio key={piece.id} ref={audioElement} src={piece.audio} muted={muted} preload="none" onEnded={() => setPlaying(false)} />}
        <div className="sound-player"><button className="play-round" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><div><div className={`waveform ${playing && !muted ? "active" : ""}`}>{Array.from({ length: 42 }, (_, i) => <i key={i} style={{ height: `${5 + ((i * 17 + 7) % 25)}px`, animationDelay: `${i * -0.12}s` }} />)}</div><span>{piece.audio ? "RECORDING" : "AMBIENT PREVIEW · NOT THE ORIGINAL RECORDING"}</span></div><button className="mute-button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { if (muted && playing) void audio.current?.resume(); setMuted(!muted); }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button></div>
      </section>}

      {panel && <section className="info-panel" aria-labelledby="panel-title"><button className="close-panel" aria-label="Close information" onClick={() => setPanel(null)}><X size={22} /></button><span className="piece-eyebrow">ALEXANDER GOODHART</span><h2 id="panel-title">{panel}</h2>{panel === "about" ? <p>Music for voices, pianos, and the spaces in between. Explore selected compositions by Alexander Goodhart, each with a world of its own.</p> : panel === "learn" ? <><p>Move through the collection with your trackpad, the arrows below, or your keyboard. On a touch screen, swipe left or right.</p><p>Select a score or press play to step inside its world. Press Escape to return.</p></> : panel === "ideas" ? <p>What if a piece of music could become a place? These rooms explore that idea: a midnight sky, a candlelit chamber, and a living forest.</p> : <p>For performance and score inquiries, contact details will be added here. Original recordings and downloadable scores have not yet been provided.</p>}<button className="panel-return" onClick={() => setPanel(null)}>return to the music <ArrowRight size={16} /></button></section>}
      <div className="room-glass" />
      <aside className="glass-sidebar"><span className="sidebar-top">AG / MUSIC</span><nav aria-label="Main navigation">{["home", "about", "learn", "listen", "ideas", "contact"].map(item => <button key={item} className={(panel === item || (!panel && item === "listen")) ? "active" : ""} onClick={() => { if (item === "home") goHome(); else if (item === "listen") { exit(); setPanel(null); } else { setPanel(item); setPlaying(false); } }}>{item}</button>)}</nav><button className="monogram" aria-label="Alexander Goodhart home" onClick={goHome}><span>A</span><span>G</span></button><span className="sidebar-bottom">SOUND & SPACE</span></aside>
      <footer className="room-footer"><div className="browse-controls"><button onClick={() => navigate(-1)} aria-label="Previous composition"><ArrowLeft size={25} strokeWidth={1} /></button><span>scroll</span><button onClick={() => navigate(1)} aria-label="Next composition"><ArrowRight size={25} strokeWidth={1} /></button><span className="browse-count">{String(selected + 1).padStart(2, "0")}<span> / {total}</span></span></div><div className="pagination" aria-label="Choose composition">{pieces.map((item, i) => <button key={i} className={i === selected ? "selected" : ""} aria-label={`Select ${item.title}`} aria-current={i === selected ? "true" : undefined} onClick={() => { selectPiece(i); exit(); setPanel(null); }} />)}</div><span className="headphone-note"><Headphones size={13} strokeWidth={1.5} /> best experienced with headphones</span></footer>
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
