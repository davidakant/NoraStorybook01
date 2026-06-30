// Story data: every page (including the cover/end bookends) is built from a
// fixed, named `layout` plus a flat `images` array - no more rows-of-rows.
// The five layouts:
//   "full"      - 1 image filling the whole page
//   "1-over-1"  - 2 images, stacked (one full-width row over another)
//   "2-over-1"  - 3 images: a split (2 side-by-side) row over a solo row
//   "1-over-2"  - 3 images: a solo row over a split row
//   "2-over-2"  - 4 images: a split row over a split row
// `images` is listed in reading order: row 1 first (left-to-right if split),
// then row 2. The layout name alone tells the renderer how to slice the
// array (see LAYOUT_ROWS in app.js).
//
// Every image, gap between images, and margin around the page is a fixed
// pixel value on the 820x1180 design canvas (see CANVAS_W/H in app.js) -
// nothing here is responsive. The whole canvas scales uniformly to fit
// whatever screen it's shown on, so what's authored here is exactly what's
// seen everywhere, just zoomed in or out. Images are never panned or
// zoomed - object-fit: cover fits each one into its fixed slot once, and
// it never moves again.
//
// `width`/`height` per image are informational only now (the original
// asset's real pixel dimensions, for your own record-keeping) - they don't
// drive any layout math. Optional `objectPosition` (CSS object-position
// syntax, e.g. "50% 0%") nudges which part of the image survives object-fit:
// cover's crop into its slot, when the source asset's ratio doesn't match
// the slot's ratio.
//
// Since text now overlays the image instead of sitting in its own box below
// it, each image can carry a text zone:
//   `textZone`: "banner" | "card" | "bubble" | "modal"
//   `textZonePosition`: "top" | "bottom" | "left" | "right" (banner/card only,
//      default "bottom"); ignored by bubble (which uses bubbleX/bubbleY,
//      a point anchor in % of the slot, since it has to point at something
//      specific in the art) and modal (always centered).
//   `caption`: a plain string (shown all at once), or an array of strings -
//      each one a "beat" - shown one at a time with a Next button to advance.
// An image with no `textZone`/`caption` just has no overlay.
//
// Optional `beatImages`: an array of image paths, same length as `caption`,
// used only on `sequentialReveal` pages (see buildSequentialZones in app.js).
// Swaps this slot's image alongside the caption as each beat advances -
// `src` is what's shown (and preloaded) first; `beatImages[i]` is shown
// once beat `i` is reached. Leave it off for slots whose art doesn't change
// between sentences.
//
// Optional page-level `sequentialReveal: true` (see buildSequentialZones in
// app.js) turns a multi-image page into one combined reveal sequence
// instead of every card independently advancing: only one image's card is
// visible at a time. Tapping its arrow fades to that card's next beat;
// once a card's last beat is showing, tapping again hides it and reveals
// the next image's card at its first beat. Every image on a page like this
// should have its `caption` as an array, even if some only have one beat.
//
// Optional per-image `reveal: true` covers the image with a blurred,
// labeled "scratch card" layer (see reveal.js) that the player rubs away
// with a finger or the mouse; once ~90% of it is cleared, the rest fades
// out on its own. Optional `revealLabel` overrides the default printed
// label, and `revealThreshold` (0-1, default 0.9) overrides how much must
// be cleared before it auto-finishes. Optional `revealLocked: true` (only
// meaningful alongside `sequentialReveal`) starts the scratch-off blurred
// but inert and with no printed label, so it doesn't give itself away or
// invite scratching before the reader reaches this image's own card in the
// sequence; reaching it permanently unlocks scratching and reveals the
// label (see the `revealHandle`/`unlock()` wiring in buildSequentialZones).
//
// Optional per-image `miniGame` (only meaningful alongside
// `sequentialReveal`) plants a small game inside one specific beat of this
// image's own card, gating that card's Next arrow until it's won.
// `beatIndex` (0-based) says which beat shows/starts it. Two types:
//   `type: "piano"` (see createPianoGame in app.js) - a playable
//      one-octave C-to-B keyboard; `minNotes` is how many key presses
//      (any notes, repeats count) complete it.
//   `type: "saturationSlider"` (see createSaturationReveal in reveal.js) -
//      this image renders fully desaturated from the moment the page
//      loads (independent of `beatIndex`/which card is active); reaching
//      `beatIndex` reveals a draggable vertical handle the reader slides
//      left-to-right to restore full color. Optional `threshold` (0-1,
//      default 0.96) is how far the drag must reach to count as done.
//
// COVER_PAGE and END_PAGE are bookends, not part of the numbered story (the
// header's "Page X of 8" and the page-indicator dots both only count
// STORY). Optional `watermark` text stamps over a bookend page (see
// .bookend-watermark in styles.css). END_PAGE's optional `puzzle` turns it
// into a jigsaw of `src` instead of a normal image page (see puzzle.js);
// cols/rows must evenly divide the image's pixel dimensions for clean,
// equal-sized pieces - it reads `src`/`alt` directly rather than from
// `images`, since the puzzle bypasses the normal layout renderer entirely.
const COVER_PAGE = {
  kind: "bookend",
  layout: "full",
  watermark: "DRAFT 2",
  images: [
    {
      src: "images/cover.webp",
      alt: "Book cover: Nora's Colorful World, A Tale of Creativity - Nora and Snowy in her art studio",
      width: 1792,
      height: 2400,
    },
  ],
};
const END_PAGE = {
  kind: "bookend",
  layout: "full",
  puzzle: { cols: 4, rows: 6 },
  src: "images/the-end.webp",
  alt: "The End - Nora and Snowy waving goodbye among sunflowers and a starry painted sky",
  width: 896,
  height: 1200,
};

