// Generic "rub/scratch to reveal" mini-game: a blurred snapshot of an
// image, printed over with a label, sits on a canvas layered on top of the
// real, sharp <img>. Dragging a finger or the mouse erases the snapshot
// like a scratch ticket; once enough of it is gone the rest fades away on
// its own so the player always ends up seeing the full image. Wrapped as a
// factory - createRubReveal(frame, opts) - so any image-pair on any
// storybook page can use it, not just this one.
//
// Optional `locked: true` starts the snapshot blurred but with no printed
// label and no scratch interaction - useful for gating a reveal behind
// some other piece of page state (see `revealLocked` in data.js). Returns
// a handle with `unlock()` to permanently lift that gate: scratching turns
// on and the label is painted in.
function createRubReveal(frame, { src, label = "Scratch Off to Reveal", threshold = 0.9, locked: initiallyLocked = false } = {}) {
  const BRUSH_MIN = 20; // css px
  const BRUSH_FRACTION = 0.06; // of min(frame width, height)
  const BLUR_DOWNSCALE = 42; // bigger = blurrier
  const ALPHA_GONE = 40; // a mask cell below this alpha counts as "erased"
  const MASK_SIZE = 48; // coverage-check resolution - cheap to read every frame
  const FADE_MS = 500;

  const canvas = document.createElement("canvas");
  canvas.className = "reveal-canvas";
  frame.appendChild(canvas);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // A tiny, low-res mirror of every stroke, used only to answer "how much
  // is erased?" cheaply - reading pixels back from the big visible canvas
  // on every pointermove would be far more expensive for the same answer.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = MASK_SIZE;
  maskCanvas.height = MASK_SIZE;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

  let cw = 0, ch = 0;
  let drawing = false;
  let lastPoint = null;
  let coverageQueued = false;
  let finished = false;
  let locked = initiallyLocked;

  function brushRadius() {
    return Math.max(BRUSH_MIN, Math.min(cw, ch) * BRUSH_FRACTION);
  }

  function layoutAndPaint(img) {
    cw = frame.clientWidth;
    ch = frame.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Mirror object-fit: cover (center-anchored) so the blurred snapshot
    // lines up exactly with the sharp <img> underneath as it's scratched
    // away - see the media-frame .media rule in styles.css.
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    ctx.clearRect(0, 0, cw, ch);

    // Canvas2D's `filter` property (e.g. ctx.filter = "blur(22px)") isn't
    // reliably supported on every engine - notably, some WebKit/iPadOS
    // versions silently ignore it, leaving the snapshot sharp instead of
    // blurred. Drawing small and scaling back up only needs drawImage +
    // smoothing, so the blur looks the same everywhere.
    const smallW = Math.max(4, Math.round(cw / BLUR_DOWNSCALE));
    const smallH = Math.max(4, Math.round(ch / BLUR_DOWNSCALE));
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = smallW;
    smallCanvas.height = smallH;
    const smallCtx = smallCanvas.getContext("2d");
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.imageSmoothingQuality = "high";
    smallCtx.drawImage(img, drawX * (smallW / cw), drawY * (smallH / ch), drawW * (smallW / cw), drawH * (smallH / ch));

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(smallCanvas, 0, 0, smallW, smallH, 0, 0, cw, ch);

    if (!locked) {
      let fontSize = Math.max(16, Math.min(30, Math.round(Math.min(cw, ch) * 0.09)));
      ctx.font = `800 ${fontSize}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      while (fontSize > 12 && ctx.measureText(label).width > cw * 0.88) {
        fontSize -= 1;
        ctx.font = `800 ${fontSize}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(3, fontSize * 0.18);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.strokeText(label, cw / 2, ch / 2);
      ctx.fillStyle = "#000";
      ctx.fillText(label, cw / 2, ch / 2);
    }

    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.fillStyle = "#000";
    maskCtx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
  }

  // canvas.getBoundingClientRect() reflects the real, on-screen rendered
  // size, but the canvas's own drawing coordinate space (and cw/ch below)
  // is always in fixed design pixels - the whole book now scales
  // uniformly (see fitStage() in app.js), so dividing out that scale
  // factor here keeps the brush exactly under the pointer at any zoom.
  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / cw;
    const scaleY = rect.height / ch;
    return { x: (e.clientX - rect.left) / scaleX, y: (e.clientY - rect.top) / scaleY };
  }

  function eraseAt(x, y, r) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    maskCtx.save();
    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.beginPath();
    maskCtx.arc((x / cw) * MASK_SIZE, (y / ch) * MASK_SIZE, (r / Math.min(cw, ch)) * MASK_SIZE, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();
  }

  function eraseStroke(from, to, r) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      eraseAt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, r);
    }
  }

  function queueCoverageCheck() {
    if (coverageQueued || finished) return;
    coverageQueued = true;
    requestAnimationFrame(() => {
      coverageQueued = false;
      checkCoverage();
    });
  }

  function checkCoverage() {
    const { data } = maskCtx.getImageData(0, 0, MASK_SIZE, MASK_SIZE);
    let erased = 0;
    const total = MASK_SIZE * MASK_SIZE;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < ALPHA_GONE) erased++;
    }
    if (erased / total >= threshold) finishReveal();
  }

  function finishReveal() {
    finished = true;
    canvas.style.pointerEvents = "none";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.remove();
      return;
    }
    canvas.style.transition = `opacity ${FADE_MS}ms ease`;
    canvas.style.opacity = "0";
    setTimeout(() => canvas.remove(), FADE_MS + 40);
  }

  function onPointerDown(e) {
    if (finished || locked) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    drawing = true;
    lastPoint = pointFromEvent(e);
    eraseAt(lastPoint.x, lastPoint.y, brushRadius());
    queueCoverageCheck();
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!drawing) return;
    const point = pointFromEvent(e);
    eraseStroke(lastPoint, point, brushRadius());
    lastPoint = point;
    queueCoverageCheck();
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e) {
    drawing = false;
    lastPoint = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  // Stop the legacy touch events the page-swipe handler on #track listens
  // for - otherwise a finger scratching this canvas would also turn the page.
  canvas.addEventListener("touchstart", (e) => e.stopPropagation());
  canvas.addEventListener("touchmove", (e) => e.stopPropagation());

  const snapshotImage = new Image();
  snapshotImage.addEventListener("load", () => layoutAndPaint(snapshotImage));
  snapshotImage.src = src;

  return {
    unlock() {
      if (!locked) return;
      locked = false;
      if (snapshotImage.complete) layoutAndPaint(snapshotImage);
    },
  };
}

