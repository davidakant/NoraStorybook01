// Jigsaw puzzle engine, ported from the "Puzzles" project (video jigsaw).
// That version clipped a live-playing <video> through jigsaw-shaped Path2D
// pieces; this version does the same against a single static <img>, so the
// per-frame "grab a video frame" step is gone (the offscreen source is
// drawn once, in buildOffscreen) but everything else - piece geometry,
// grouping/connection logic, drag/rotate, win detection - is the same
// engine. createJigsawPuzzle() wraps it as a reusable factory instead
// of Puzzles' single-page-app globals, since the storybook can have more
// than one puzzle page.
function createJigsawPuzzle(container, { src, alt, cols, rows }) {
  const COLS = cols, ROWS = rows;
  const MAX_OFFSCREEN_DIM = 1024;
  const SNAP_DIST = 20;
  const BOARD_SHRINK = 0.6; // solved board occupies 60% of the available area, leaving a scatter margin
  const SOLVED_FADE_MS = 2000;
  // Growing the solved board by exactly 1/BOARD_SHRINK scales it from its
  // shrunk solving size back up to the SAME size/position as the always-
  // visible background guide below (both are centered in board-wrap, so
  // growing around the group's own center lands exactly on it) - that's
  // what makes the reveal seamless instead of an arbitrary "scale up a bit".
  const SOLVED_SCALE = 1 / BOARD_SHRINK;

  /* ── DOM ─────────────────────────────────────────────── */
  container.classList.add("puzzle");
  container.innerHTML = `
    <div class="puzzle-board-wrap">
      <img class="puzzle-bg-guide" alt="" aria-hidden="true" draggable="false" />
      <div class="puzzle-board-target"></div>
    </div>
    <div class="puzzle-controls">
      <button class="puzzle-btn" type="button" data-action="skip">Skip</button>
      <button class="puzzle-btn" type="button" data-action="reshuffle">Reshuffle</button>
    </div>
  `;
  const boardWrap = container.querySelector(".puzzle-board-wrap");
  const bgGuide = container.querySelector(".puzzle-bg-guide");
  const boardTarget = container.querySelector(".puzzle-board-target");
  const skipBtn = container.querySelector('[data-action="skip"]');
  const reshuffleBtn = container.querySelector('[data-action="reshuffle"]');

  const srcImage = new Image();
  srcImage.alt = alt || "";

  /* ── State ───────────────────────────────────────────── */
  let offCanvas = null, offCtx = null;
  let pieceSrcW = 0, pieceSrcH = 0;
  let originX = 0, originY = 0, dispW = 0, dispH = 0;
  let KNOB = 0, MARGIN = 0;
  let marginCss = 0;
  let pieces = [];
  let pieceByCanvas = new Map();
  let groupIdCounter = 0;
  let pieceCssW = 0, pieceCssH = 0;

  let drag = null;
  let zCounter = 10;
  let active = false; // gates the render loop + lets the page pause it while scrolled away
  let rafId = null;
  let isSolved = false;
  let solvedAt = null;
  let canvasReadBlocked = false;
  let taintCheckPending = false;

  /* ── Jigsaw edge geometry (unchanged from Puzzles) ──────
     Canonical edge drawn left-to-right along local +x, from (0,0) to
     (len,0). Canonical -y = "outward" (away from piece body). dir: +1 =
     tab (bulges outward), -1 = blank (dips inward), 0 = flat. Absolute
     points are computed by hand (rotation + translation) because Path2D
     has no transform stack of its own. ──────────────────────────────── */
  function rotatePoint(x, y, angleDeg) {
    const r = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    return [x * cos - y * sin, x * sin + y * cos];
  }

  function addEdgeAbs(path, corner, angleDeg, len, dir, knob) {
    const abs = (x, y) => {
      const [dx, dy] = rotatePoint(x, y, angleDeg);
      return [corner[0] + dx, corner[1] + dy];
    };
    if (dir === 0) {
      const [ex, ey] = abs(len, 0);
      path.lineTo(ex, ey);
      return;
    }
    const a = -dir * knob;
    const w = knob * 0.8;
    const neck = len / 2;

    let pt = abs(neck - w * 1.5, 0); path.lineTo(pt[0], pt[1]);
    let c1 = abs(neck - w * 1.5, a * 0.3);
    let c2 = abs(neck - w, a);
    let e1 = abs(neck - w * 0.5, a);
    path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e1[0], e1[1]);
    let c3 = abs(neck - w * 0.2, a * 1.3);
    let c4 = abs(neck + w * 0.2, a * 1.3);
    let e2 = abs(neck + w * 0.5, a);
    path.bezierCurveTo(c3[0], c3[1], c4[0], c4[1], e2[0], e2[1]);
    let c5 = abs(neck + w, a);
    let c6 = abs(neck + w * 1.5, a * 0.3);
    let e3 = abs(neck + w * 1.5, 0);
    path.bezierCurveTo(c5[0], c5[1], c6[0], c6[1], e3[0], e3[1]);
    let pf = abs(len, 0); path.lineTo(pf[0], pf[1]);
  }

  function buildPiecePath2D(cellW, cellH, marginX, marginY, knob, topDir, rightDir, bottomDir, leftDir) {
    const path = new Path2D();
    const tl = [marginX, marginY];
    const tr = [marginX + cellW, marginY];
    const br = [marginX + cellW, marginY + cellH];
    const bl = [marginX, marginY + cellH];
    path.moveTo(tl[0], tl[1]);
    addEdgeAbs(path, tl, 0, cellW, topDir, knob);
    addEdgeAbs(path, tr, 90, cellH, rightDir, knob);
    addEdgeAbs(path, br, 180, cellW, bottomDir, knob);
    addEdgeAbs(path, bl, 270, cellH, leftDir, knob);
    path.closePath();
    return path;
  }

  function generateEdgeTables() {
    const hEdge = [];
    for (let r = 0; r < ROWS - 1; r++) hEdge.push(Array.from({ length: COLS }, () => (Math.random() < 0.5 ? 1 : -1)));
    const vEdge = [];
    for (let r = 0; r < ROWS; r++) vEdge.push(Array.from({ length: COLS - 1 }, () => (Math.random() < 0.5 ? 1 : -1)));
    return { hEdge, vEdge };
  }

  /* ── Offscreen buffer: the static image is drawn here once - unlike
     Puzzles' per-frame video grab, this never needs to be redrawn. ───── */
  function buildOffscreen() {
    const nativeW = srcImage.naturalWidth, nativeH = srcImage.naturalHeight;
    if (!nativeW || !nativeH) return;

    const scale = Math.min(1, MAX_OFFSCREEN_DIM / Math.max(nativeW, nativeH));
    let w = Math.floor(nativeW * scale);
    let h = Math.floor(nativeH * scale);
    w -= w % COLS;
    h -= h % ROWS;

    offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(srcImage, 0, 0, w, h);

    pieceSrcW = w / COLS;
    pieceSrcH = h / ROWS;
    KNOB = Math.min(pieceSrcW, pieceSrcH) * 0.28;
    MARGIN = KNOB * 1.6;
  }

  /* ── Geometry: where the target board sits inside board-wrap ─────────
     No inset here (unlike the original Puzzles project) - the area used
     is exactly board-wrap's own box, the same box the CSS background
     guide fits into via object-fit: contain. That equality is what makes
     SOLVED_SCALE (1/BOARD_SHRINK) land the grown, solved board exactly on
     top of the guide instead of needing its own separate calculation. */
  function computeGeometry() {
    const areaW = boardWrap.clientWidth;
    const areaH = boardWrap.clientHeight;
    const ar = offCanvas.width / offCanvas.height;

    let boardW, boardH;
    if (areaW / ar <= areaH) { boardW = areaW; boardH = areaW / ar; }
    else { boardH = areaH; boardW = areaH * ar; }
    boardW *= BOARD_SHRINK;
    boardH *= BOARD_SHRINK;

    originX = (boardWrap.clientWidth - boardW) / 2;
    originY = (boardWrap.clientHeight - boardH) / 2;
    dispW = boardW / COLS;
    dispH = boardH / ROWS;
    marginCss = MARGIN * (dispW / pieceSrcW);

    boardTarget.style.left = originX + "px";
    boardTarget.style.top = originY + "px";
    boardTarget.style.width = boardW + "px";
    boardTarget.style.height = boardH + "px";
  }

  /* ── Build pieces ────────────────────────────────────── */
  function buildBoard() {
    if (!offCanvas) return;

    computeGeometry();

    pieces.forEach((p) => p.canvas.remove());
    pieces = [];
    pieceByCanvas.clear();

    const { hEdge, vEdge } = generateEdgeTables();
    const bitmapW = pieceSrcW + 2 * MARGIN;
    const bitmapH = pieceSrcH + 2 * MARGIN;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const topDir = r === 0 ? 0 : -hEdge[r - 1][c];
        const bottomDir = r === ROWS - 1 ? 0 : hEdge[r][c];
        const rightDir = c === COLS - 1 ? 0 : vEdge[r][c];
        const leftDir = c === 0 ? 0 : -vEdge[r][c - 1];

        const canvas = document.createElement("canvas");
        canvas.className = "puzzle-piece";
        canvas.width = bitmapW;
        canvas.height = bitmapH;
        boardWrap.appendChild(canvas);

        const piece = {
          col: c, row: r,
          sx: c * pieceSrcW, sy: r * pieceSrcH,
          canvas, ctx: canvas.getContext("2d"),
          path2D: buildPiecePath2D(pieceSrcW, pieceSrcH, MARGIN, MARGIN, KNOB, topDir, rightDir, bottomDir, leftDir),
          home: { x: originX + c * dispW, y: originY + r * dispH },
          isCorner: (c === 0 || c === COLS - 1) && (r === 0 || r === ROWS - 1),
          rotation: 0,
          localDx: 0, localDy: 0,
          group: null,
        };
        pieceByCanvas.set(canvas, piece);
        pieces.push(piece);
      }
    }

    applyAllSizes();
    scatterAllPieces();

    canvasReadBlocked = false;
    taintCheckPending = true;
  }

  function applyAllSizes() {
    pieceCssW = (pieceSrcW + 2 * MARGIN) * (dispW / pieceSrcW);
    pieceCssH = (pieceSrcH + 2 * MARGIN) * (dispH / pieceSrcH);
    for (const p of pieces) {
      p.canvas.style.width = pieceCssW + "px";
      p.canvas.style.height = pieceCssH + "px";
    }
  }

  /* ── Groups: a rigid cluster of one or more pieces that move/rotate
     together. Every piece always belongs to exactly one group (even a
     lone piece is a group of one). ─────────────────────────────────── */
  function rotateVec(x, y, deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return [x * cos - y * sin, x * sin + y * cos];
  }

  function effectiveRotation(piece) {
    return ((piece.rotation % 360) + 360) % 360;
  }

  function pieceAbsolutePos(piece) {
    const [rx, ry] = rotateVec(piece.localDx, piece.localDy, piece.rotation);
    return { x: piece.group.anchorX + rx, y: piece.group.anchorY + ry };
  }

  function unrotatedPos(piece) {
    return { x: piece.group.anchorX + piece.localDx, y: piece.group.anchorY + piece.localDy };
  }

  function placeCanvasAt(piece) {
    const pos = unrotatedPos(piece);
    piece.canvas.style.left = pos.x - marginCss + "px";
    piece.canvas.style.top = pos.y - marginCss + "px";
  }

  function updateGroupPivot(group) {
    let minX = 0, minY = 0, maxX = dispW, maxY = dispH;
    for (const p of group.pieces) {
      minX = Math.min(minX, p.localDx);
      minY = Math.min(minY, p.localDy);
      maxX = Math.max(maxX, p.localDx + dispW);
      maxY = Math.max(maxY, p.localDy + dispH);
    }
    const centerOffsetX = (minX + maxX) / 2;
    const centerOffsetY = (minY + maxY) / 2;
    for (const p of group.pieces) {
      const ox = marginCss + centerOffsetX - p.localDx;
      const oy = marginCss + centerOffsetY - p.localDy;
      p.canvas.style.transformOrigin = `${ox}px ${oy}px`;
    }
  }

  function areGridAdjacent(p1, p2) {
    const dc = p1.col - p2.col, dr = p1.row - p2.row;
    return (Math.abs(dc) === 1 && dr === 0) || (dc === 0 && Math.abs(dr) === 1);
  }

  function getGridNeighbors(piece) {
    return pieces.filter((p) => areGridAdjacent(p, piece));
  }

  function piecesAligned(p1, p2) {
    if (p1.group === p2.group) return false;
    if (effectiveRotation(p1) !== effectiveRotation(p2)) return false;

    const [edx, edy] = rotateVec((p2.col - p1.col) * dispW, (p2.row - p1.row) * dispH, p1.rotation);
    const pos1 = pieceAbsolutePos(p1);
    const pos2 = pieceAbsolutePos(p2);
    const actualDx = pos2.x - pos1.x;
    const actualDy = pos2.y - pos1.y;

    return Math.hypot(actualDx - edx, actualDy - edy) <= SNAP_DIST;
  }

  function mergeGroups(keep, absorb) {
    if (keep === absorb) return keep;
    if (absorb.locked && !keep.locked) { const t = keep; keep = absorb; absorb = t; }

    const anchor = keep.pieces[0];
    for (const p of absorb.pieces) {
      p.group = keep;
      p.localDx = p.home.x - anchor.home.x;
      p.localDy = p.home.y - anchor.home.y;
      keep.pieces.push(p);
    }
    if (absorb.locked) keep.locked = true;
    updateGroupPivot(keep);
    for (const p of keep.pieces) {
      if (keep.locked) {
        p.canvas.classList.add("locked");
        p.canvas.style.zIndex = 0;
      }
      placeCanvasAt(p);
    }
    return keep;
  }

  function checkConnections(group) {
    let merged = true;
    while (merged) {
      merged = false;
      for (const p of group.pieces) {
        for (const n of getGridNeighbors(p)) {
          if (n.group !== group && piecesAligned(p, n)) {
            group = mergeGroups(group, n.group);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }
    checkCornerSnap(group);
    updateWinState();
  }

  function checkCornerSnap(group) {
    if (group.locked) return;
    for (const p of group.pieces) {
      if (!p.isCorner || effectiveRotation(p) !== 0) continue;
      const pos = pieceAbsolutePos(p);
      const dist = Math.hypot(pos.x - p.home.x, pos.y - p.home.y);
      if (dist > SNAP_DIST) continue;

      group.anchorX += p.home.x - pos.x;
      group.anchorY += p.home.y - pos.y;
      group.locked = true;
      for (const m of group.pieces) {
        m.canvas.classList.add("locked");
        m.canvas.style.zIndex = 0;
        placeCanvasAt(m);
      }
      return;
    }
  }

  function updateWinState() {
    const solved = pieces.length > 0 && pieces[0].group.locked && pieces.every((p) => p.group === pieces[0].group);

    if (solved && !isSolved) {
      solvedAt = performance.now();
      // Grows around the (now single) group's own pivot - already the
      // bounding-box center of every piece, which for a fully-assembled
      // board coincides with board-wrap's center, same as the guide image.
      for (const p of pieces) {
        p.canvas.style.transition = `transform ${SOLVED_FADE_MS}ms ease`;
        p.canvas.style.transform = `rotate(${p.rotation}deg) scale(${SOLVED_SCALE})`;
      }
    } else if (!solved) {
      solvedAt = null;
    }
    isSolved = solved;
    skipBtn.disabled = solved;
  }

  /* ── Scatter ─────────────────────────────────────────── */
  const SHUFFLE_ROTATIONS = [90, 180, 270]; // never 0 - every piece starts wrong-side-up

  function scatterAllPieces() {
    if (!pieces.length) return;
    const maxX = Math.max(0, boardWrap.clientWidth - dispW);
    const maxY = Math.max(0, boardWrap.clientHeight - dispH);

    skipBtn.disabled = false;
    isSolved = false;
    solvedAt = null;
    for (const p of pieces) {
      p.group = { id: ++groupIdCounter, pieces: [p], anchorX: Math.random() * maxX, anchorY: Math.random() * maxY, locked: false };
      p.localDx = 0;
      p.localDy = 0;
      p.rotation = SHUFFLE_ROTATIONS[Math.floor(Math.random() * SHUFFLE_ROTATIONS.length)];
      p.canvas.style.transition = "";
      p.canvas.style.transform = `rotate(${p.rotation}deg)`;
      p.canvas.classList.remove("locked");
      p.canvas.style.zIndex = 1;
      updateGroupPivot(p.group);
      placeCanvasAt(p);
    }
  }

  // boardWrap.getBoundingClientRect() reflects the real, on-screen
  // rendered size, but every piece's own position (and dispW/dispH etc.)
  // is always in fixed design pixels - the whole book now scales
  // uniformly (see fitStage() in app.js) - so dividing out that scale
  // factor here keeps hit-testing/dragging exactly under the pointer at
  // any zoom level instead of drifting.
  function localXY(clientX, clientY, rect) {
    const scaleX = rect.width / boardWrap.clientWidth;
    const scaleY = rect.height / boardWrap.clientHeight;
    return { x: (clientX - rect.left) / scaleX, y: (clientY - rect.top) / scaleY };
  }

  /* ── Hit-testing: pick the topmost piece that is actually opaque at
     this point, so transparent tab/blank margins don't block clicks
     meant for a piece underneath. ──────────────────────────────────── */
  function findPieceAt(clientX, clientY) {
    const stack = document.elementsFromPoint(clientX, clientY);
    const wrapRect = boardWrap.getBoundingClientRect();
    const { x: localX, y: localY } = localXY(clientX, clientY, wrapRect);
    for (const el of stack) {
      const piece = pieceByCanvas.get(el);
      if (!piece) continue;

      if (canvasReadBlocked) return piece;

      const pos = pieceAbsolutePos(piece);
      const boxLeft = pos.x - marginCss;
      const boxTop = pos.y - marginCss;
      const sx = localX - (boxLeft + pieceCssW / 2);
      const sy = localY - (boxTop + pieceCssH / 2);
      let lx, ly;
      switch (effectiveRotation(piece)) {
        case 90: lx = sy; ly = -sx; break;
        case 180: lx = -sx; ly = -sy; break;
        case 270: lx = -sy; ly = sx; break;
        default: lx = sx; ly = sy;
      }
      const px = Math.floor(((pieceCssW / 2 + lx) / pieceCssW) * piece.canvas.width);
      const py = Math.floor(((pieceCssH / 2 + ly) / pieceCssH) * piece.canvas.height);
      if (px < 0 || py < 0 || px >= piece.canvas.width || py >= piece.canvas.height) continue;
      try {
        const a = piece.ctx.getImageData(px, py, 1, 1).data[3];
        if (a > 10) return piece;
      } catch (err) {
        canvasReadBlocked = true;
        console.warn("Per-pixel hit-testing disabled (canvas tainted, likely file:// origin). Reason:", err.message);
        return piece;
      }
    }
    return null;
  }

  /* ── Skip: snaps every piece straight to its home cell at 0deg, then
     runs the exact same connection/merge/corner-snap pass a real drag
     would - so this produces the identical win-sequence (scale-up, shadow
     and outline fade) as actually solving it. ──────────────────────────── */
  function skipPuzzle() {
    if (isSolved || !pieces.length) return;
    for (const p of pieces) {
      p.group = { id: ++groupIdCounter, pieces: [p], anchorX: p.home.x, anchorY: p.home.y, locked: false };
      p.localDx = 0;
      p.localDy = 0;
      p.rotation = 0;
      p.canvas.style.transition = "";
      p.canvas.style.transform = "rotate(0deg)";
      updateGroupPivot(p.group);
      placeCanvasAt(p);
    }
    for (const p of pieces) checkConnections(p.group);
  }

  skipBtn.addEventListener("click", skipPuzzle);
  reshuffleBtn.addEventListener("click", scatterAllPieces);

  /* ── Drag & drop (pointer events: mouse + touch) ───────── */
  const CLICK_MOVE_THRESHOLD = 6;

  function getGroupBounds(group) {
    let minX = 0, minY = 0, maxX = dispW, maxY = dispH;
    for (const p of group.pieces) {
      const [rx, ry] = rotateVec(p.localDx, p.localDy, p.rotation);
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx + dispW);
      maxY = Math.max(maxY, ry + dispH);
    }
    return { minX, minY, maxX, maxY };
  }

  function onPointerDown(e) {
    if (drag) return;
    const piece = findPieceAt(e.clientX, e.clientY);

    if (!piece || piece.group.locked) return;
    e.preventDefault();
    e.stopPropagation();

    const group = piece.group;
    const wrapRect = boardWrap.getBoundingClientRect();
    const { x: downX, y: downY } = localXY(e.clientX, e.clientY, wrapRect);
    drag = {
      group,
      offsetX: downX - group.anchorX,
      offsetY: downY - group.anchorY,
      bounds: getGroupBounds(group),
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };
    zCounter++;
    for (const p of group.pieces) {
      p.canvas.style.zIndex = zCounter;
      p.canvas.classList.add("dragging");
    }
    try { boardWrap.setPointerCapture(e.pointerId); } catch {}
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();

    if (!drag.moved) {
      const traveled = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (traveled > CLICK_MOVE_THRESHOLD) drag.moved = true;
    }

    const wrapRect = boardWrap.getBoundingClientRect();
    const { x: moveX, y: moveY } = localXY(e.clientX, e.clientY, wrapRect);
    const b = drag.bounds;
    const minAnchorX = -b.minX, maxAnchorX = Math.max(minAnchorX, boardWrap.clientWidth - b.maxX);
    const minAnchorY = -b.minY, maxAnchorY = Math.max(minAnchorY, boardWrap.clientHeight - b.maxY);

    let x = moveX - drag.offsetX;
    let y = moveY - drag.offsetY;
    x = Math.min(Math.max(minAnchorX, x), maxAnchorX);
    y = Math.min(Math.max(minAnchorY, y), maxAnchorY);

    drag.group.anchorX = x;
    drag.group.anchorY = y;
    for (const p of drag.group.pieces) placeCanvasAt(p);
  }

  function cancelDrag() {
    if (!drag) return;
    for (const p of drag.group.pieces) p.canvas.classList.remove("dragging");
    drag = null;
  }

  function onPointerEnd(e) {
    if (!drag || (e.type !== "pointercancel" && e.pointerId !== drag.pointerId)) return;

    const group = drag.group;
    const wasClick = !drag.moved && e.type !== "pointercancel";
    for (const p of group.pieces) p.canvas.classList.remove("dragging");
    try { boardWrap.releasePointerCapture(drag.pointerId); } catch {}
    drag = null;

    if (wasClick) {
      for (const p of group.pieces) {
        p.rotation += 90;
        p.canvas.style.transform = `rotate(${p.rotation}deg)`;
      }
    }

    checkConnections(group);
  }

  boardWrap.addEventListener("pointerdown", onPointerDown);
  boardWrap.addEventListener("pointermove", onPointerMove);
  boardWrap.addEventListener("pointerup", onPointerEnd);
  boardWrap.addEventListener("pointercancel", onPointerEnd);
  // Pointer events alone don't stop the storybook's page-swipe handler from
  // also seeing the same touch - stop it here so a finger on a piece drags
  // it instead of turning the page.
  boardWrap.addEventListener("touchstart", (e) => e.stopPropagation());
  boardWrap.addEventListener("touchmove", (e) => e.stopPropagation());

  /* ── Render loop: redraws each piece's clipped bitmap + outline every
     frame (cheap - it's a canvas-to-canvas blit from the static offCanvas,
     no video decode), so drag highlight and the win-fade animate smoothly.
     Gated by `active` so it doesn't run while scrolled away from this page. */
  function tick(now) {
    if (active && offCanvas) {
      // 1 normally; once solved, fades to 0 over SOLVED_FADE_MS. Drives
      // both the shadow and the green outline, so every visual trace of
      // piece edges disappears together, leaving just the flat image.
      let fadeAlpha = 1;
      if (solvedAt !== null) fadeAlpha = Math.max(0, 1 - (now - solvedAt) / SOLVED_FADE_MS);

      for (const p of pieces) {
        const w = p.canvas.width, h = p.canvas.height;
        p.ctx.clearRect(0, 0, w, h);

        if (fadeAlpha > 0.003) {
          p.ctx.save();
          p.ctx.shadowColor = `rgba(0,0,0,${0.55 * fadeAlpha})`;
          p.ctx.shadowBlur = 7;
          p.ctx.shadowOffsetY = 3;
          p.ctx.fillStyle = "#000";
          p.ctx.fill(p.path2D);
          p.ctx.restore();
        }

        p.ctx.save();
        p.ctx.clip(p.path2D);
        p.ctx.drawImage(offCanvas, p.sx - MARGIN, p.sy - MARGIN, w, h, 0, 0, w, h);
        p.ctx.restore();

        p.ctx.lineWidth = 2.5;
        let strokeStyle = null;
        if (drag && p.group === drag.group) {
          strokeStyle = "rgba(124,106,247,0.9)";
        } else if (p.group.locked) {
          const alpha = 0.85 * fadeAlpha;
          if (alpha > 0.003) strokeStyle = `rgba(48,209,88,${alpha})`;
        } else {
          strokeStyle = "rgba(0,0,0,0.55)";
        }
        if (strokeStyle) {
          p.ctx.strokeStyle = strokeStyle;
          p.ctx.stroke(p.path2D);
        }
      }

      if (taintCheckPending) {
        taintCheckPending = false;
        try { pieces[0].ctx.getImageData(0, 0, 1, 1); }
        catch (err) {
          canvasReadBlocked = true;
          console.warn("Per-pixel hit-testing disabled (canvas tainted, likely file:// origin).");
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  /* ── Public API ──────────────────────────────────────── */
  function setActive(value) {
    if (active === value) return;
    active = value;
    if (active && !rafId) rafId = requestAnimationFrame(tick);
    if (!active) {
      cancelDrag();
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }
  }

  srcImage.addEventListener("load", () => { buildOffscreen(); buildBoard(); });
  srcImage.src = src;
  bgGuide.src = src;

  return {
    setActive,
    reshuffle: scatterAllPieces,
    skip: skipPuzzle,
    getState: () => ({
      total: pieces.length,
      groupCount: pieces.length ? new Set(pieces.map((p) => p.group)).size : 0,
      solved: isSolved,
      pieces: pieces.map((p) => ({
        col: p.col, row: p.row, isCorner: p.isCorner,
        rotation: p.rotation, effRotation: effectiveRotation(p),
        cur: pieceAbsolutePos(p), home: { ...p.home }, locked: p.group.locked,
      })),
    }),
    // Test-only hooks (mirroring Puzzles' window.__test* helpers) for
    // verifying connection/snap logic without simulating pixel-perfect
    // drags. Harmless if unused; cheap enough to leave in place.
    __debugSetPos(index, x, y) {
      const p = pieces[index];
      p.group.anchorX = x - p.localDx;
      p.group.anchorY = y - p.localDy;
      for (const m of p.group.pieces) placeCanvasAt(m);
    },
    __debugSetRotation(index, deg) {
      const p = pieces[index];
      const delta = deg - p.rotation;
      for (const m of p.group.pieces) {
        m.rotation += delta;
        m.canvas.style.transform = `rotate(${m.rotation}deg)`;
        placeCanvasAt(m);
      }
    },
    __debugCheckConnections(index) { checkConnections(pieces[index].group); },
  };
}
