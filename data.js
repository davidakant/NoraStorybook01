// Story data: 8 pages, each with exactly 2 rows (one per paragraph), stacked
// one over the other. A row normally holds a single full-width landscape
// image with its caption below it.
//
// A row can instead hold TWO images side by side (an "A" left / "B" right
// split) - list both in the row's `images` array. Each image carries its
// own optional `caption`; an image with no caption leaves its frame to fill
// the row's full height instead of sharing it with a caption box.
//
// An image's `src` can be `null` when art isn't ready yet - it renders as
// an empty placeholder frame, with its caption (if any) still shown normally.
//
// Optional per-image `pan: "down" | "up" | "left" | "right"` adds a slow,
// looping Ken Burns-style pan in that direction (see styles.css - the image
// is deliberately scaled up so there's always real room to pan within its
// own cover-crop). Each panned image gets a slightly different speed/phase
// automatically (see app.js) so they don't all move in sync. Optional
// `panScale` (default 1.3) overrides how much extra zoom the pan uses.
//
// object-fit: cover crops to the frame's shape *before* any pan runs, so if
// something important (e.g. text right at an edge) lands outside that crop,
// panning can never reveal it - fix the crop itself with `objectPosition`
// (e.g. "50% 0%" to anchor it to the top instead of centering it).
//
// Optional per-image `zoom: "top-left" | "top-right" | "bottom-left" |
// "bottom-right" | "center"` adds a slow, looping zoom anchored to that
// corner (the opposite corner grows away from it - always safe, never a
// gap, since the anchor corner's two edges stay flush with the frame at any
// zoom level). `pan` and `zoom` are mutually exclusive per image. Optional
// `zoomScale` (default 1.3) overrides how far in it zooms.
//
// Optional per-image `reveal: true` covers the image with a blurred,
// labeled "scratch card" layer (see reveal.js) that the player rubs away
// with a finger or the mouse; once ~90% of it is cleared, the rest fades
// out on its own. Optional `revealLabel` overrides the default printed
// label, and `revealThreshold` (0-1, default 0.9) overrides how much must
// be cleared before it auto-finishes.
//
// COVER_PAGE and END_PAGE are bookends, not part of the numbered story (the
// header's "Page X of 8" and the page-indicator dots both only count
// STORY). Each is a single image filling the entire screen edge to edge -
// no header, no caption, no dots while one is showing (see app.js/styles.css).
const COVER_PAGE = {
  kind: "bookend",
  src: "images/cover.webp",
  alt: "Book cover: Nora's Colorful World, A Tale of Creativity - Nora and Snowy in her art studio",
  width: 1792,
  height: 2400,
  // Optional `watermark` text stamped big/bold/red over a bookend page (see
  // .bookend-watermark in styles.css) - e.g. for marking a draft.
  watermark: "DRAFT 1",
};
const END_PAGE = {
  kind: "bookend",
  // `puzzle` turns this bookend into a jigsaw of `src` instead of a plain
  // image (see app.js's buildPuzzlePage / puzzle.js). cols/rows must evenly
  // divide the image's pixel dimensions for clean, equal-sized pieces.
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
    rows: [
      {
        images: [
          {
            src: "images/p1-1a.webp",
            alt: "Nora celebrating a 1st place finish at a swim meet",
            width: 1790,
            height: 2400,
            pan: "up",
            objectPosition: "50% 18%",
            caption:
              "Nora, with her big blue eyes and a determined smile, was not just any fourth grader. She was a champion competitive swimmer.",
          },
          {
            src: "images/p1-1b.webp",
            alt: "Nora eating a big bowl of macaroni and cheese with Snowy at her feet",
            width: 2750,
            height: 1536,
            pan: "right",
            caption:
              "After a big swim meet win, she enjoyed a huge bowl of her favorite creamy macaroni and cheese. Her loyal puppy, Snowy the Bichon, sat patiently by her feet.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p1-2.webp",
            alt: "Nora asleep in bed, dreaming of becoming an art teacher, with Snowy curled up on the rug",
            width: 2752,
            height: 1536,
            pan: "left",
            panScale: 1.08,
            caption:
              "Later, she practiced a happy tune on the piano, brushed her teeth, and went to bed. She fell asleep peacefully, dreaming of her goal to become an art teacher.",
          },
        ],
      },
    ],
  },
  {
    page: 2,
    title: "A Painted World",
    rows: [
      {
        images: [
          {
            src: "images/p2-1.webp",
            alt: "Nora floating in a swirling Starry Night-like painted universe",
            width: 2752,
            height: 1536,
            pan: "left",
            panScale: 1.1,
            caption:
              "When Nora opened her eyes, she was floating in a magical universe of thick, swirling paint. The deep blue background and yellow stars looked exactly like her favorite masterpiece, Starry Night. She was wearing a simple pink t-shirt.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p2-2.webp",
            alt: "The painted rivers below receding into a dusty, cracked terrain",
            width: 2752,
            height: 1536,
            pan: "right",
            panScale: 1.1,
            caption:
              "Down below, beautiful painted rivers, which should be full of color and movement, were beginning to dry up and disappear. Underneath, the dusty, cracked ground was turning into an empty canvas.",
          },
        ],
      },
    ],
  },
  {
    page: 3,
    title: "The Eraser",
    rows: [
      {
        images: [
          {
            src: "images/p3-1a.webp",
            alt: "The Eraser, a grumpy villain in a gray eraser costume, standing on the dry cracked terrain",
            width: 1536,
            height: 2752,
            caption: "Standing on the dry terrain was a short, grumpy villain named The Eraser.",
          },
          {
            src: "images/p3-1b.webp",
            alt: "Snowy barking next to The Eraser's giant industrial vacuum",
            width: 1407,
            height: 768,
            zoom: "top-right",
            caption: "He climbed aboard his evil contraption, The Eraser Vac, and it began to sputter and snarl.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p3-2.webp",
            alt: "The Eraser's vacuum sucking up swirling paint-water",
            width: 2752,
            height: 1536,
            caption:
              "The vacuum was sucking up all the swirling, beautiful colors, and spewing out clouds of gray dust. “I hate swimming, and I hate wet paint!” he grumbled. “I am going to turn this world into a boring, dry gray canvas!”",
          },
        ],
      },
    ],
  },
  {
    page: 4,
    title: "Aqua Artist",
    rows: [
      {
        images: [
          {
            src: "images/p4-1a.webp",
            alt: "Nora transforming, eyes shut, swirling pink energy surrounding her",
            width: 1376,
            height: 768,
            caption:
              "Nora knew she had to stop him. Squeezing her eyes shut, a swirling pink energy with sparkling light surrounded her. She was now the incredible Aqua Artist!",
          },
          {
            src: "images/p4-1b.webp",
            alt: "Nora fully transformed into the superhero Aqua Artist",
            width: 2752,
            height: 1536,
            zoom: "center",
            reveal: true,
          },
        ],
      },
      {
        images: [
          {
            src: "images/p4-2a.webp",
            alt: "Aqua Artist soaring through the swirling paint sky in her pink cape",
            width: 1376,
            height: 768,
            caption:
              "She wore a shimmering pink superhero suit and a flowing pink cape with a palette symbol. She soared through the swirling painted sky using her powerful butterfly stroke. “You can’t erase art or color!” she cheered.",
          },
        ],
      },
    ],
  },
  {
    page: 5,
    title: "Music Into Water",
    rows: [
      {
        images: [
          {
            src: "images/p5-1.webp",
            alt: "Aqua Artist playing a floating grand piano, notes turning into water drops",
            width: 1376,
            height: 768,
            pan: "down",
            caption:
              "Aqua Artist Nora landed perfectly on a large grand piano magically floating in the painted sky. She played a quick, joyful melody. Out of the piano, a cascade of sparkling energy notes fell like a waterfall of fresh paint drops to the dry, cracked ground below.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p5-2.webp",
            alt: "Snowy digging in the dirt as water splashes and green vines unfurl",
            width: 1376,
            height: 768,
            caption:
              "Snowy dug fast at the ground. The paint drops splashed and exploded into sparkling blue puddles. Thick vines with large green leaves grew quickly, spreading out over the gray ground.",
          },
        ],
      },
    ],
  },
  {
    page: 6,
    title: "The Final Pop",
    rows: [
      {
        images: [
          {
            src: "images/p6-1.webp",
            alt: "Giant sunflowers and hydrangeas bursting open as vines crush The Eraser's vacuum",
            width: 1376,
            height: 768,
            pan: "down",
            caption:
              "Giant, bright yellow sunflowers and huge, puffy blue hydrangeas burst and sprouted from the vines and tangled around The Eraser's vacuum. With a large “POP!”, the clunky vacuum broke, and a puff of smoke burst from its top.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p6-2.webp",
            alt: "Aqua Artist and Snowy diving into the restored, swirling paint river",
            width: 1376,
            height: 768,
            pan: "left",
            caption:
              "The Eraser grumbled from the shadows and ran away into the grayness, while a beautiful, swirling paint river filled the landscape once again. Aqua Artist Nora and Snowy dove in, making a colorful splash. Suddenly, the warm morning sun woke Nora up from her dream.",
          },
        ],
      },
    ],
  },
  {
    page: 7,
    title: "Bringing the Magic to Life",
    rows: [
      {
        images: [
          {
            src: "images/p7-1.webp",
            alt: "Nora waking up with a big smile, scooping up Snowy",
            width: 1376,
            height: 768,
            caption:
              "Nora woke up with the biggest smile, her heart full of the magical adventure she had just shared with Snowy. She knew it was a dream, but it felt so real, and it gave her a brilliant idea. She jumped out of bed, scooped up Snowy, and ran to her art desk.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p7-2.webp",
            alt: "Nora drawing Aqua Artist, Snowy, and The Eraser on paper",
            width: 1376,
            height: 768,
            caption:
              "Pulling out her pencils and markers, Nora started to draw. On the paper, Aqua Artist Nora soared with her sparkling pink cape, while Snowy dug for music-notes. Nearby, The Eraser grumbled from the shadows among giant sunflowers and swirling rivers.",
          },
        ],
      },
    ],
  },
  {
    page: 8,
    title: "A Colorful Future",
    rows: [
      {
        images: [
          {
            src: "images/p8-1.webp",
            alt: "Nora in her art-filled bedroom, surrounded by her drawings",
            width: 1408,
            height: 768,
            caption:
              "Nora had saved the day, and now she was bringing the magic to life with her art, exactly as she wanted to do as a future art teacher. She realized that even when she wasn't a superhero, she could still use her creativity to make the world a more colorful, wonderful place.",
          },
        ],
      },
      {
        images: [
          {
            src: "images/p8-2.webp",
            alt: "Nora and Snowy surrounded by all her favorite things - the painted river, piano, starry sky, and flowers - living happily together",
            width: 1376,
            height: 768,
            caption:
              "She had vanquished The Eraser in her mind, and now she was creating a future where all her favorite things lived happily together. With Snowy by her side, Nora felt like the bravest, most artistic girl in the entire world.",
          },
        ],
      },
    ],
  },
];
