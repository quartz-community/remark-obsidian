import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian from "./dist/index.js";

const processor = unified().use(remarkParse).use(remarkObsidian);

// Test various edge cases
const testCases = [
  "#tag![[image.jpg]]",
  "#tag\n![[image.jpg]]",
  "#tag ![[image.jpg]]",
  "#tag\r![[image.jpg]]",
  "#tag\r\n![[image.jpg]]",
];

for (const markdown of testCases) {
  try {
    console.log(`Testing: ${JSON.stringify(markdown)}`);
    const result = processor.parse(markdown);
    console.log("✓ Success\n");
  } catch (error) {
    console.error(`✗ Error: ${error.message}\n`);
  }
}
