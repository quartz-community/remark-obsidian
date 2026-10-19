---
"@quartz-community/remark-obsidian": patch
---

A fenced block's closing delimiter below its item's content column now ends the item.

A fence opened inside a list item keeps its own shallower body lines — that already worked, and
it is why a wide-separator item can hold a fence at all. Its **closing** delimiter is different:
a closer shallower than the column the item opened with is not the item's closer at all.
Obsidian ends the item there and reads the line as a new fence at root, unclosed, running to the
end of the note.

The comparison is against the column the item **opened** with, not the running minimum. A
shallower body line legitimately lowers an item's content column as it arrives, so without that
distinction a body at two columns would make a closer at two columns look like ordinary content
— `-` four spaces `~~~` over two spaces `body` over two spaces `~~~` is one list and one code
block in Obsidian, and was one list here.

Four shapes were probed against the running application with the body and closer indents varied
independently, plus the two controls that already agreed: a closer at the item's own column
closes normally, and a closer at column zero already ended the item.
