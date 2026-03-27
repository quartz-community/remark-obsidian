import { tokenize } from "micromark";

const markdown = "#tag ![[image.jpg]]";
const tokens = tokenize(markdown);

console.log("Tokens:");
tokens.forEach((token, i) => {
  console.log(
    `${i}: type=${token.type}, start=${token.start}, end=${token.end}`,
  );
});
