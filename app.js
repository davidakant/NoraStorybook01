(function () {
  const rail = document.createElement("div");
  rail.className = "pages-rail";

  const stage = document.getElementById("stage");
  const app = document.getElementById("app");
  const track = document.getElementById("track");
  const storyTitle = document.getElementById("storyTitle");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const indicator = document.getElementById("pageIndicator");

  // The whole book is a fixed-size design canvas - see styles.css's #app
  // comment. Nothing inside ever resizes itself; fitStage() is the only
  // thing that changes, scaling the entire canvas uniformly to fit
  // whatever screen it's shown on.
  const CANVAS_W = 820;
  const CANVAS_H = 1180;
  let currentScale = 1;

  function fitStage() {
    const cs = getComputedStyle(stage);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const availW = stage.clientWidth - padL - padR;
    const availH = stage.clientHeight - padT - padB;
    currentScale = Math.max(0.01, Math.min(availW / CANVAS_W, availH / CANVAS_H));
    app.style.transform = `scale(${currentScale})`;
  }

  // A layout name (data.js) says how many images are in each row, top to
  // bottom - 1 = a solo (full-width) row, 2 = a split (side-by-side) row.
  // `images` is sliced into these counts in order to build each row.
  const LAYOUT_ROWS = {
    full: [1],
    "1-over-1": [1, 1],
    "2-over-1": [2, 1],
    "1-over-2": [1, 2],
    "2-over-2": [2, 2],
  };

  // COVER_PAGE/END_PAGE are bookends around the numbered story - they sit
  // in the rail (so swipe/arrow nav flows through them naturally) but are
  // excluded from the "Page X of N" count and the dots, see updateChrome().
  const PAGES = [COVER_PAGE, ...STORY, END_PAGE];
  const TOTAL = PAGES.length;
  let current = 0;
  let dragOffset = 0;
  let dragging = false;

  // The forward nav arrow stays disabled on a `sequentialReveal` page until
  // its reader reaches the very last beat of its very last card - see
  // unlockPage()/buildSequentialZones(). Pages without sequentialReveal
  // (the bookends) have nothing to gate, so they start unlocked. Once a
  // page unlocks it stays unlocked, even if the reader then steps back
  // through earlier sentences.
  const pageUnlocked = PAGES.map((p) => !p.sequentialReveal);

  function unlockPage(index) {
    if (pageUnlocked[index]) return;
    pageUnlocked[index] = true;
    updateChrome();
  }
  const puzzlesByRailIndex = new Map();
  const watermarksToFit = [];

  // Shared shell for an image's text overlay (see `textZone` in data.js) -
  // just the positioned, styled <div>/<p> pair, with no beat/advance logic
  // of its own. Used by both buildTextZone (each image advances on its
  // own) and buildSequentialZones (one shared advance across a page).
  function createZoneShell(img) {
    const zone = document.createElement("div");
    zone.className = `text-zone text-zone--${img.textZone}`;
    if (img.textZone === "banner" || img.textZone === "card") {
      zone.classList.add(`text-zone--pos-${img.textZonePosition || "bottom"}`);
    }
    if (img.textZone === "bubble") {
      zone.style.left = img.bubbleX || "50%";
      zone.style.top = img.bubbleY || "50%";
      zone.style.transform = "translate(-50%, -50%)";
    }

    const textEl = document.createElement("p");
    textEl.className = "text-zone__text";
    zone.appendChild(textEl);

    return { zone, textEl };
  }

  function createNextButton() {
    const btn = document.createElement("button");
    btn.className = "text-zone__next";
    btn.type = "button";
    btn.setAttribute("aria-label", "Next");
    btn.textContent = "→";
    return btn;
  }

  // Sentence-advance arrows for sequential-reveal pages (see
  // buildSequentialZones below) - anchored to the image frame's own
  // corners rather than the card, so they never sit on top of its text
  // no matter how many lines the card wraps to.
  function createSeqArrowButton(direction) {
    const btn = document.createElement("button");
    btn.className = `seq-arrow seq-arrow--${direction}`;
    btn.type = "button";
    btn.setAttribute("aria-label", direction === "next" ? "Next sentence" : "Previous sentence");
    btn.innerHTML =
      direction === "next"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3 18 12l-9.5 9" /></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3 6 12l9.5 9" /></svg>';
    return btn;
  }

  // Shared AudioContext for the piano mini game (see createPianoGame) -
  // created lazily on the first key press since browsers block audio
  // until a real user gesture; reused after that rather than spawning a
  // new context per note.
  let audioCtx = null;
  function playSynthNote(freq) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // One octave, middle C up to B, white keys left-to-right with the black
  // keys laid out in the standard C/D/-/F/G/A/- pattern (no black key
  // between E-F or B-C).
  const PIANO_NOTES = [
    { name: "C", freq: 261.63, black: false },
    { name: "C#", freq: 277.18, black: true },
    { name: "D", freq: 293.66, black: false },
    { name: "D#", freq: 311.13, black: true },
    { name: "E", freq: 329.63, black: false },
    { name: "F", freq: 349.23, black: false },
    { name: "F#", freq: 369.99, black: true },
    { name: "G", freq: 392.0, black: false },
    { name: "G#", freq: 415.3, black: true },
    { name: "A", freq: 440.0, black: false },
    { name: "A#", freq: 466.16, black: true },
    { name: "B", freq: 493.88, black: false },
  ];

  // Mini game for a `miniGame: { type: "piano" }` beat (see data.js) -
  // a playable one-octave keyboard. The reader must press `minNotes` keys
  // (any notes, repeats count) to win; `onComplete` fires once, the first
  // time that happens, so the caller can permanently lift its own gate.
  function createPianoGame({ minNotes, onComplete }) {
    const whiteCount = PIANO_NOTES.filter((n) => !n.black).length;
    const whiteWidthPct = 100 / whiteCount;
    const blackWidthPct = whiteWidthPct * 0.62;

    const game = document.createElement("div");
    game.className = "mini-piano";

    const status = document.createElement("div");
    status.className = "mini-piano__status";
    game.appendChild(status);

    const keys = document.createElement("div");
    keys.className = "mini-piano__keys";
    game.appendChild(keys);

    let notesPlayed = 0;
    let completed = false;

    function updateStatus() {
      status.textContent = completed
        ? "Melody complete! Tap → to continue."
        : `Play a melody of ${minNotes}+ notes to continue (${notesPlayed}/${minNotes})`;
    }
    updateStatus();

    let whiteSeen = 0;
    PIANO_NOTES.forEach((note) => {
      const key = document.createElement("button");
      key.type = "button";
      key.setAttribute("aria-label", `Play ${note.name}`);
      if (note.black) {
        key.className = "mini-piano__key mini-piano__key--black";
        key.style.width = `${blackWidthPct}%`;
        key.style.left = `calc(${whiteSeen * whiteWidthPct}% - ${blackWidthPct / 2}%)`;
      } else {
        whiteSeen++;
        key.className = "mini-piano__key mini-piano__key--white";
        key.style.width = `${whiteWidthPct}%`;
      }
      key.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        playSynthNote(note.freq);
        key.classList.add("is-pressed");
        setTimeout(() => key.classList.remove("is-pressed"), 120);
        if (completed) return;
        notesPlayed++;
        if (notesPlayed >= minNotes) {
          completed = true;
          onComplete();
        }
        updateStatus();
      });
      keys.appendChild(key);
    });

    return game;
  }

  // Builds the overlay that sits on top of an image (see `textZone`/
  // `caption` in data.js). A string caption shows all at once; an array is
  // a sequence of "beats" the reader taps through with a Next button.
  function buildTextZone(img) {
    const { zone, textEl } = createZoneShell(img);
    const beats = Array.isArray(img.caption) ? img.caption : [img.caption];
    let beatIndex = 0;
    let nextBtn = null;

    function renderBeat() {
      textEl.textContent = beats[beatIndex];
      if (nextBtn) nextBtn.style.display = beatIndex < beats.length - 1 ? "" : "none";
    }

    if (beats.length > 1) {
      nextBtn = createNextButton();
      nextBtn.addEventListener("click", () => {
        if (beatIndex < beats.length - 1) {
          beatIndex++;
          renderBeat();
        }
      });
      zone.appendChild(nextBtn);
    }

    renderBeat();
    return zone;
  }

  // Coordinates text zones across MULTIPLE images on one page (see
  // page-level `sequentialReveal` in data.js): only one image's card is
  // visible at a time. Tapping its arrow fades to that card's next beat;
  // once a card's last beat is showing, tapping again hides that card and
  // reveals the next image's card at its first beat, and so on.
  function buildSequentialZones(entries, pageIndex) {
    const FADE_MS = 220;
    let transitioning = false;
    let cardIndex = 0;

    const cards = entries.map(({ frame, img }) => {
      const { zone, textEl } = createZoneShell(img);
      textEl.classList.add("text-zone__text--fade");
      frame.appendChild(zone);
      const prevBtn = createSeqArrowButton("prev");
      const nextBtn = createSeqArrowButton("next");
      frame.appendChild(prevBtn);
      frame.appendChild(nextBtn);
      // Optional per-image `beatImages` (data.js) swaps the frame's <img>
      // src alongside the caption as the reader advances - one entry per
      // beat, same length as `caption`. Preload them up front so the swap
      // never shows a blank frame while the next image fetches.
      const mediaEl = frame.querySelector(".media");
      if (img.beatImages) img.beatImages.forEach((src) => { new Image().src = src; });

      const card = {
        zone,
        textEl,
        mediaEl,
        beatImages: img.beatImages,
        prevBtn,
        nextBtn,
        beats: Array.isArray(img.caption) ? img.caption : [img.caption],
        beatIndex: 0,
        revealHandle: frame.revealHandle,
        miniGame: img.miniGame,
        miniGameDone: false,
      };

      // Optional per-image `miniGame` (data.js) plants a small game inside
      // one specific beat of this card, gating its Next arrow until won -
      // see createPianoGame/createSaturationReveal and the lock/unlock
      // handling in updateArrowEdges/advance below. `card.miniGameEl` is
      // whichever single element the caller should show/hide to mount the
      // game's own interactive control (a piano keyboard lives inside the
      // card's own zone; a saturation-reveal handle lives on the frame
      // itself instead, since its desaturated image layer has to stay
      // visible no matter which card is currently active).
      if (img.miniGame && img.miniGame.type === "piano") {
        card.miniGameEl = createPianoGame({
          minNotes: img.miniGame.minNotes,
          onComplete: () => {
            card.miniGameDone = true;
            updateArrowEdges();
          },
        });
        card.miniGameEl.style.display = "none";
        zone.appendChild(card.miniGameEl);
      } else if (img.miniGame && img.miniGame.type === "saturationSlider") {
        card.miniGameEl = createSaturationReveal(frame, {
          src: img.src,
          threshold: img.miniGame.threshold,
          onComplete: () => {
            card.miniGameDone = true;
            updateArrowEdges();
          },
        });
      }

      return card;
    });

    function applyBeatImage(card) {
      if (card.mediaEl && card.beatImages && card.beatImages[card.beatIndex]) {
        card.mediaEl.src = card.beatImages[card.beatIndex];
      }
    }

    // Hides each arrow once there's nothing left in that direction (no
    // earlier sentence before the very first beat, no later one after the
    // very last), independent of which card's controls are mounted.
    function updateArrowEdges() {
      const card = cards[cardIndex];
      const isVeryFirst = cardIndex === 0 && card.beatIndex === 0;
      const isVeryLast = cardIndex === cards.length - 1 && card.beatIndex === card.beats.length - 1;
      card.prevBtn.style.visibility = isVeryFirst ? "hidden" : "";
      card.nextBtn.style.visibility = isVeryLast ? "hidden" : "";
      if (isVeryLast) unlockPage(pageIndex);

      // Mini games (data.js `miniGame`) gate their own card's Next arrow.
      // A piano's control lives inside its card's own zone, so it's
      // already hidden whenever that card isn't active; a saturation
      // slider's handle lives on the frame instead (its desaturated layer
      // has to stay visible regardless of which card is active), so it
      // doesn't get that for free - checking every card here, not just the
      // active one, keeps any such handle from being left showing once the
      // reader has moved on to a different card or beat.
      cards.forEach((c) => {
        if (!c.miniGame) return;
        const onGameBeat = c === card && c.beatIndex === c.miniGame.beatIndex;
        if (c.miniGameEl) c.miniGameEl.style.display = onGameBeat ? "" : "none";
        c.nextBtn.classList.toggle("seq-arrow--locked", onGameBeat && !c.miniGameDone);
      });
    }

    function showCard(index, beatIndex) {
      cards.forEach((c, i) => {
        const isActive = i === index;
        c.zone.style.display = isActive ? "" : "none";
        c.prevBtn.style.display = isActive ? "" : "none";
        c.nextBtn.style.display = isActive ? "" : "none";
      });
      const card = cards[index];
      card.beatIndex = beatIndex;
      card.textEl.style.opacity = "1";
      card.textEl.textContent = card.beats[beatIndex];
      applyBeatImage(card);
      if (card.revealHandle) card.revealHandle.unlock();
      updateArrowEdges();
    }

    function advance() {
      if (transitioning) return;
      const card = cards[cardIndex];
      if (card.miniGame && card.beatIndex === card.miniGame.beatIndex && !card.miniGameDone) return;
      if (card.beatIndex < card.beats.length - 1) {
        transitioning = true;
        card.textEl.style.opacity = "0";
        setTimeout(() => {
          card.beatIndex++;
          card.textEl.textContent = card.beats[card.beatIndex];
          card.textEl.style.opacity = "1";
          applyBeatImage(card);
          updateArrowEdges();
          transitioning = false;
        }, FADE_MS);
      } else if (cardIndex < cards.length - 1) {
        cardIndex++;
        showCard(cardIndex, 0);
      }
    }

    function goBack() {
      if (transitioning) return;
      const card = cards[cardIndex];
      if (card.beatIndex > 0) {
        transitioning = true;
        card.textEl.style.opacity = "0";
        setTimeout(() => {
          card.beatIndex--;
          card.textEl.textContent = card.beats[card.beatIndex];
          card.textEl.style.opacity = "1";
          applyBeatImage(card);
          updateArrowEdges();
          transitioning = false;
        }, FADE_MS);
      } else if (cardIndex > 0) {
        cardIndex--;
        showCard(cardIndex, cards[cardIndex].beats.length - 1);
      }
    }

    cards.forEach((card) => {
      card.nextBtn.addEventListener("click", advance);
      card.prevBtn.addEventListener("click", goBack);
    });
    showCard(0, 0);
  }

  function buildImageSlot(img, pageNum, rowNum, slot, eager) {
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
      frame.appendChild(image);

      if (img.reveal) {
        frame.revealHandle = createRubReveal(frame, {
          src: img.src,
          label: img.revealLabel,
          threshold: img.revealThreshold,
          locked: !!img.revealLocked,
        });
      }
    } else {
      frame.classList.add("media-frame--empty");
      const label = document.createElement("span");
      label.className = "media-frame__placeholder";
      label.textContent = "Image coming soon";
      frame.appendChild(label);
    }

    return frame;
  }

  function buildRow(images, pageNum, rowNum, eager, textEntries) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.cols = String(images.length);
    images.forEach((img, i) => {
      const slot = images.length === 2 ? (i === 0 ? "a" : "b") : "single";
      const frame = buildImageSlot(img, pageNum, rowNum, slot, eager);
      row.appendChild(frame);
      if (img.textZone && img.caption) textEntries.push({ frame, img });
    });
    return row;
  }

  function buildPage(pageData, pageIndex) {
    const page = document.createElement("section");
    page.className = "page";

    if (pageData.kind === "bookend" && pageData.puzzle) {
      page.setAttribute("aria-label", pageData.alt);
      const puzzleEl = document.createElement("div");
      page.appendChild(puzzleEl);
      const handle = createJigsawPuzzle(puzzleEl, {
        src: pageData.src,
        alt: pageData.alt,
        cols: pageData.puzzle.cols,
        rows: pageData.puzzle.rows,
      });
      puzzlesByRailIndex.set(pageIndex, handle);
      return page;
    }

    page.setAttribute(
      "aria-label",
      pageData.kind === "bookend" ? pageData.images[0].alt : `Page ${pageData.page}: ${pageData.title}`
    );

    const pageRows = document.createElement("div");
    pageRows.className = "page-rows";
    const rowCounts = LAYOUT_ROWS[pageData.layout];
    pageRows.dataset.rows = String(rowCounts.length);

    const textEntries = [];
    let imgIndex = 0;
    rowCounts.forEach((count, rowIdx) => {
      const rowImages = pageData.images.slice(imgIndex, imgIndex + count);
      imgIndex += count;
      pageRows.appendChild(buildRow(rowImages, pageData.page || "bookend", rowIdx + 1, pageIndex === 0, textEntries));
    });
    page.appendChild(pageRows);

    if (pageData.sequentialReveal) {
      buildSequentialZones(textEntries, pageIndex);
    } else {
      textEntries.forEach(({ frame, img }) => frame.appendChild(buildTextZone(img)));
    }

    if (pageData.watermark) {
      const watermark = document.createElement("div");
      watermark.className = "bookend-watermark";
      const watermarkText = document.createElement("span");
      watermarkText.textContent = pageData.watermark;
      watermark.appendChild(watermarkText);
      page.appendChild(watermark);
      watermarksToFit.push({ container: watermark, textEl: watermarkText });
    }

    return page;
  }

  // Dots represent only the 8 numbered story pages; rail index = dot index
  // + 1 since COVER_PAGE occupies rail index 0.
  function buildIndicator() {
    indicator.innerHTML = "";
    STORY.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to page ${i + 1}`);
      dot.addEventListener("click", () => goTo(i + 1));
      indicator.appendChild(dot);
    });
  }

  function updateIndicator() {
    [...indicator.children].forEach((dot, i) => {
      dot.classList.toggle("active", i + 1 === current);
    });
  }

  function updateChrome() {
    const data = PAGES[current];
    const isBookend = data.kind === "bookend";
    app.classList.toggle("app--bookend", isBookend);
    if (!isBookend) storyTitle.textContent = `Page ${data.page} of ${STORY.length} · ${data.title}`;

    // Only the puzzle on the currently-visible page runs its render loop.
    puzzlesByRailIndex.forEach((handle, railIndex) => handle.setActive(railIndex === current));

    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === TOTAL - 1 || !pageUnlocked[current];
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
  // to native scrolling so long captions remain readable. Pointer deltas
  // arrive in real screen px, but the rail's translateX lives inside the
  // uniformly-scaled #app - dividing by currentScale converts them to the
  // same fixed design-px space everything else is measured in, so a swipe
  // tracks the finger 1:1 regardless of the current zoom level.
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
      dragOffset = (atStart || atEnd ? dx * 0.35 : dx) / currentScale;
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

  // Shrinks a watermark's text (CSS's font-size is just a ceiling) only as
  // much as needed to keep it from clipping past its page's edge - run
  // after the rail is actually in the document, since it needs real layout.
  function fitWatermark(container, textEl) {
    textEl.style.fontSize = "";
    const available = container.clientWidth - 48; // matches the 24px padding each side
    const natural = textEl.scrollWidth;
    if (available > 0 && natural > available) {
      const naturalFontSize = parseFloat(getComputedStyle(textEl).fontSize);
      textEl.style.fontSize = `${(naturalFontSize * available / natural) * 0.98}px`;
    }
  }

  // Every image is interactive: pan with mouse drag or a finger, zoom with
  // the scroll wheel or a two-finger pinch. Movement is clamped so the
  // image can never reveal anything beyond its own cover-cropped edges.
  // Unlike the old Ken Burns build, there's no autoplay animation to hand
  // back to on release - images are static now, so after RESET_DELAY_MS of
  // no further touch/scroll input, the image eases back to its original,
  // unzoomed/uncentered-pan default on its own.
  function makePanZoomInteractive(frame) {
    const img = frame.querySelector(".media");
    if (!img) return;
    // A saturation-slider mini game (see createSaturationReveal in
    // reveal.js) overlays a second, separate <img> on top of this one for
    // its desaturated layer - mirror every pan/zoom transform onto it too
    // so dragging/pinching the photo can't drift the two out of alignment.
    const grayClone = frame.querySelector(".sat-reveal__gray");

    const MIN_SCALE = 1;
    const MAX_SCALE = 4;
    const RESET_DELAY_MS = 2000;
    const RESET_DURATION_MS = 450;
    const pointers = new Map();

    let active = false;
    let scale = 1, tx = 0, ty = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let lastMid = null;
    let resetTimer = null;
    let wheelEndTimer = null;
    let settleTimer = null;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    // Center-anchored: scaling up always overflows the frame symmetrically
    // on every edge, by (scale-1)/2 of that edge's own dimension.
    function clampPosition() {
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const maxOffsetX = (fw * (scale - 1)) / 2;
      const maxOffsetY = (fh * (scale - 1)) / 2;
      tx = clamp(tx, -maxOffsetX, maxOffsetX);
      ty = clamp(ty, -maxOffsetY, maxOffsetY);
    }

    function applyTransform() {
      const t = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.transform = t;
      if (grayClone) grayClone.style.transform = t;
    }

    function cancelResetTimer() {
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
    }

    function scheduleReset() {
      cancelResetTimer();
      resetTimer = setTimeout(resetToDefault, RESET_DELAY_MS);
    }

    function resetToDefault() {
      resetTimer = null;
      if (scale === 1 && tx === 0 && ty === 0) return;
      if (settleTimer) clearTimeout(settleTimer);
      const t = `transform ${RESET_DURATION_MS}ms ease`;
      img.style.transition = t;
      if (grayClone) grayClone.style.transition = t;
      scale = 1;
      tx = 0;
      ty = 0;
      applyTransform();
      settleTimer = setTimeout(() => {
        img.style.transition = "";
        img.style.removeProperty("transform");
        if (grayClone) {
          grayClone.style.transition = "";
          grayClone.style.removeProperty("transform");
        }
        settleTimer = null;
      }, RESET_DURATION_MS + 40);
    }

    function beginInteraction() {
      frame.classList.add("is-grabbing");
      cancelResetTimer();
      if (active) return;
      active = true;
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      img.style.transition = "none";
      if (grayClone) grayClone.style.transition = "none";

      // Read the current rendered transform (which may be mid-flight back
      // to default) so grabbing the image never causes a jump.
      const computed = getComputedStyle(img).transform;
      const m = new DOMMatrix(computed === "none" ? undefined : computed);
      scale = clamp(m.a, MIN_SCALE, MAX_SCALE);
      tx = m.e;
      ty = m.f;
      clampPosition();
      applyTransform();
    }

    function endInteraction() {
      frame.classList.remove("is-grabbing");
      if (!active) return;
      active = false;
      img.style.transition = "";
      if (grayClone) grayClone.style.transition = "";
      scheduleReset();
    }

    function onPointerDown(e) {
      // Let clicks on an overlaid control (e.g. the text-zone's Next
      // button, or a sequential-reveal page's prev/next sentence arrows)
      // through untouched - capturing the pointer here would intercept
      // the gesture before the button's own click ever fires.
      if (e.target.closest(".text-zone__next, .seq-arrow")) return;
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

      // Pointer deltas arrive in real screen px, but tx/ty (and the
      // transform they drive) live in the fixed design-px space inside the
      // uniformly-scaled #app - dividing by currentScale (see fitStage)
      // keeps the image tracking the finger 1:1 at any zoom level instead
      // of dragging too slowly or too fast.
      if (pointers.size === 1) {
        tx += (cur.x - prev.x) / currentScale;
        ty += (cur.y - prev.y) / currentScale;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = dist(a, b);
        if (pinchStartDist > 0) {
          scale = clamp(pinchStartScale * (d / pinchStartDist), MIN_SCALE, MAX_SCALE);
        }
        const m = mid(a, b);
        if (lastMid) {
          tx += (m.x - lastMid.x) / currentScale;
          ty += (m.y - lastMid.y) / currentScale;
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
    // finger on this image pans the photo instead of turning the page. Skip
    // that for the Next button too, same reason as onPointerDown above.
    frame.addEventListener("touchstart", (e) => {
      if (!e.target.closest(".text-zone__next")) e.stopPropagation();
    });
    frame.addEventListener("touchmove", (e) => {
      if (!e.target.closest(".text-zone__next")) e.stopPropagation();
    });
  }

  fitStage();
  PAGES.forEach((pageData, i) => rail.appendChild(buildPage(pageData, i)));
  track.appendChild(rail);
  buildIndicator();
  setTransform(false);
  updateChrome();

  watermarksToFit.forEach(({ container, textEl }) => fitWatermark(container, textEl));
  window.addEventListener("resize", () => {
    fitStage();
    watermarksToFit.forEach(({ container, textEl }) => fitWatermark(container, textEl));
  });

  track.querySelectorAll(".media-frame").forEach((frame) => {
    if (frame.querySelector(".media")) makePanZoomInteractive(frame);
  });

  window.__puzzles = puzzlesByRailIndex; // debug hook, see puzzle.js's __debug* methods
})();
