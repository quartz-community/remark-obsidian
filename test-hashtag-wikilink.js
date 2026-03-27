import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian from "./dist/index.js";

const processor = unified().use(remarkParse).use(remarkObsidian);

// Test case: hashtag immediately before wikilink
const testCases = [
  "#tag ![[image.jpg]]",
  "#tag[[image.jpg]]",
  "#tag![[image.jpg]]",
  "text #tag ![[image.jpg]]",
];

testCases.forEach((test) => {
  console.log(`\nTesting: "${test}"`);
  try {
    const result = processor.parse(test);
    console.log("✓ Parsed successfully");
  } catch (e) {
    console.error("✗ Error:", e.message);
  }
});
