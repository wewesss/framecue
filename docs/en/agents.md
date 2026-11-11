# Handing the queue to an agent

📖 English · [Français](../fr/agents.md)

[← Back to the README](../../README.md)

---

The queue is plain files: `.framecue/queue.jsonl` and `.framecue/frames/<id>/*.png`, next to the video ([queue format](./queue-format.md)). Any agent that can read files can use them. framecue adds three ways to hand the queue over, from the lightest to the most integrated: the clipboard, an MCP server, and a Claude Code plugin.

<p align="center">
  <img src="../../.github/assets/fix-loop.gif" alt="The agent marks items fixed through MCP and the player shows a toast, then a new render is detected and an item is verified">
</p>

---

## Copy for the agent

The footer of the queue panel has a **Copy for the agent** button (`Shift+C`). It copies the items that are **To do** or **Reopened**, by priority, as Markdown. The button is disabled when there is nothing to copy. A toast confirms it: "Copied · 3 item(s) · Markdown".

The chevron next to the button, **Other copy formats**, offers:

- Markdown (to do + reopened)
- JSONL (to do + reopened)
- All displayed items · Markdown
- All displayed items · JSONL

"All displayed items" follows the status filter of the queue. To copy a single item, open its **More actions** menu and pick **Copy for the agent (Markdown)** or **Copy for the agent (JSONL)**.

### Markdown

A prompt for a coding agent. It starts with a header: the video path, the resolution, the frame rate and the frame count, the workspace folder, and how to report back (call `mark_fixed(id, note)`, or tell you; only you mark an item verified). Then one section per item:

```text
### #2 · region · frame 150 (00:00:05:00)
- id: fc_xxxxxxxxxxxx
- status: todo
- comment:
  > Name overlaps the DIRECTOR line
- regions:
  - region 1 (blue): normalised 0–1 x=0.1 y=0.2 w=0.3 h=0.1; in source pixels (1920x1080): x=192 y=216 w=576 h=108
- images (before):
  - frame 150: /path/to/.framecue/frames/fc_xxxxxxxxxxxx/frame.png
```

The heading carries the position in the whole queue, the kind, the frames and the timecode. A frame item reads `frame 150`, and a range or a region over a range reads `frames 250–290`. Items also list:

- every region, numbered from 1, with its colour name, normalised and in source pixels;
- the images before the fix, each with a label (`frame N`, `in, frame N`, `middle, frame N`, `out, frame N`, `contact sheet`), as absolute paths;
- the images after the latest render (`images (after, render <8 characters of the hash>)`), when they exist;
- the `agent note`, when there is one.

### JSONL

One stored item per line, exactly as in `queue.jsonl`, with four fields added: `regionsDetail` (the number, colour, normalised and pixel rectangles), `videoAbs`, `imagesAbs` and `afterImagesAbs`. The last three hold absolute paths.

---

## HTTP export

The player's server serves the same output:

```sh
curl "http://127.0.0.1:5730/api/export?format=md"
curl "http://127.0.0.1:5730/api/export?format=jsonl&ids=fc_aaa,fc_bbb"
```

- `format` is `md` (the default) or `jsonl`. Anything else is a 400.
- Without `ids`, you get the to-do and reopened items. With `ids`, you get those items, and an unknown id is a 404. In both cases they come out in priority order.
- The response has an `X-Framecue-Count` header with the number of items.
- Use the port printed at startup. The server only answers requests whose `Host` is `127.0.0.1:<port>` or `localhost:<port>`.

---

## MCP server

```text
framecue mcp [<video|folder>] [--dir <workspace>]
```

`framecue mcp` speaks the Model Context Protocol over stdio: stdout is the protocol, so nothing else is written there. The queue is read again on every call, and the player updates live when the agent marks an item fixed (a toast says "The agent marked #2 fixed").

### How it finds the workspace

1. `--dir <workspace>` wins. The folder must exist.
2. A path argument:
   - a **video file**: the `.framecue` folder next to it, which must exist (open the video in framecue first);
   - a **folder** called `.framecue`, or one that holds a `queue.jsonl`: that folder;
   - a **folder that contains** a `.framecue` folder: that one.
3. With no argument and no `--dir`, it searches upward from the current folder for a `.framecue` folder, **on every call**. A tool call fails with an explanatory message if none is found.

