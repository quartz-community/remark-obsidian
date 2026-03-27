import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian from "./dist/index.js";

const processor = unified().use(remarkParse).use(remarkObsidian);

// Test case: hashtag immediately followed by wikilink without blank line
const markdown = "#tag![[image.jpg]]";

try {
  const result = processor.parse(markdown);
  console.log("Success:", JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Error:", error.message);
  console.error("Stack:", error.stack);
}
