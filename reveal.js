// Generic "rub/scratch to reveal" mini-game: a blurred snapshot of an
// image, printed over with a label, sits on a canvas layered on top of the
// real, sharp <img>. Dragging a finger or the mouse erases the snapshot
// like a scratch ticket; once enough of it is gone the rest fades away on
// its own so the player always ends up seeing the full image. Wrapped as a
// factory - createRubReveal(frame, opts) - so any image-pair on any
// storybook page can use it, not just this one.
function createRubReveal(frame, { src, label = "Scratch Off to Reveal", threshold = 0.9 } = {}) {
  const BRUSH_MIN = 20; // css px
  const BRUSH_FRACTION = 0.06; // of min(frame width, height)
  const BLUR_PX = 22;
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
    ctx.filter = `blur(${BLUR_PX}px)`;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.filter = "none";

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

    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.fillStyle = "#000";
    maskCtx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    if (finished) return;
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
}
