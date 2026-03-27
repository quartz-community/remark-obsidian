// Test what happens when String.fromCodePoint receives -4
try {
  const result = String.fromCodePoint(-4);
  console.log("Result:", result);
} catch (e) {
  console.error("Error:", e.message);
}

// Test the regex with invalid code point
const tagCharRegex = /[\p{L}\p{M}\p{Emoji}]/u;
try {
  const result = tagCharRegex.test(String.fromCodePoint(-4));
  console.log("Regex test result:", result);
} catch (e) {
  console.error("Regex error:", e.message);
}

// Test what -4 could represent
console.log("\nCode point -4 analysis:");
console.log("Is -4 a valid code point?", -4 >= 0 && -4 <= 0x10ffff);
console.log("Max valid code point:", 0x10ffff);