// "Drag to reveal" mini-game: a fully desaturated clone of the image sits
// over the real, full-color one (frame's own <img>) and is wiped away by a
// vertical handle the reader drags left-to-right - same idea as the
// rub-reveal above, but a single continuous drag instead of free-form
// scratching. The desaturated layer is visible the moment this is called
// (so a frame can start "loaded already grayscale"), independent of
// whether the handle itself is shown - the caller controls the handle's
// visibility/lifecycle separately (see `miniGameEl` in
// buildSequentialZones), since it's typically gated to one beat while the
// desaturation itself isn't. `onComplete` fires once, the first time the
// reader drags far enough (`threshold`, 0-1, default 0.96).
function createSaturationReveal(frame, { src, threshold = 0.96, onComplete } = {}) {
  const grayImg = document.createElement("img");
  grayImg.className = "sat-reveal__gray";
  grayImg.src = src;
  grayImg.alt = "";
  grayImg.draggable = false;
  frame.appendChild(grayImg);

  const handle = document.createElement("div");
  handle.className = "sat-reveal__handle";
  handle.style.display = "none";
  const bar = document.createElement("div");
  bar.className = "sat-reveal__bar";
  const grip = document.createElement("div");
  grip.className = "sat-reveal__grip";
  grip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6 3 12l5 6M16 6l5 6-5 6" /></svg>';
  handle.appendChild(bar);
  handle.appendChild(grip);
  frame.appendChild(handle);

  let position = 0; // 0 (fully gray) .. 1 (fully revealed)
  let completed = false;
  let dragging = false;

  function applyPosition() {
    handle.style.left = `${position * 100}%`;
    grayImg.style.clipPath = `inset(0 0 0 ${position * 100}%)`;
  }
  applyPosition();

  function setPosition(frac) {
    if (completed) return;
    position = Math.max(0, Math.min(1, frac));
    if (position >= threshold) {
      position = 1;
      completed = true;
    }
    applyPosition();
    if (completed) {
      handle.style.display = "none";
      onComplete();
    }
  }

  function pointFromEvent(e) {
    const rect = frame.getBoundingClientRect();
    return (e.clientX - rect.left) / rect.width;
  }

  function onPointerDown(e) {
    if (completed) return;
    dragging = true;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {}
    setPosition(pointFromEvent(e));
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    setPosition(pointFromEvent(e));
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e) {
    dragging = false;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
  }

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerUp);
  // Same reasoning as the rub-reveal canvas above - keep a horizontal drag
  // here from also being read as a page-swipe.
  handle.addEventListener("touchstart", (e) => e.stopPropagation());
  handle.addEventListener("touchmove", (e) => e.stopPropagation());

  return handle;
}
