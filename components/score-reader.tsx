"use client";
// The 3D score reader from pirouette/PIROUETTE.html. React draws the frame and the readout; mountReader owns the canvases, side images and page-turn cards.
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import "./score-reader.css";

// ==== PDF.JS ==== the 3.11.174 build Pirouette uses, in public/pdfjs; loaded the first time a score opens
const PDFJS_SRC = "/pdfjs/pdf.min.js";
const PDFJS_WORKER = "/pdfjs/pdf.worker.min.js";

// ==== PAGE TURN ====
const TURN_MS = 450; // length of the slide
const TURN_EASING = "ease"; // any CSS easing
const SWIPE_PX = 52; // sideways drag that turns a page
const SWIPE_SPEED = 0.12; // px per ms; slower drags are ignored

// ==== RENDERING ====
const PAPER = "rgb(248, 246, 239)"; // shows until a page finishes drawing
const MAX_DENSITY = 2; // canvas pixels per CSS pixel
const MAX_PIXELS = 16_000_000; // per page
const PREFETCH_DEPTH = 6; // thumbnails warmed ahead
const PREVIEW_RADIUS = 4; // thumbnails kept either side of the page
const RESIZE_MS = 180; // settle time before a redraw

// ==== SIDE STACKS ==== mirrors score-reader.css so a flying card lands exactly on the real image
const NEXT_FILTER = "brightness(0.76) saturate(0.68)"; // .next-paper img
const HISTORY_LAYERS: Keyframe[] = [ // .history-images img:nth-child(n); the last is where the deepest page fades out
  { transform: "translate(0rem, 0rem)", filter: "brightness(0.42) saturate(0.55)", opacity: 1 },
  { transform: "translate(-0.55rem, 0.52rem)", filter: "brightness(0.35) saturate(0.5)", opacity: 1 },
  { transform: "translate(-1.1rem, 1.04rem)", filter: "brightness(0.28) saturate(0.45)", opacity: 1 },
  { transform: "translate(-1.65rem, 1.56rem)", filter: "brightness(0.21) saturate(0.4)", opacity: 0 },
];
const SIDE_SHADOW = "0 1rem 2rem #00000075"; // .history-images img, .next-paper img
const NO_SHADOW = "0 1rem 2rem #00000000"; // the centre page

type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel(): void };
type PdfPage = { getViewport(options: { scale: number }): PdfViewport; render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): PdfRenderTask; getTextContent(): Promise<{ items: { str?: string }[] }> };
type PdfDocument = { numPages: number; getPage(page: number): Promise<PdfPage> };
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy(): Promise<void>; onProgress?: (progress: { loaded: number; total: number }) => void };
type PdfJs = { getDocument(source: { url: string; isEvalSupported: boolean }): PdfLoadingTask; GlobalWorkerOptions: { workerSrc: string } };
type Preview = { url: string };
type Pending = { promise: Promise<Preview> };
type View = { page: number; total: number; prev: boolean; next: boolean; back: boolean; ahead: boolean; opening: boolean; percent: number; failed: string; status: string; text: string };
const blank: View = { page: 0, total: 0, prev: false, next: false, back: false, ahead: false, opening: true, percent: 0, failed: "", status: "", text: "" };

let pdfjs: Promise<PdfJs> | undefined;
const loadPdfjs = () => (pdfjs ??= new Promise<PdfJs>((resolve, reject) => {
  const script = document.createElement("script");
  const fail = () => { pdfjs = undefined; script.remove(); reject(new Error("The pdf.js worker script did not load.")); };
  script.src = PDFJS_SRC;
  script.onerror = fail;
  script.onload = () => {
    const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
    if (!lib) return fail();
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    resolve(lib);
  };
  document.head.appendChild(script);
}));

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const cancelled = (error: unknown) => { const e = error as { name?: string; message?: string } | null; return !!e && (e.name === "RenderingCancelledException" || /cancel/i.test(e.message ?? "")); };
const friendly = (error: unknown) => {
  const { name = "", message = "" } = (error ?? {}) as { name?: string; message?: string };
  if (name === "PasswordException" || /password/i.test(message)) return "This score is locked.";
  if (name === "InvalidPDFException" || /invalid pdf/i.test(message)) return "This file is not a readable PDF.";
  if (name === "MissingPDFException") return "The score could not be found.";
  if (name === "UnexpectedResponseException") return "The score could not be downloaded. Check the connection and try again.";
  if (/worker/i.test(message)) return "The score reader could not start. Check the connection and reload.";
  return "The score could not be opened.";
};

