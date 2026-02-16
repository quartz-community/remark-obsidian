import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkObsidian from "./dist/index.js";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkRehype)
  .use(rehypeStringify);

const md = `- [?] question
- [x] done
- [ ] todo`;

const result = processor.processSync(md);
console.log("HTML Output:");
console.log(result.toString());
