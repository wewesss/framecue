import { readQueue, updateItem } from "./queue";

const [root, tag, count] = process.argv.slice(2) as [string, string, string];
const n = Number(count);
const items = (await readQueue(root)).filter((it) => it.comment === `todo-${tag}`);
if (items.length !== n) throw new Error(`worker ${tag}: expected ${n} items, got ${items.length}`);
await Promise.all(
  items.map((it, i) =>
    updateItem(root, it.id, { comment: `done-${tag}-${i}`, priority: it.priority }),
  ),
);
