---
name: screenshot-ui
description: Render this storybook (a static HTML/CSS/JS app, no build/dev server) headlessly and capture a screenshot to verify a UI change. Use after editing index.html/styles.css/app.js/data.js/puzzle.js/reveal.js, whenever you'd otherwise ask the user to "check if this looks right" - confirm it yourself first.
---

# Screenshotting this app

This repo is plain static files opened directly via `file://` - there is no
`npm run dev`, no Node, no Python, and no `chromium-cli` in this environment.
What *is* available: Edge and Chrome are both installed as normal desktop
apps, and both support a one-shot headless screenshot flag. No installs
needed.

## Binaries

Check both before picking one (paths are the standard Windows install
locations):

```bash
ls "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
ls "/c/Program Files/Google/Chrome/Application/chrome.exe"
```

Either works identically for this recipe; the examples below use Edge.

## Static screenshot (page as it loads)

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu \
  --user-data-dir="<scratchpad>/edgeprofile" \
  --screenshot="<scratchpad>/out.png" \
  --window-size=820,1180 \
  "file:///c:/Users/david/WebDev/NoraStorybook01/index.html"
```

Then view it with the Read tool on `<scratchpad>/out.png`.

Notes:
- **Always pass a fresh `--user-data-dir`** under the scratchpad. Without it,
  Edge silently fails to write the screenshot (no error, exit 0, no file) if
  your real Edge profile is already running. Use a new subfolder per shot to
  avoid lock conflicts; delete the profile dirs when done.
- `--window-size=820,1180` matches this app's fixed design canvas
  (`CANVAS_W`/`CANVAS_H` in `app.js` - grep for those constants in case
  they've changed). The app scales its whole canvas to fit the viewport
  (`fitStage()` in app.js), so the window size just needs to roughly match
  the canvas aspect ratio to avoid letterboxing.
- The page always opens on the cover (page index 0). The static screenshot
  is only useful for verifying the cover/bookend pages as-is.

## Screenshotting a specific page or interaction state

The book is a single-page JS app (`app.js`) with no URL-based deep linking -
you can't just navigate to `index.html#page=3`. To check a specific page or
post-click state (e.g. a sequential-reveal page after tapping "next"
twice), drive it with a **temporary** injected script, capture, then revert:

1. Add a temporary `<script>` block right after the `app.js` `<script>` tag
   in `index.html` that fires the interaction via `setTimeout`, e.g.:
   ```html
   <script>
     setTimeout(() => document.querySelector(".seq-arrow--next")?.click(), 200);
     setTimeout(() => document.querySelector(".seq-arrow--next")?.click(), 600);
   </script>
   ```
   To jump straight to a specific page instead of clicking through, it's
   often faster to temporarily edit `let current = 0;` near the top of
   `app.js` to the target page index (0 = cover, 1 = story page 1, ...).