function mountReader(root: HTMLElement, src: string, emit: (view: View) => void, close: () => void) {
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const stage = q(".viewer-stage"), sheet = q(".center-sheet"), paper = q(".paper-surface");
  const historyStack = q(".history-stack"), historyImages = q(".history-images"), nextStack = q(".next-stack"), nextSlot = q(".next-paper");
  const [previousButton, nextButton] = Array.from(root.querySelectorAll<HTMLElement>(".tray-button"));
  let [front, back] = Array.from(root.querySelectorAll<HTMLCanvasElement>(".page-canvas")); // swapped on every turn
  let nextPreview = new Image();
  const turnLayer = document.createElement("div"); // cards fly here, on <body>, outside every transformed ancestor
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const turnAnimations = new Set<Animation>();
  const renders = new Set<PdfRenderTask>();
  const previews = new Map<number, Preview | Pending>();
  let turnHidden: HTMLElement[] = [];
  let pdf: PdfDocument | null = null, loadingTask: PdfLoadingTask | null = null;
  let current = 0, total = 0, reference = 0, previewBasis = 0, navigationId = 0, sideUpdateId = 0; // reference: the page the controls describe; runs ahead of current during a turn
  let activeTarget: number | null = null, pendingTarget: number | null = null;
  let dead = false, opening = true, transitioning = false, resizing = false, pendingResize = false;
  let percent = 0, failed = "", status = "", text = "", sizedFor = ""; // sizedFor: the sheet size the centre page was last drawn at
  let resizeTimer = 0, statusTimer = 0;
  let pointerStart: { x: number; y: number; time: number } | null = null;

  const show = () => {
    if (dead) return;
    const prev = !!pdf && !opening && reference > 1, next = !!pdf && !opening && reference < total;
    emit({ page: current, total, prev, next, back: prev && historyImages.childElementCount > 0, ahead: next && !nextPreview.hidden, opening, percent, failed, status, text });
  };
  const sync = (page = current) => { reference = page; show(); };
  const say = (message: string, ms: number) => { window.clearTimeout(statusTimer); status = message; show(); statusTimer = window.setTimeout(() => { status = ""; show(); }, ms); };
  const clearCanvas = (canvas: HTMLCanvasElement) => { canvas.width = canvas.height = 1; canvas.style.width = canvas.style.height = "1px"; };
  const track = (task: PdfRenderTask) => { renders.add(task); const done = task.promise.finally(() => renders.delete(task)); done.catch(() => {}); return done; };
  const previewWidth = () => clamp(Math.round(paper.clientWidth * 0.48), 260, 420);
  const settled = (page: number) => { const record = previews.get(page); return record && "url" in record ? record : null; };
  const prunePreviews = (radius?: number) => previews.forEach((record, page) => { // in-flight renders keep their entry so its URL is never revoked under them
    if ("promise" in record || (radius !== undefined && Math.abs(page - current) <= radius)) return;
    previews.delete(page);
    URL.revokeObjectURL(record.url);
  });
  const readText = async (page: number) => { // for screen readers; notation pages rarely carry any
    let found = "";
    try { found = (await (await pdf!.getPage(page)).getTextContent()).items.map(item => item.str ?? "").join(" ").replace(/\s+/g, " ").trim().slice(0, 3000); } catch { /* no text layer */ }
    if (dead || page !== current) return;
    text = found || "No extractable text is available for this notation page.";
    show();
  };

  const beginCanvasRender = async (pageNumber: number, canvas: HTMLCanvasElement) => { // resolves once the canvas is sized, so a landing spot is exact; `ready` once it is drawn
    const page = await pdf!.getPage(pageNumber);
    if (dead) throw new Error("cancelled");
    const natural = page.getViewport({ scale: 1 });
    sizedFor = `${paper.clientWidth}x${paper.clientHeight}`;
    const cssScale = Math.min(Math.max(1, paper.clientWidth - 8) / natural.width, Math.max(1, paper.clientHeight - 8) / natural.height);
    const cssWidth = Math.max(1, natural.width * cssScale), cssHeight = Math.max(1, natural.height * cssScale);
    let density = Math.min(window.devicePixelRatio || 1, MAX_DENSITY);
    const pixels = cssWidth * cssHeight * density * density;
    if (pixels > MAX_PIXELS) density *= Math.sqrt(MAX_PIXELS / pixels);
    const viewport = page.getViewport({ scale: cssScale * density });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const context = canvas.getContext("2d", { alpha: false })!;
    context.fillStyle = PAPER;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({ canvasContext: context, viewport });
    return { task, ready: track(task) };
  };

  const ensurePreview = (pageNumber: number): Promise<Preview> => {
    const score = pdf;
    if (!score || pageNumber < 1 || pageNumber > total) return Promise.reject(new Error("That page is outside this score."));
    const cached = previews.get(pageNumber);
    if (cached) return "promise" in cached ? cached.promise : Promise.resolve(cached);
    const pending: Pending = {
      promise: (async () => {
        const page = await score.getPage(pageNumber);
        if (dead) throw new Error("cancelled");
        const natural = page.getViewport({ scale: 1 });
        previewBasis = previewWidth();
        const viewport = page.getViewport({ scale: previewBasis / natural.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext("2d", { alpha: false })!;
        context.fillStyle = PAPER;
        context.fillRect(0, 0, canvas.width, canvas.height);
        await track(page.render({ canvasContext: context, viewport }));
        const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/jpeg", 0.94));
        if (!blob) throw new Error("The page preview could not be created.");
        if (dead) throw new Error("cancelled");
        const preview = { url: URL.createObjectURL(blob) };
        previews.set(pageNumber, preview);
        return preview;
      })().catch(error => { if (previews.get(pageNumber) === pending) previews.delete(pageNumber); throw error; }),
    };
    previews.set(pageNumber, pending);
    return pending.promise;
  };
  const warm = (pageNumber: number) => { ensurePreview(pageNumber).catch(() => {}); };

  const decodedImage = async (url: string) => {
    const image = new Image();
    image.decoding = "async";
    image.alt = "";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The page preview image could not be displayed.")); image.src = url; });
    await Promise.race([image.decode().catch(() => {}), new Promise(resolve => window.setTimeout(resolve, 150))]); // decode() never settles in a hidden tab
    return image;
  };

  const updateSidePreviews = async () => {
    if (!pdf) return;
    const updateId = ++sideUpdateId;
    const stale = () => dead || updateId !== sideUpdateId;
    const previousNumbers = [1, 2, 3].map(offset => current - offset).filter(page => page >= 1);
    if (nextPreview.hidden && current < total) nextStack.classList.add("is-preparing");
    try { // the old stacks stay on screen until the new images are decoded, then swap in one frame
      const upcoming = current < total ? await ensurePreview(current + 1) : null;
      const previous = await Promise.all(previousNumbers.map(ensurePreview));
      if (stale()) return;
      const newNext = upcoming ? await decodedImage(upcoming.url) : new Image();
      const newHistory = await Promise.all(previous.map(preview => decodedImage(preview.url)));
      if (stale()) return;
      newNext.hidden = !upcoming;
      nextPreview.replaceWith(newNext);
      nextPreview = newNext;
      historyImages.replaceChildren(...newHistory);
      warm(current); // what the next turn in either direction will need
      if (current - 4 >= 1) warm(current - 4);
      for (let ahead = 2; ahead <= PREFETCH_DEPTH && current + ahead <= total; ahead++) warm(current + ahead);
    } catch (error) {
      if (!cancelled(error) && !dead) say("A side preview could not be prepared; page navigation still works.", 5200);
    } finally {
      if (!stale()) { nextStack.classList.remove("is-preparing"); prunePreviews(PREVIEW_RADIUS); sync(); }
    }
  };

  const layoutBox = (element: HTMLElement) => { // untransformed border box, in page coordinates
    let left = 0, top = 0;
    for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) {
      const parent = node.offsetParent as HTMLElement | null;
      left += node.offsetLeft + (parent ? parent.clientLeft : 0);
      top += node.offsetTop + (parent ? parent.clientTop : 0);
    }
    const style = getComputedStyle(element); // fractional size; offset* are whole pixels
    return { left, top, width: parseFloat(style.width) || element.offsetWidth, height: parseFloat(style.height) || element.offsetHeight };
  };
  const screenMatrix = (element: HTMLElement) => { // the full CSS 3D chain (transforms, perspective, flattening) from layout coordinates to the screen
    let matrix = new DOMMatrix();
    for (let node = element, parent = node.parentElement; parent; node = parent, parent = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.transform !== "none") {
        const box = layoutBox(node);
        const [x, y, z = 0] = style.transformOrigin.split(" ").map(parseFloat);
        matrix = new DOMMatrix().translate(box.left + x, box.top + y, z).multiply(new DOMMatrix(style.transform)).translate(-box.left - x, -box.top - y, -z).multiply(matrix);
      }
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.perspective !== "none") {
        const parentBox = layoutBox(parent);
        const [x, y] = parentStyle.perspectiveOrigin.split(" ").map(parseFloat);
        const perspective = new DOMMatrix();
        perspective.m34 = -1 / parseFloat(parentStyle.perspective);
        matrix = new DOMMatrix().translate(parentBox.left + x, parentBox.top + y).multiply(perspective).translate(-parentBox.left - x, -parentBox.top - y).multiply(matrix);
      }
      if (parentStyle.transformStyle !== "preserve-3d") { matrix.m13 = 0; matrix.m23 = 0; matrix.m43 = 0; matrix.m31 = 0; matrix.m32 = 0; matrix.m34 = 0; matrix.m33 = 1; }
    }
    return matrix;
  };
  const framePose = (element: HTMLElement): Keyframe => { // position and transform that put a fixed card exactly where `element` renders
    const box = layoutBox(element);
    let screen = screenMatrix(element);
    let predictedLeft = Infinity, predictedTop = Infinity;
    for (const [x, y] of [[0, 0], [box.width, 0], [0, box.height], [box.width, box.height]]) {
      const point = screen.transformPoint(new DOMPoint(box.left + x, box.top + y, 0, 1));
      predictedLeft = Math.min(predictedLeft, point.x / point.w);
      predictedTop = Math.min(predictedTop, point.y / point.w);
    }
    const actual = element.getBoundingClientRect(); // nudge by the measured sub-pixel error, and by any page scroll
    screen = new DOMMatrix().translate(actual.left - predictedLeft, actual.top - predictedTop).multiply(screen);
    const matrix = new DOMMatrix().translate(-box.left, -box.top).multiply(screen).translate(box.left, box.top);
    return { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, transform: matrix.toString() };
  };
  const sidePose = (element: HTMLElement, filter: string, opacity = 1): Keyframe => ({ ...framePose(element), boxShadow: SIDE_SHADOW, filter, opacity });
  const centerPose = (canvas: HTMLElement): Keyframe => ({ ...framePose(canvas), boxShadow: NO_SHADOW, filter: "brightness(1) saturate(1)", opacity: 1 });
  const canvasCopy = (source: CanvasImageSource, width: number, height: number) => {
    const copy = document.createElement("canvas");
    copy.width = width;
    copy.height = height;
    copy.getContext("2d")!.drawImage(source, 0, 0, width, height);
    return copy;
  };

  const animateTurn = (element: HTMLElement, from: Keyframe, to: Keyframe) => {
    const animation = element.animate([from, to], { duration: TURN_MS, easing: TURN_EASING, fill: "forwards" });
    turnAnimations.add(animation);
    return animation.finished.catch(() => {}).finally(() => turnAnimations.delete(animation));
  };
  const flyCard = (card: HTMLElement, from: Keyframe, to: Keyframe) => {
    card.hidden = false;
    card.className = "turn-card";
    card.style.cssText = "";
    turnLayer.appendChild(card);
    return animateTurn(card, from, to);
  };
  const hideForTurn = (element: HTMLElement) => { element.style.visibility = "hidden"; turnHidden.push(element); };
  const endTurnMotion = () => {
    turnAnimations.forEach(animation => { try { animation.cancel(); } catch { /* already settled */ } });
    turnAnimations.clear();
    turnLayer.replaceChildren();
    for (const element of turnHidden) element.style.visibility = "";
    turnHidden = [];
  };

  // Everything moves at once: incoming side → centre, centre → other side, stacks shift one slot. Cards end on the pose the rebuilt stacks will have, so the hand-off is invisible.
  const startTurnMotion = (targetPage: number) => {
    const forward = targetPage === current + 1;
    if (reducedMotion.matches || (!forward && targetPage !== current - 1)) return null;
    const layers = Array.from(historyImages.children) as HTMLImageElement[];
    const incoming = forward ? nextPreview : layers[0];
    if (!incoming || incoming.hidden || !incoming.naturalWidth || front.width < 2 || !historyStack.getBoundingClientRect().width || !nextSlot.getBoundingClientRect().width) return null;
    const bounds = root.getBoundingClientRect(), page = document.documentElement;
    turnLayer.style.clipPath = `inset(${bounds.top}px ${page.clientWidth - bounds.right}px ${page.clientHeight - bounds.bottom}px ${bounds.left}px)`; // cards stay inside the reader, like its pages
    const flights: Promise<void>[] = [];
    const lowerCards: [HTMLElement, Keyframe, Keyframe][] = [];

    if (forward) {
      layers.forEach((layer, index) => flights.push(animateTurn(layer, HISTORY_LAYERS[index], HISTORY_LAYERS[index + 1]))); // each read page steps one slot deeper; the deepest fades out
      const afterNext = settled(targetPage + 1);
      if (afterNext) {
        const arriving = new Image();
        arriving.src = afterNext.url;
        lowerCards.push([arriving, sidePose(nextSlot, NEXT_FILTER, 0), sidePose(nextSlot, NEXT_FILTER, 1)]);
      }
    } else {
      layers.slice(1).forEach((layer, index) => flights.push(animateTurn(layer, HISTORY_LAYERS[index + 1], HISTORY_LAYERS[index])));
      const deepest = settled(targetPage - 3);
      if (deepest) {
        const rising = new Image();
        rising.src = deepest.url;
        rising.alt = "";
        rising.style.zIndex = "2";
        historyImages.appendChild(rising);
        flights.push(animateTurn(rising, HISTORY_LAYERS[3], HISTORY_LAYERS[2]));
      }
      if (!nextPreview.hidden && nextPreview.naturalWidth) {
        lowerCards.push([nextPreview.cloneNode(false) as HTMLElement, sidePose(nextSlot, NEXT_FILTER, 1), sidePose(nextSlot, NEXT_FILTER, 0)]);
        hideForTurn(nextPreview);
      }
    }
    for (const [card, from, to] of lowerCards) flights.push(flyCard(card, from, to));

    flights.push(flyCard(canvasCopy(front, front.width, front.height), centerPose(front), forward ? sidePose(historyImages, HISTORY_LAYERS[0].filter as string) : sidePose(nextSlot, NEXT_FILTER)));
    const incomingCard = canvasCopy(incoming, incoming.naturalWidth, incoming.naturalHeight);
    flights.push(flyCard(incomingCard, forward ? sidePose(incoming, NEXT_FILTER) : sidePose(incoming, HISTORY_LAYERS[0].filter as string), centerPose(back)));
    hideForTurn(incoming);
    hideForTurn(front);

    return {
      finished: Promise.all(flights),
      sharpen: (canvas: HTMLCanvasElement) => { // swap the thumbnail for the full render so the landing is pixel-identical
        incomingCard.width = canvas.width;
        incomingCard.height = canvas.height;
        incomingCard.getContext("2d")!.drawImage(canvas, 0, 0);
      },
    };
  };

  const swapCanvases = () => {
    front.classList.remove("is-visible");
    back.classList.add("is-visible");
    [front, back] = [back, front];
  };
  const runQueued = () => {
    const queued = pendingTarget;
    pendingTarget = null;
    if (queued && queued !== current) void performTransition(queued);
    else if (pendingResize) { pendingResize = false; void rerenderCurrentPage(); }
  };

  const performTransition = async (targetPage: number) => {
    if (!pdf || transitioning || resizing || targetPage === current) return;
    transitioning = true;
    activeTarget = targetPage;
    sideUpdateId += 1;
    const navigation = ++navigationId;
    const stale = () => dead || navigation !== navigationId;
    sync(targetPage);
    let render: Awaited<ReturnType<typeof beginCanvasRender>> | null = null;
    try {
      render = await beginCanvasRender(targetPage, back);
      if (stale()) return;
      const motion = startTurnMotion(targetPage);
      await render.ready;
      if (stale()) return;
      if (motion) {
        motion.sharpen(back);
        await motion.finished;
        if (stale()) return;
      }
      swapCanvases();
      current = targetPage;
      text = "";
      sync();
      void readText(current);
      await updateSidePreviews(); // cards stay on top until the real stacks are rebuilt beneath them
    } catch (error) {
      try { render?.task.cancel(); } catch { /* the centre render already settled */ }
      if (!cancelled(error) && !dead) say(`Page ${targetPage} could not be rendered. Try that page again.`, 6200);
    } finally {
      if (!stale()) {
        endTurnMotion();
        transitioning = false;
        activeTarget = null;
        sync(pendingTarget ?? current);
        runQueued();
      }
    }
  };

  const requestPage = (pageNumber: number) => {
    if (!pdf || opening) return;
    const target = clamp(Math.round(pageNumber), 1, total);
    if (transitioning || resizing) { pendingTarget = target; sync(target); warm(target); return; } // queued; its thumbnail warms while the current turn plays
    if (target !== current) void performTransition(target);
  };
  const stepPage = (direction: number) => requestPage((pendingTarget ?? activeTarget ?? current) + direction);
  const flash = (button: HTMLElement) => {
    button.style.filter = "brightness(12.5)";
    button.style.transform = "scale(.6)";
    window.setTimeout(() => { button.style.filter = ""; button.style.transform = ""; }, 300);
  };
  const step = (direction: number, flashTray = false) => { if (flashTray) flash(direction < 0 ? previousButton : nextButton); stepPage(direction); };

  const rerenderCurrentPage = async () => {
    if (!pdf || opening || transitioning || resizing || !current) { if (opening || transitioning || resizing) pendingResize = true; return; }
    if (sizedFor === `${paper.clientWidth}x${paper.clientHeight}`) return;
    resizing = true;
    try {
      const render = await beginCanvasRender(current, back);
      await render.ready;
      if (dead || transitioning) return;
      swapCanvases();
      if (previewBasis && previewWidth() !== previewBasis) { prunePreviews(); previewBasis = 0; void updateSidePreviews(); } // thumbnails were drawn for the old sheet width
    } catch (error) {
      if (!cancelled(error) && !dead) say("The page could not be resized cleanly.", 4200);
    } finally {
      if (!dead) { resizing = false; sync(pendingTarget ?? current); runQueued(); }
    }
  };

  const open = async () => {
    try {
      const lib = await loadPdfjs();
      if (dead) return;
      loadingTask = lib.getDocument({ url: src, isEvalSupported: false });
      loadingTask.onProgress = progress => { if (progress.total) { percent = Math.min(99, Math.round((progress.loaded / progress.total) * 100)); show(); } };
      const loaded = await loadingTask.promise;
      if (dead) return;
      if (!loaded.numPages) throw new Error("This PDF has no pages.");
      pdf = loaded;
      total = loaded.numPages;
      current = 1;
      sync();
      await (await beginCanvasRender(current, front)).ready;
      if (dead) return;
      opening = false;
      sync();
      void readText(current);
      void updateSidePreviews();
      sheet.focus({ preventScroll: true });
      if (pendingResize) { pendingResize = false; void rerenderCurrentPage(); }
    } catch (error) {
      if (dead) return;
      pdf = null;
      opening = false;
      failed = friendly(error);
      sync();
    }
  };

  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (event.key === "Escape") return close();
    if (!pdf || (event.key === " " && target?.closest("button, a, label"))) return; // space on a button presses the button
    const forward = event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey);
    const backward = event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey);
    if (!forward && !backward && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (forward) step(1, true);
    else if (backward) step(-1, true);
    else requestPage(event.key === "Home" ? 1 : total);
  };
  const onPointerDown = (event: PointerEvent) => { if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() }; };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointerStart) return;
    const deltaX = event.clientX - pointerStart.x, deltaY = event.clientY - pointerStart.y;
    const speed = Math.abs(deltaX) / Math.max(1, performance.now() - pointerStart.time);
    pointerStart = null;
    if (Math.abs(deltaX) < SWIPE_PX || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2 || speed < SWIPE_SPEED) return;
    stepPage(deltaX < 0 ? 1 : -1);
  };
  const onPointerCancel = () => { pointerStart = null; };
  const resizeObserver = new ResizeObserver(() => { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => void rerenderCurrentPage(), RESIZE_MS); });

  turnLayer.className = "turn-layer";
  turnLayer.setAttribute("aria-hidden", "true");
  document.body.appendChild(turnLayer);
  nextPreview.hidden = true;
  nextSlot.replaceChildren(nextPreview);
  historyImages.replaceChildren();
  clearCanvas(front);
  clearCanvas(back);
  front.classList.add("is-visible");
  back.classList.remove("is-visible");
  document.addEventListener("keydown", onKey);
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerCancel);
  resizeObserver.observe(sheet);
  sync();
  void open();

  return {
    step,
    destroy() {
      dead = true;
      window.clearTimeout(resizeTimer);
      window.clearTimeout(statusTimer);
      resizeObserver.disconnect();
      document.removeEventListener("keydown", onKey);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerCancel);
      renders.forEach(task => { try { task.cancel(); } catch { /* already drawn */ } });
      endTurnMotion();
      turnLayer.remove();
      previews.forEach(record => void Promise.resolve("promise" in record ? record.promise : record).then(preview => URL.revokeObjectURL(preview.url), () => {}));
      void loadingTask?.destroy().catch(() => {});
    },
  };
}

