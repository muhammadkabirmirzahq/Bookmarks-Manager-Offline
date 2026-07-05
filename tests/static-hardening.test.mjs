import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
const js = await readFile("app.js", "utf8");

assert.match(html, /Content-Security-Policy/, "index.html should define a CSP");
assert.match(html, /<link rel="stylesheet" href="styles\.css">/, "styles should be loaded from styles.css");
assert.match(html, /<script type="module" src="app\.js"><\/script>/, "script should be loaded as an external module");
assert.doesNotMatch(html, /<style>/i, "inline style blocks should stay out of index.html");
assert.doesNotMatch(html, /<script>(?!<\/script>)/i, "inline script blocks should stay out of index.html");

assert.doesNotMatch(js, /\bvar\b/, "app.js should use const/let instead of var");
assert.doesNotMatch(js, /\.innerHTML\b/, "rendered UI should avoid innerHTML");
assert.doesNotMatch(js, /\balert\s*\(/, "errors should use non-blocking status UI instead of alert()");
assert.match(js, /\basync function\b/, "app.js should use async functions for async flows");
assert.match(js, /\bawait\b/, "app.js should use await for async flows");
