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

  STORY.forEach((pageData, i) => rail.appendChild(buildPage(pageData, i)));
  track.appendChild(rail);
  buildIndicator();
  setTransform(false);
  updateChrome();
})();