2. Screenshot with `--virtual-time-budget` so injected `setTimeout` calls
   actually get to fire before the page is captured (a plain `--screenshot`
   run captures right at `load` and won't wait for them). Always pair it
   with `--run-all-compositor-stages-before-draw` - without it you can get
   a stale/blank paint even though the DOM state is already correct (see
   the gotcha below):
   ```bash
   "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
     --headless=new --run-all-compositor-stages-before-draw \
     --user-data-dir="<scratchpad>/edgeprofile2" \
     --virtual-time-budget=2000 \
     --screenshot="<scratchpad>/out.png" \
     --window-size=820,1180 \
     "file:///c:/Users/david/WebDev/NoraStorybook01/index.html"
   ```
3. **Immediately revert** the temporary `index.html`/`app.js` edits with the
   Edit tool (don't just leave them and remember to undo later) and delete
   the scratch `--user-data-dir` folders. Confirm with `git diff` that only
   your real, intended changes remain before reporting the task done.

## Gotchas hit in practice

- **Every page is in the DOM at once** (the "pages-rail" holds all of them,
  shifted via transform). A bare selector like
  `document.querySelector(".seq-arrow--next")` grabs the *first* match in
  DOM order - i.e. page 1's button - even when you jumped `current` to a
  later page. Scope it: `'[aria-label^="Page 3"] .seq-arrow--next'` (pages
  get `aria-label="Page N: Title"` in `buildPage`). It doesn't matter which
  DOM button you `.click()` though - the click handlers all close over the
  same shared `cardIndex`/`advance()`/`goBack()`, so any of a page's own
  buttons drives that page's state correctly.
- **A `--screenshot` taken right after a script swaps an `<img src>` late
  can capture a stale/blank frame**, even with a generous
  `--virtual-time-budget` (seen as high as 15000ms still blank). Confirmed
  by dumping `img.complete`/`naturalWidth`/`currentSrc`/`getBoundingClientRect()`
  (see the diagnostic recipe below) and finding the DOM was already 100%
  correct while the screenshot pixels weren't - i.e. the renderer's
  compositor hadn't caught up to the virtual clock at the moment the
  screenshot was grabbed. Dropping `--disable-gpu` *sometimes* masks this
  (it did once, then didn't reproduce a second time under near-identical
  conditions) - don't trust it as the fix. The actual fix is adding
  `--run-all-compositor-stages-before-draw` alongside
  `--virtual-time-budget`; that combination has been reliable. If a
  post-interaction screenshot looks wrong but the DOM diagnostic says it's
  right, add that flag before assuming it's a real bug:
  ```bash
  --headless=new --run-all-compositor-stages-before-draw --virtual-time-budget=8000 --screenshot=...
  ```
- **Kill your own headless instances when done, not the user's browser.**
  Every `--headless` launch spawns a full `msedge.exe` process tree that
  outlives the launching command (it detaches). These silently accumulate
  across a session. Clean up by filtering on your scratchpad path, never by
  bare process name:
  ```powershell
  Get-CimInstance Win32_Process -Filter "name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*scratchpad*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```
- **`--dump-dom` doesn't work in this environment** - it returns exit 0 but
  writes nothing, even for a trivial static page, even with
  `--virtual-time-budget`. Don't rely on it for extracting computed page
  state/text.

## Getting data out of the page (not just a screenshot)

When you need actual values back (e.g. "did this `<img>` really decode?",
or converting an image format - see below), `--dump-dom` won't work. Instead
have the page `fetch()` a POST to a tiny local listener:

1. Start a one-shot HTTP listener in PowerShell (background task):
   ```powershell
   $listener = New-Object System.Net.HttpListener
   $listener.Prefixes.Add("http://localhost:8932/")
   $listener.Start()
   $async = $listener.BeginGetContext($null, $null)
   if ($async.AsyncWaitHandle.WaitOne(60000)) {
     $context = $listener.EndGetContext($async)
     $body = (New-Object System.IO.StreamReader($context.Request.InputStream)).ReadToEnd()
     Set-Content -Path "<scratchpad>/out.txt" -Value $body -NoNewline -Encoding UTF8
     $buf = [System.Text.Encoding]::UTF8.GetBytes("OK")
     $context.Response.OutputStream.Write($buf, 0, $buf.Length)
     $context.Response.OutputStream.Close()
   }
   $listener.Stop()
   ```
2. From the page (injected temp script, same pattern as above), `fetch`
   whatever you want to inspect to it: `fetch("http://localhost:8932/upload", {method:"POST", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(data)})`.
   A file:// page posting to http://localhost works fine - no CORS setup
   needed for a fire-and-forget POST with a simple-request content type.
3. Launch the browser as a **normal (non-headless-screenshot) navigation**,
   not `--screenshot`/`--dump-dom` - just `msedge --headless=new
   --user-data-dir=... "file:///...index.html"` - and give it a few real
   seconds (plain `sleep`, since there's no virtual-time budget governing
   a real `fetch`). Then read `<scratchpad>/out.txt`.
4. Start the listener *immediately* before the browser launch - don't do
   other work in between. The listener's wait window is wall-clock; eating
   it on unrelated tool calls before the browser even launches causes a
   spurious timeout.

## Converting an image to WebP (no installs)

This project keeps art as `.webp`, but there's no `cwebp`/ImageMagick/sharp
in this environment. Headless Chromium can do the encoding itself via
canvas: load the source into an `<img>`, draw it to a `<canvas>`, then
`canvas.toDataURL("image/webp", 0.9)`. Get the data URL out via the local
HTTP listener above (it's large - base64 of the whole image - which is
fine, just don't try to pull it through `--dump-dom`/stdout). Launch with
`--allow-file-access-from-files` or the canvas read throws
`SecurityError: Tainted canvases may not be exported` for a `file://` source
image. Decode the returned base64 and write it with .NET
(`[System.IO.File]::WriteAllBytes`) rather than shelling out to anything -
nothing extra to install.

## What this doesn't cover

- Real pointer drag/pinch gestures (pan-zoom on images) aren't practical to
  simulate this way - reading the relevant `app.js` logic is more reliable
  than trying to fake pointer events for those.
- Multi-step user flows across many pages are easier verified by editing
  `current` directly to the target page than by chaining dozens of injected
  clicks.