const STORY = [
  {
    page: 1,
    title: "An Ordinary Night",
    layout: "2-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p1-1a.webp",
        alt: "Nora celebrating a 1st place finish at a swim meet",
        width: 1790,
        height: 2400,
        objectPosition: "50% 18%",
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Nora, with her big blue eyes and a determined smile, was not just any fourth grader.",
          "She was a champion competitive swimmer.",
        ],
      },
      {
        src: "images/p1-1b.png",
        alt: "Nora eating a big bowl of macaroni and cheese with Snowy at her feet",
        width: 848,
        height: 1264,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "After a big swim meet win, she enjoyed a huge bowl of her favorite creamy macaroni and cheese.",
          "Her loyal puppy, Snowy the Bichon, sat patiently by her feet.",
        ],
      },
      {
        src: "images/p1-2.webp",
        alt: "Nora asleep in bed, dreaming of becoming an art teacher, with Snowy curled up on the rug",
        width: 2752,
        height: 1536,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Later, she practiced a happy tune on the piano, brushed her teeth, and went to bed.",
          "She fell asleep peacefully, dreaming of her goal to become an art teacher.",
        ],
      },
    ],
  },
  {
    page: 2,
    title: "A Painted World",
    layout: "1-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p2-1.webp",
        alt: "Nora floating in a swirling Starry Night-like painted universe",
        width: 2752,
        height: 1536,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "When Nora opened her eyes, she was floating in a magical universe of thick, swirling paint.",
          "The deep blue background and yellow stars looked exactly like her favorite masterpiece, Starry Night.",
          "She was wearing a simple pink t-shirt.",
        ],
      },
      {
        src: "images/p2-2a.webp",
        alt: "The painted rivers below, still full of vibrant, swirling color",
        width: 2748,
        height: 1536,
        textZone: "card",
        textZonePosition: "bottom",
        beatImages: ["images/p2-2a.webp", "images/p2-2b.webp"],
        caption: [
          "Down below, beautiful painted rivers, which should be full of color and movement, were beginning to dry up and disappear.",
          "Underneath, the dusty, cracked ground was turning into an empty canvas.",
        ],
      },
    ],
  },
  {
    page: 3,
    title: "The Eraser",
    layout: "2-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p3-1a.png",
        alt: "The Eraser, a grumpy villain in a gray eraser costume, standing on the dry cracked terrain",
        width: 1696,
        height: 2528,
        textZone: "card",
        textZonePosition: "bottom",
        caption: ["Standing on the dry terrain was a short, grumpy villain named The Eraser."],
      },
      {
        src: "images/p3-1b.png",
        alt: "Snowy barking next to The Eraser's giant industrial vacuum",
        width: 1696,
        height: 2528,
        textZone: "card",
        textZonePosition: "bottom",
        caption: ["He climbed aboard his evil contraption, The Eraser Vac, and it began to sputter and snarl."],
      },
      {
        src: "images/p3-2.webp",
        alt: "The Eraser's vacuum sucking up swirling paint-water",
        width: 2752,
        height: 1536,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "The vacuum was sucking up all the swirling, beautiful colors, and spewing out clouds of gray dust.",
          "“I hate swimming, and I hate wet paint!” he grumbled.",
          "“I am going to turn this world into a boring, dry gray canvas!”",
        ],
      },
    ],
  },
  {
    page: 4,
    title: "Aqua Artist",
    layout: "2-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p4-1a.webp",
        alt: "Nora transforming, eyes shut, swirling pink energy surrounding her",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Nora knew she had to stop him.",
          "Squeezing her eyes shut, a swirling pink energy with sparkling light surrounded her.",
        ],
      },
      {
        src: "images/p4-1b.webp",
        alt: "Nora fully transformed into the superhero Aqua Artist",
        width: 2752,
        height: 1536,
        textZone: "card",
        textZonePosition: "bottom",
        reveal: true,
        revealLocked: true,
        caption: ["She was now the incredible Aqua Artist!"],
      },
      {
        src: "images/p4-2a.png",
        alt: "Aqua Artist soaring through the swirling paint sky in her pink cape",
        width: 1264,
        height: 848,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "She wore a shimmering pink superhero suit and a flowing pink cape with a palette symbol.",
          "She soared through the swirling painted sky using her powerful butterfly stroke.",
          "“You can’t erase art or color!” she cheered.",
        ],
      },
    ],
  },
  {
    page: 5,
    title: "Music Into Water",
    layout: "1-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p5-1.webp",
        alt: "Aqua Artist playing a floating grand piano, notes turning into water drops",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        miniGame: { type: "piano", beatIndex: 1, minNotes: 10 },
        caption: [
          "Aqua Artist Nora landed perfectly on a large grand piano magically floating in the painted sky.",
          "She played a quick, joyful melody.",
          "Out of the piano, a cascade of sparkling energy notes fell like a waterfall of fresh paint drops to the dry, cracked ground below.",
        ],
      },
      {
        src: "images/p5-2.webp",
        alt: "Snowy digging in the dirt as water splashes and green vines unfurl",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Snowy dug fast at the ground.",
          "The paint drops splashed and exploded into sparkling blue puddles.",
          "Thick vines with large green leaves grew quickly, spreading out over the gray ground.",
        ],
      },
    ],
  },
  {
    page: 6,
    title: "The Final Pop",
    layout: "1-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p6-1.webp",
        alt: "Giant sunflowers and hydrangeas bursting open as vines crush The Eraser's vacuum",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Giant, bright yellow sunflowers and huge, puffy blue hydrangeas burst and sprouted from the vines and tangled around The Eraser's vacuum.",
          "With a large “POP!”, the clunky vacuum broke, and a puff of smoke burst from its top.",
        ],
      },
      {
        src: "images/p6-2.webp",
        alt: "Aqua Artist and Snowy diving into the restored, swirling paint river",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        miniGame: { type: "saturationSlider", beatIndex: 1 },
        caption: [
          "The Eraser grumbled from the shadows and ran away into the grayness, while a beautiful, swirling paint river filled the landscape once again.",
          "Aqua Artist Nora and Snowy dove in, making a colorful splash.",
          "Suddenly, the warm morning sun woke Nora up from her dream.",
        ],
      },
    ],
  },
  {
    page: 7,
    title: "Bringing the Magic to Life",
    layout: "1-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p7-1.webp",
        alt: "Nora waking up with a big smile, scooping up Snowy",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Nora woke up with the biggest smile, her heart full of the magical adventure she had just shared with Snowy.",
          "She knew it was a dream, but it felt so real, and it gave her a brilliant idea.",
          "She jumped out of bed, scooped up Snowy, and ran to her art desk.",
        ],
      },
      {
        src: "images/p7-2.webp",
        alt: "Nora drawing Aqua Artist, Snowy, and The Eraser on paper",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Pulling out her pencils and markers, Nora started to draw.",
          "On the paper, Aqua Artist Nora soared with her sparkling pink cape, while Snowy dug for music-notes.",
          "Nearby, The Eraser grumbled from the shadows among giant sunflowers and swirling rivers.",
        ],
      },
    ],
  },
  {
    page: 8,
    title: "A Colorful Future",
    layout: "1-over-1",
    sequentialReveal: true,
    images: [
      {
        src: "images/p8-1.webp",
        alt: "Nora in her art-filled bedroom, surrounded by her drawings",
        width: 1408,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "Nora had saved the day, and now she was bringing the magic to life with her art, exactly as she wanted to do as a future art teacher.",
          "She realized that even when she wasn't a superhero, she could still use her creativity to make the world a more colorful, wonderful place.",
        ],
      },
      {
        src: "images/p8-2.webp",
        alt: "Nora and Snowy surrounded by all her favorite things - the painted river, piano, starry sky, and flowers - living happily together",
        width: 1376,
        height: 768,
        textZone: "card",
        textZonePosition: "bottom",
        caption: [
          "She had vanquished The Eraser in her mind, and now she was creating a future where all her favorite things lived happily together.",
          "With Snowy by her side, Nora felt like the bravest, most artistic girl in the entire world.",
        ],
      },
    ],
  },
];
