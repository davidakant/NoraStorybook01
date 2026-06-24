(function () {
  const rail = document.createElement("div");
  rail.className = "pages-rail";

  const track = document.getElementById("track");
  const storyTitle = document.getElementById("storyTitle");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const indicator = document.getElementById("pageIndicator");

  const TOTAL = STORY.length;
  let current = 0;
  let dragOffset = 0;
  let dragging = false;
  let motionCount = 0;

  function renderCaption(text) {
    return text
      .split(/\n\s*\n/)
      .map((para) => `<p>${para}</p>`)
      .join("");
  }

  function buildFrame(img, pageNum, rowNum, slot, eager) {
    const frame = document.createElement("div");
    frame.className = "media-frame";
    frame.dataset.page = String(pageNum);
    frame.dataset.row = String(rowNum);
    frame.dataset.slot = slot;

    if (img && img.src) {
      const image = document.createElement("img");
      image.className = "media";
      image.src = img.src;
      image.alt = img.alt || "";
      image.loading = eager ? "eager" : "lazy";
      image.decoding = "async";
      image.draggable = false;
      if (img.objectPosition) image.style.objectPosition = img.objectPosition;
      if (img.pan || img.zoom) {
        // Stagger duration and starting phase so multiple pans/zooms on
        // screen at once don't move in lockstep.
        image.style.animationDuration = `${14 + (motionCount % 5) * 2}s`;
        image.style.animationDelay = `${-(motionCount % 5) * 3}s`;
        motionCount++;
      }
      if (img.pan) {
        image.dataset.pan = img.pan;
        if (img.panScale) image.style.setProperty("--pan-scale", img.panScale);
      }
      if (img.zoom) {
        image.dataset.zoom = img.zoom;
        if (img.zoomScale) image.style.setProperty("--zoom-scale", img.zoomScale);
      }
      frame.appendChild(image);
    } else {
      frame.classList.add("media-frame--empty");
      const label = document.createElement("span");
      label.className = "media-frame__placeholder";
      label.textContent = "Image coming soon";
      frame.appendChild(label);
    }

    return frame;
  }

  function buildRow(rowData, pageNum, rowNum, eager) {
    const row = document.createElement("div");
    const images = rowData.images;
    const isSplit = images.length === 2;
    row.className = `row ${isSplit ? "row--split" : "row--single"}`;

    images.forEach((img, i) => {
      const slot = isSplit ? (i === 0 ? "a" : "b") : "single";
      const panel = document.createElement("div");
      panel.className = "panel";

      panel.appendChild(buildFrame(img, pageNum, rowNum, slot, eager));

      if (img.caption) {
        const caption = document.createElement("div");
        caption.className = "panel-caption";
        const captionInner = document.createElement("div");
        captionInner.className = "panel-caption-inner";
        captionInner.innerHTML = renderCaption(img.caption);
        caption.appendChild(captionInner);
        panel.appendChild(caption);
      } else {
        panel.classList.add("panel--no-caption");
      }

      row.appendChild(panel);
    });

    return row;
  }

  function buildPage(pageData, pageIndex) {
    const page = document.createElement("section");
    page.className = "page";
    page.setAttribute("aria-label", `Page ${pageData.page}: ${pageData.title}`);

    const rows = document.createElement("div");
    rows.className = "page-rows";

    pageData.rows.forEach((rowData, i) => {
      rows.appendChild(buildRow(rowData, pageData.page, i + 1, pageIndex === 0));
    });

    page.appendChild(rows);
    return page;
  }

  function buildIndicator() {
    indicator.innerHTML = "";
    STORY.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to page ${i + 1}`);
      dot.addEventListener("click", () => goTo(i));
      indicator.appendChild(dot);
    });
  }

  function updateIndicator() {
    [...indicator.children].forEach((dot, i) => {
      dot.classList.toggle("active", i === current);
    });
  }

  function updateChrome() {
    const data = STORY[current];
    storyTitle.textContent = `Page ${data.page} of ${TOTAL} · ${data.title}`;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === TOTAL - 1;
    updateIndicator();
  }

  function setTransform(animated) {
    rail.style.transition = animated ? "" : "none";
    rail.style.transform = `translateX(calc(${-current * 100}% + ${dragOffset}px))`;
  }

  function goTo(index) {
    if (index < 0 || index >= TOTAL || index === current) return;
    current = index;
    setTransform(true);
    updateChrome();
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });

  // Horizontal swipe to change page; vertical drag inside a page is left
  // to native scrolling so long captions remain readable.
  let startX = 0;
  let startY = 0;
  let horizontalIntent = null;

  track.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      horizontalIntent = null;
      dragging = false;
    },
    { passive: true }
  );

  track.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (horizontalIntent === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        horizontalIntent = Math.abs(dx) > Math.abs(dy);
      }
      if (!horizontalIntent) return;

      e.preventDefault();
      dragging = true;
      const atStart = current === 0 && dx > 0;
      const atEnd = current === TOTAL - 1 && dx < 0;
      dragOffset = atStart || atEnd ? dx * 0.35 : dx;
      setTransform(false);
    },
    { passive: false }
  );

  track.addEventListener("touchend", () => {
    if (!dragging) {
      horizontalIntent = null;
      return;
    }
    const width = track.clientWidth || 1;
    const threshold = width * 0.18;
    if (dragOffset <= -threshold) {
      dragOffset = 0;
      next();
    } else if (dragOffset >= threshold) {
      dragOffset = 0;
      prev();
    } else {
      dragOffset = 0;
      setTransform(true);
    }
    dragging = false;
    horizontalIntent = null;
  });

  // Every image is interactive: pan with mouse drag or a finger, zoom with
  // the scroll wheel or a two-finger pinch. Movement is clamped so the
  // image can never reveal anything beyond its own cropped edges. Releasing
  // hands control back to the default looping pan/zoom animation (or to the
  // static rest position, for images with neither), easing back to wherever
  // that animation was paused so the handoff is seamless (the animation
  // never actually stops - it's just hidden behind an !important inline
  // transform while the user drives it).
  function makePanZoomInteractive(frame) {
    const img = frame.querySelector(".media");
    if (!img) return;

    const MIN_SCALE = 1;
    const MAX_SCALE = 4;
    const pointers = new Map();

    // Corner-anchored zoom images scale from a corner, not the center, so
    // the safe pan range is asymmetric: the two edges touching the anchor
    // have zero slack (it's already flush with the frame, see styles.css)
    // while the opposite edges carry the full overflow. Pan/static images
    // use the default center origin, where the range is symmetric.
    const ORIGIN_BY_ZOOM = {
      "top-left": [0, 0],
      "top-right": [1, 0],
      "bottom-left": [0, 1],
      "bottom-right": [1, 1],
      center: [0.5, 0.5],
    };
    const [originX, originY] = ORIGIN_BY_ZOOM[img.dataset.zoom] || [0.5, 0.5];

    let active = false;
    let scale = 1, tx = 0, ty = 0;
    let grabScale = 1, grabTx = 0, grabTy = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let lastMid = null;
    let settleTimer = null;
    let wheelEndTimer = null;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    function clampPosition() {
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const leftEdge = originX * fw * (1 - scale);
      const topEdge = originY * fh * (1 - scale);
      const rightEdge = leftEdge + fw * scale;
      const bottomEdge = topEdge + fh * scale;
      tx = clamp(tx, fw - rightEdge, -leftEdge);
      ty = clamp(ty, fh - bottomEdge, -topEdge);
    }

    function applyTransform() {
      img.style.setProperty("transform", `translate(${tx}px, ${ty}px) scale(${scale})`, "important");
    }

    function beginInteraction() {
      frame.classList.add("is-grabbing");
      if (active) return;
      active = true;
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      img.style.transition = "none";
      img.style.animationPlayState = "paused";

      // Read the animation's current mid-flight transform so grabbing the
      // image never causes a jump - the user takes over from exactly where
      // the autoplay pan visually was.
      const computed = getComputedStyle(img).transform;
      const m = new DOMMatrix(computed === "none" ? undefined : computed);
      scale = clamp(m.a, MIN_SCALE, MAX_SCALE);
      tx = m.e;
      ty = m.f;
      clampPosition();
      grabScale = scale;
      grabTx = tx;
      grabTy = ty;
      applyTransform();
    }

    function endInteraction() {
      frame.classList.remove("is-grabbing");
      if (!active) return;
      active = false;

      img.style.transition = "transform 320ms ease";
      scale = grabScale;
      tx = grabTx;
      ty = grabTy;
      applyTransform();

      settleTimer = setTimeout(() => {
        img.style.transition = "";
        img.style.animationPlayState = "";
        img.style.removeProperty("transform");
        settleTimer = null;
      }, 340);
    }

    function onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        frame.setPointerCapture(e.pointerId);
      } catch {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      beginInteraction();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStartDist = dist(a, b);
        pinchStartScale = scale;
        lastMid = mid(a, b);
      }
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);

      if (pointers.size === 1) {
        tx += cur.x - prev.x;
        ty += cur.y - prev.y;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = dist(a, b);
        if (pinchStartDist > 0) {
          scale = clamp(pinchStartScale * (d / pinchStartDist), MIN_SCALE, MAX_SCALE);
        }
        const m = mid(a, b);
        if (lastMid) {
          tx += m.x - lastMid.x;
          ty += m.y - lastMid.y;
        }
        lastMid = m;
      }
      clampPosition();
      applyTransform();
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerEnd(e) {
      pointers.delete(e.pointerId);
      try {
        frame.releasePointerCapture(e.pointerId);
      } catch {}

      // Reset pinch tracking whether a gesture just ended outright or just
      // dropped from two fingers to one - either way the next move event
      // should re-baseline rather than reuse stale pinch deltas.
      pinchStartDist = 0;
      lastMid = null;
      if (pointers.size === 0) endInteraction();
      e.preventDefault();
      e.stopPropagation();
    }

    function onWheel(e) {
      e.preventDefault();
      e.stopPropagation();
      beginInteraction();
      const factor = Math.exp(-e.deltaY * 0.0015);
      scale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
      clampPosition();
      applyTransform();

      if (wheelEndTimer) clearTimeout(wheelEndTimer);
      wheelEndTimer = setTimeout(() => {
        if (pointers.size === 0) endInteraction();
        wheelEndTimer = null;
      }, 450);
    }

    frame.classList.add("media-frame--interactive");
    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("pointermove", onPointerMove);
    frame.addEventListener("pointerup", onPointerEnd);
    frame.addEventListener("pointercancel", onPointerEnd);
    frame.addEventListener("wheel", onWheel, { passive: false });
    // Pointer events alone don't stop the legacy touch events that the
    // page-swipe handler above listens for on `track` - stop them here so a
    // finger on this image pans the photo instead of turning the page.
    frame.addEventListener("touchstart", (e) => e.stopPropagation());
    frame.addEventListener("touchmove", (e) => e.stopPropagation());
  }

  STORY.forEach((pageData, i) => rail.appendChild(buildPage(pageData, i)));
  track.appendChild(rail);
  buildIndicator();
  setTransform(false);
  updateChrome();

  track.querySelectorAll(".media-frame").forEach((frame) => {
    if (frame.querySelector(".media")) makePanZoomInteractive(frame);
  });
})();
