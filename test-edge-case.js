import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian from "./dist/index.js";

const processor = unified().use(remarkParse).use(remarkObsidian);

// Edge cases that might trigger the issue
const testCases = [
  "#tag![[image.jpg]]", // Normal case
  "#tag\u0000![[image.jpg]]", // Null between tag and embed
];

testCases.forEach((test, i) => {
  console.log(`\nTest ${i}: ${JSON.stringify(test)}`);
  try {
    const result = processor.parse(test);
    console.log("✓ Parsed successfully");
  } catch (e) {
    console.error("✗ Error:", e.message);
  }
});
