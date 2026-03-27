// Patch String.fromCodePoint to see what values are being passed
const originalFromCodePoint = String.fromCodePoint;
String.fromCodePoint = function (...args) {
  console.log("String.fromCodePoint called with:", args);
  if (args[0] < 0) {
    console.trace("Negative code point!");
  }
  return originalFromCodePoint.apply(this, args);
};

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian from "./dist/index.js";

const processor = unified().use(remarkParse).use(remarkObsidian);

try {
  console.log("Testing: '#tag ![[image.jpg]]'");
  const result = processor.parse("#tag ![[image.jpg]]");
  console.log("Success");
} catch (error) {
  console.error("Error:", error.message);
}
