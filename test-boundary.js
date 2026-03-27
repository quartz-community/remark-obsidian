import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian from "./dist/index.js";

const processor = unified().use(remarkParse).use(remarkObsidian);

// Test case: hashtag immediately before wikilink with no space
// The issue might be in how the tokenizer handles the boundary
const testCases = [
  "#tag![[image.jpg]]", // No space between tag and embed
  "#tag [[image.jpg]]", // Space between tag and wikilink
  "#tag![[", // Incomplete embed
  "#tag!", // Just the exclamation
];

testCases.forEach((test) => {
  console.log(`\nTesting: "${test}"`);
  try {
    const result = processor.parse(test);
    console.log("✓ Parsed successfully");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("✗ Error:", e.message);
    console.error("Stack:", e.stack);
  }
});
