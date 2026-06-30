// Production build: concatenate + minify all JS into one bundle, minify
// CSS and HTML, copy images. Output goes to dist/ which Netlify deploys.
// Run with: npm run build
const { minify } = require("terser");
const CleanCSS = require("clean-css");
const { minify: minifyHtml } = require("html-minifier-terser");
const fs = require("fs");
const path = require("path");

const DIST = "dist";

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST);
fs.mkdirSync(path.join(DIST, "images"));

async function main() {
  // JS: load all four scripts in the same order the HTML does, concatenate
  // into one string, then minify as a single unit. A single output file
  // also removes four separate HTTP requests.
  const jsSources = ["data.js", "puzzle.js", "reveal.js", "app.js"]
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");

  const { code } = await minify(jsSources, {
    compress: { drop_console: false },
    mangle: true,
    format: { comments: false },
  });
  fs.writeFileSync(path.join(DIST, "bundle.min.js"), code);

  // CSS: Level 2 cleans up redundant rules, merges media queries, etc.
  const { styles } = new CleanCSS({ level: 2 }).minify(
    fs.readFileSync("styles.css", "utf8")
  );
  fs.writeFileSync(path.join(DIST, "styles.css"), styles);

  // HTML: rewrite the four separate <script> tags to one bundle reference,
  // then collapse all whitespace/comments.
  let html = fs.readFileSync("index.html", "utf8");
  html = html
    .replace(/\s*<script src="data\.js"><\/script>/g, "")
    .replace(/\s*<script src="puzzle\.js"><\/script>/g, "")
    .replace(/\s*<script src="reveal\.js"><\/script>/g, "")
    .replace(
      /<script src="app\.js"><\/script>/,
      '<script src="bundle.min.js"></script>'
    );
  html = await minifyHtml(html, {
    removeComments: true,
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
  });
  fs.writeFileSync(path.join(DIST, "index.html"), html);

  // Images: copy unchanged - already compressed to WebP during authoring.
  for (const file of fs.readdirSync("images")) {
    fs.copyFileSync(
      path.join("images", file),
      path.join(DIST, "images", file)
    );
  }

  // Print a quick size summary.
  console.log("dist/ built:");
  for (const f of ["bundle.min.js", "styles.css", "index.html"]) {
    const kb = (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(1);
    console.log(`  ${f.padEnd(20)} ${kb} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