With a path or `--dir`, the workspace is resolved once, when the server starts.

### Claude Code

```sh
claude mcp add --scope project framecue -- npx -y framecue mcp /path/to/video.mp4
```

From a source build:

```sh
claude mcp add --scope project framecue -- node /absolute/path/to/framecue/dist/cli.js mcp /path/to/video.mp4
```

### Claude Desktop

Edit `claude_desktop_config.json`: `%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS.

```json
{
  "mcpServers": {
    "framecue": {
      "command": "npx",
      "args": ["-y", "framecue", "mcp", "/path/to/video.mp4"]
    }
  }
}
```

If the app does not inherit your `PATH`, give the absolute path of `npx` as `command` (or of `node`, with `dist/cli.js` from a source build).

**Windows:** use `npx.cmd` as the command, or `node.exe` with the absolute path of `cli.js`.

### Other MCP clients

Any client that starts a stdio server takes the same command and arguments. From a source build, use `"command": "node"` and `"args": ["/absolute/path/to/framecue/dist/cli.js", "mcp", "/path/to/video.mp4"]`.

### Tools

| Tool | Arguments | What it does |
|---|---|---|
| `list_items` | `status?`: `todo`, `fixed`, `verified` or `reopened` | One line per item, by priority: `#<rank> <id> <kind> frames <a>-<b> (<timecode>) [<status>] <first line of the comment>`. |
| `next_item` | none | The highest-priority item that is `todo` or `reopened`, with its details and images (same output as `get_item`). Returns a plain message when nothing is waiting. |
| `get_item` | `id` | The item as Markdown (kind, frames, timecode, comment, regions, status, agent note, absolute image paths), then the images as PNG: the captures before the fix and, when they exist, the ones after the latest render. |
| `mark_fixed` | `id`, `note` | Moves a `todo` or `reopened` item to `fixed` and stores `note` for you. `note` must not be empty: say what changed and where. |

Limits on images: the contact sheet is skipped when it is over 2 MB, and the images of one call stop at 8 MB in total. A skipped or missing image is named in the text of the answer.

An item that is already `fixed` or `verified` is refused by `mark_fixed`. No tool can verify, reopen, reorder or delete an item: only you, in the player.

---

## Claude Code plugin

The plugin bundles the MCP server and a review skill, so you do not register anything by hand.

Install it once, from a terminal (not inside a Claude Code session):

```sh
claude plugin marketplace add wewesss/framecue
claude plugin install framecue@framecue
```

Update it:

```sh
claude plugin marketplace update framecue
claude plugin update framecue@framecue
```

The plugin runs its own embedded copy of the server with `node` (Node.js 22 or later on `PATH`), so there is no npm install. It starts `framecue mcp` with no path, so the workspace is found by searching upward from the current folder, on each call.

| Command | What it does |
|---|---|
| `/framecue:review` | Works through the queue. For each waiting item, by priority: read the comment and look at every image, find the cause in the project, fix it with the smallest change, run the project's render command if it has one, then call `mark_fixed` with a note. An item that is unclear, or that needs a decision from you, is skipped and reported, not marked fixed. It ends with a summary and never verifies or reopens anything. |
| `/framecue:help` | Shows the commands, how to open a video, the MCP tools and the review flow. |

Run `/framecue:review` in the project folder once your review is done.

### Local install, from a clone

```sh
bun install
bun run build
claude plugin marketplace add <path-to-clone>
claude plugin install framecue@framecue
```

After changing the sources, run `bun run build:plugin`, then `claude plugin update framecue@framecue`.

---

## Concurrency

Both the player and the MCP process write `queue.jsonl`. Every write goes through a lock so two writers never overwrite each other:

- Inside one process, writes are queued one after the other.
- Across processes, a `queue.lock` file in the workspace is created exclusively. It holds the process id and a timestamp.
- A writer that finds the lock taken retries for up to 5 seconds, then fails with "Timed out waiting for the queue lock".
- The holder refreshes the lock every 2 seconds. A lock that has not been touched for 10 seconds, or whose process no longer exists, is taken over.
- The file is written to `queue.jsonl.tmp` and renamed over `queue.jsonl`, so a reader never sees half a file.

The player also watches `queue.jsonl`: when another process changes it, the queue refreshes after a short debounce (150 ms).
