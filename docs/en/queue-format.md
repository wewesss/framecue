# Queue format

📖 English · [Français](../fr/queue-format.md)

[← Back to the README](../../README.md)

---

Everything framecue knows about a review sits in one folder, the workspace. The player, the clipboard export and the MCP server are all views of these files, and any agent can read them directly.

## Workspace layout

```text
.framecue/
├── queue.jsonl              the queue, one item per line
├── frames/
│   └── <id>/                one folder per item
│       ├── frame.png        a single-frame item
│       ├── first.png        a range: first frame
│       ├── middle.png       a range: middle frame
│       ├── last.png         a range: last frame
│       ├── sheet.png        a range: contact sheet
│       └── after-<sha8>/    the same names, captured from a newer render
├── cache/
│   └── peaks-<sha256>-200.bin   audio waveform cache
├── queue.lock               only while a write is in progress
└── queue.jsonl.tmp          only while a write is in progress
```

`queue.jsonl` and `frames/` are the source of truth. `cache/` can be deleted: the waveform is computed again.

- **Which names an item gets depends on its frames, not on its kind.** When `frameStart` equals `frameEnd` the item has `frame.png`. Otherwise it has `first.png`, `middle.png`, `last.png` and `sheet.png`, whatever its kind: a region over a range has them too.
- `middle.png` is the frame at `floor((frameStart + frameEnd) / 2)`.
- `sheet.png` is a 4 × 4 grid of 320 px wide thumbnails. A range of 16 frames or fewer shows every frame, a longer one shows 16 frames evenly spread from the first to the last.
- The other images are the full frame, extracted by ffmpeg with the exact frame number.
- `after-<sha8>` uses the first 8 characters of the SHA-256 of the render the frames came from. Only the folder of the latest render is kept for each item.
- Deleting an item removes its `frames/<id>/` folder.
- Image paths in `queue.jsonl` are relative to the workspace and always use `/`.

---

## Item fields

`queue.jsonl` holds one JSON object per line, sorted by `priority` when read. framecue rewrites the whole file on every change.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `fc_` followed by a base-36 timestamp and 4 random characters. Also the name of the item's folder in `frames/`. |
| `video` | `{ path, sha256 }` | Absolute path of the video, and the SHA-256 of the file when the item was created. |
| `fps` | number | Frame rate of the video when the item was created. |
| `kind` | `"frame"`, `"range"` or `"region"` | A region item has at least one region. |
| `frameStart` | integer | First frame, counted from 0. |
| `frameEnd` | integer | Last frame. Equal to `frameStart` for a single frame. It cannot be past the last frame of the video. |
| `timecode` | string | `HH:MM:SS:FF` of `frameStart`. `FF` counts frames up to the rounded fps, with no drop-frame handling. |
| `regions` | array of `{ x, y, w, h }` | Rectangles, as fractions of the frame width and height, from 0 to 1. `x` and `y` are the left and top edges. Empty for a frame or a range. Their order gives their number and colour. |
| `comment` | string | Your note. |
| `priority` | number | Lower is more urgent. A new item gets the highest number plus one, and reordering renumbers all items from 0. |
| `status` | `"todo"`, `"fixed"`, `"verified"` or `"reopened"` | See below. |
| `images` | array of string | Paths of the images captured when the item was created. |
| `after` | `null` or `{ sha256, capturedAt, images }` | Images of the same frames from a newer render: its SHA-256, an ISO 8601 date, and the paths. `null` until one exists. |
| `agentNote` | string or `null` | What the agent wrote with `mark_fixed`. |
| `createdAt`, `updatedAt` | string | ISO 8601 dates. |
| `adapter` | object, optional | Free room for a tool to attach its own data. framecue does not read or write it. |

A line with a single `region` object instead of `regions` is read as a list of one region, and the `region` key disappears the next time the file is written.

---

## Statuses and who may change them

| Who | Change | How |
|---|---|---|
| You | any status to any other | The status selector, **Verified** (`V`) and **Reopen** (`X`) in the player, or a `PATCH` on the local API. |
| The agent | `todo` or `reopened` to `fixed`, with a note | `mark_fixed`. |

Nothing else is allowed for the agent: `mark_fixed` on an item that is not `todo` or `reopened` returns an error saying that only you can verify or reopen an item.

A new item is `todo`. When a new render is detected, framecue captures the `after` images of the items that are `fixed` only.

---

## Example

One item, written on several lines here (in the file it is a single line). It is a range that the agent fixed and that has been captured again after a new render. Paths and hashes are shortened.

```json
{
  "id": "fc_mhx3k2ab9q1z",
  "video": { "path": "/path/to/neon-hours.mp4", "sha256": "3fa9c1d2…" },
  "fps": 30,
  "kind": "range",
  "frameStart": 250,
  "frameEnd": 290,
  "timecode": "00:00:08:10",
  "regions": [],
  "comment": "EPISODE 04 is nearly invisible on the dark background",
  "priority": 2,
  "status": "fixed",
  "images": [
    "frames/fc_mhx3k2ab9q1z/first.png",
    "frames/fc_mhx3k2ab9q1z/middle.png",
    "frames/fc_mhx3k2ab9q1z/last.png",
    "frames/fc_mhx3k2ab9q1z/sheet.png"
  ],
  "after": {
    "sha256": "b71e04c8…",
    "capturedAt": "2026-11-11T10:42:07.512Z",
    "images": [
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/first.png",
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/middle.png",
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/last.png",
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/sheet.png"
    ]
  },
  "agentNote": "Raised the opacity of the EPISODE 04 label from 0.2 to 0.9.",
  "createdAt": "2026-11-11T10:31:45.120Z",
  "updatedAt": "2026-11-11T10:42:07.512Z"
}
```

Writes are serialised with a lock: see [agents](./agents.md#concurrency).
