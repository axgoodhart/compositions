"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Headphones, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { ScoreArtwork } from "@/components/score-artwork";
import { compositions as pieces, galleryImage, homeId, introCooldownHours } from "@/lib/compositions";

const homeIndex = Math.max(0, pieces.findIndex(piece => piece.id === homeId));
const total = String(pieces.length).padStart(2, "0");

export function CompositionBrowser() {
  const [cursor, setCursor] = useState(homeIndex);
  const selected = ((cursor % pieces.length) + pieces.length) % pieces.length;
  const [immersed, setImmersed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [introActive, setIntroActive] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const introStarted = useRef(false);
  const introTimer = useRef<number | undefined>(undefined);
  const lastIntros = useRef<Record<string, number>>({});
  const lastWheel = useRef(0);
  const touchStart = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const piece = pieces[selected];
  const intro = piece.intro;
  const introStart = intro?.start ?? 0;
  const introSpeed = intro?.speed ?? 1;
  const introEnd = introStart + (intro?.play ?? 0) * introSpeed; // media seconds
  const introShowing = introActive && introVisible && immersed;
  const roomStyle = {
    "--gallery-image": `url("${galleryImage}")`,
    "--room-layers": [piece.room.overlay, piece.room.src && `url("${piece.room.src}")`].filter(Boolean).join(",") || undefined,
    "--room-color": piece.room.color,
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
      const currentIndex = ((current % pieces.length) + pieces.length) % pieces.length;
      const forward = (index - currentIndex + pieces.length) % pieces.length;
      return current + (forward > pieces.length / 2 ? forward - pieces.length : forward);
    });
  }, []);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
    if (!introActive || !introVisible || !intro) return;
    // Restore the still image even if playback stalls before the clip ends.
    const timeout = window.setTimeout(stopIntro, (intro.play + 1) * 1000);
    return () => window.clearTimeout(timeout);
  }, [introActive, introVisible, intro, stopIntro]);

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
    if (!intro || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
    <main className={`music-room ${immersed ? "immersed" : ""} ${introShowing ? "intro-playing" : ""}`} style={roomStyle} data-piece={piece.id} data-ready={ready} onWheel={event => {
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
        {introActive && immersed && intro && <div className={`composition-intro ${introVisible ? "visible" : ""}`} style={introStyle}>
          <video key={piece.id} src={intro.src} preload="auto" muted playsInline disablePictureInPicture onLoadedMetadata={event => {
            const video = event.currentTarget;
            video.playbackRate = introSpeed;
            if (introStart >= video.duration) { stopIntro(); return; }
            if (introStart > 0) video.currentTime = introStart;
            else void video.play().catch(stopIntro);
          }} onSeeked={event => { void event.currentTarget.play().catch(stopIntro); }} onPlaying={() => {
            setIntroVisible(true);
            if (introStarted.current) return;
            introStarted.current = true;
            lastIntros.current[piece.id] = Date.now();
            try { window.localStorage.setItem(`${piece.id}-intro-last-played`, String(lastIntros.current[piece.id])); }
            catch { /* The in-memory timestamp still prevents repeats in this page session. */ }
          }} onTimeUpdate={event => {
            if (event.currentTarget.currentTime >= introEnd) stopIntro();
          }} onEnded={stopIntro} onError={stopIntro} />
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
          const item = pieces[((stripIndex % pieces.length) + pieces.length) % pieces.length];
          const position = ["before", "previous", "current", "next", "after"][slot];
          return <button key={stripIndex} className={`score-position ${position}`} inert={Math.abs(offset) > 1} aria-hidden={Math.abs(offset) > 1 ? true : undefined} aria-label={offset === 0 ? `Enter ${item.title}` : `Browse ${item.title}`} onClick={() => offset === 0 ? enter() : navigate(offset)}><ScoreArtwork piece={item} /><span className="artwork-caption">{offset === 0 ? "ENTER THE COMPOSITION" : item.title}<ArrowUpRight size={12} /></span></button>;
        })}
        <div className="composition-info" key={piece.id} aria-live="polite">
          <div className="piece-eyebrow"><span /> SELECTED WORK / {String(selected + 1).padStart(2, "0")}</div>
          <h1>{piece.lines.map(line => <span key={line}>{line}</span>)}</h1>
          <div className="piece-details"><p>{piece.year}, {piece.place}</p><p>{piece.ensemble}</p><p>{piece.duration}</p></div>
          <button className="enter-button" onClick={enter}>play <span><Play size={18} strokeWidth={1} /></span></button>
          <span className="enter-hint">A composition. A world of its own.</span>
        </div>
      </section>

      {immersed && <section className="immersive-content" aria-label={piece.world}>
        <button className="back-button" onClick={exit}><ArrowLeft size={16} /> back to the room</button>
        <div className="immersive-heading"><span className="piece-eyebrow">{piece.world}</span><h1>{piece.lines.map(line => <span key={line}>{line}</span>)}</h1><p>{piece.note}</p><div className="immersive-meta">{piece.ensemble} <span>·</span> {piece.duration}</div></div>
        {piece.audio && <audio key={piece.id} ref={audioElement} src={piece.audio} muted={muted} preload="none" onEnded={() => setPlaying(false)} />}
        <div className="sound-player"><button className="play-round" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><div><div className={`waveform ${playing && !muted ? "active" : ""}`}>{Array.from({ length: 42 }, (_, i) => <i key={i} style={{ height: `${5 + ((i * 17 + 7) % 25)}px`, animationDelay: `${i * -0.12}s` }} />)}</div><span>{piece.audio ? "RECORDING" : "AMBIENT PREVIEW · NOT THE ORIGINAL RECORDING"}</span></div><button className="mute-button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { if (muted && playing) void audio.current?.resume(); setMuted(!muted); }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button></div>
      </section>}

      {panel && <section className="info-panel" aria-labelledby="panel-title"><button className="close-panel" aria-label="Close information" onClick={() => setPanel(null)}><X size={22} /></button><span className="piece-eyebrow">ALEXANDER GOODHART</span><h2 id="panel-title">{panel}</h2>{panel === "about" ? <p>Music for voices, pianos, and the spaces in between. Explore selected compositions by Alexander Goodhart, each with a world of its own.</p> : panel === "learn" ? <><p>Move through the collection with your trackpad, the arrows below, or your keyboard. On a touch screen, swipe left or right.</p><p>Select a score or press play to step inside its world. Press Escape to return.</p></> : panel === "ideas" ? <p>What if a piece of music could become a place? These rooms explore that idea: a midnight sky, a candlelit chamber, and a living forest.</p> : <p>For performance and score inquiries, contact details will be added here. Original recordings and downloadable scores have not yet been provided.</p>}<button className="panel-return" onClick={() => setPanel(null)}>return to the music <ArrowRight size={16} /></button></section>}
      <div className="room-glass" />
      <aside className="glass-sidebar"><span className="sidebar-top">AG / MUSIC</span><nav aria-label="Main navigation">{["home", "about", "learn", "listen", "ideas", "contact"].map(item => <button key={item} className={(panel === item || (!panel && item === "listen")) ? "active" : ""} onClick={() => { if (item === "home") goHome(); else if (item === "listen") { exit(); setPanel(null); } else { setPanel(item); setPlaying(false); } }}>{item}</button>)}</nav><button className="monogram" aria-label="Alexander Goodhart home" onClick={goHome}><span>A</span><span>G</span></button><span className="sidebar-bottom">SOUND & SPACE</span></aside>
      <footer className="room-footer"><div className="browse-controls"><button onClick={() => navigate(-1)} aria-label="Previous composition"><ArrowLeft size={25} strokeWidth={1} /></button><span>scroll</span><button onClick={() => navigate(1)} aria-label="Next composition"><ArrowRight size={25} strokeWidth={1} /></button><span className="browse-count">{String(selected + 1).padStart(2, "0")}<span> / {total}</span></span></div><div className="pagination" aria-label="Choose composition">{pieces.map((item, i) => <button key={item.id} className={i === selected ? "selected" : ""} aria-label={`Select ${item.title}`} aria-current={i === selected ? "true" : undefined} onClick={() => { selectPiece(i); exit(); setPanel(null); }} />)}</div><span className="headphone-note"><Headphones size={13} strokeWidth={1.5} /> best experienced with headphones</span></footer>
    </main>
  );
}