export function ScoreReader({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  const reader = useRef<ReturnType<typeof mountReader> | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [view, setView] = useState(blank);
  const caption = useId();
  useEffect(() => {
    const mounted = mountReader(root.current!, src, setView, () => close.current());
    reader.current = mounted;
    return () => { reader.current = null; mounted.destroy(); };
  }, [src]);
  const where = view.total ? `Page ${view.page} of ${view.total}, ${title}.` : "";

  return (
    <section ref={root} className="score-reader" aria-label={`Score of ${title}`} aria-busy={view.opening}>
      <button className="back-button" onClick={onClose}><ArrowLeft size={16} /> close the score</button>
      <div className="viewer-stage">
        <button className="side-stack history-stack" disabled={!view.back} aria-label={view.back ? `Show previous page, page ${view.page - 1}` : "No previous page"} onClick={() => reader.current?.step(-1)}>
          <span className="history-images" aria-hidden="true" />
          <span className="side-caption previous-caption">Previous</span>
        </button>
        <figure className={`center-sheet ${view.page > 1 ? "begin" : ""}`} tabIndex={-1} aria-labelledby={caption}>
          <div className="paper-surface">
            <canvas className="page-canvas is-visible" />
            <canvas className="page-canvas" />
            {(view.opening || view.failed) && <div className="page-loading" role="status">
              {!view.failed && <span className="loading-clef" aria-hidden="true">𝄞</span>}
              <span>{view.failed || `Opening ${title}${view.percent ? ` — ${view.percent}%` : "…"}`}</span>
            </div>}
          </div>
          <figcaption id={caption} className="visually-hidden">{where || "No score is open."}</figcaption>
          <div className="visually-hidden">{view.text}</div>
        </figure>
        <button className="side-stack next-stack" disabled={!view.ahead} aria-label={view.ahead ? `Show next page, page ${view.page + 1}` : "No next page"} onClick={() => reader.current?.step(1)}>
          <span className="next-paper" aria-hidden="true" />
          <span className="side-caption">Next</span>
        </button>
        <nav className="page-tray" aria-label="Page navigation">
          <button className="tray-button" aria-label="Previous page" disabled={!view.prev} onClick={() => reader.current?.step(-1, true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg></button>
          <div className="document-label"><strong>{title}</strong><span>Page {view.page} of {view.total}</span></div>
          <button className="tray-button" aria-label="Next page" disabled={!view.next} onClick={() => reader.current?.step(1, true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg></button>
        </nav>
      </div>
      <output className="viewer-status">{view.status}</output>
      <div className="visually-hidden" aria-live="polite">{where}</div>
    </section>
  );
}
