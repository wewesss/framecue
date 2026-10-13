---
name: help
description: Show how to use framecue: the commands, how to open a video for review, the MCP tools and the review flow. Use when the user types /framecue:help or asks how framecue works.
---

Print the following to the user, adapted to their language.

## Commands

- `/framecue:help`: this help.
- `/framecue:review`: fix the items of a finished review.

## Open a video

Run from the project folder:

```
bun "${CLAUDE_PLUGIN_ROOT}/server/framecue.js" <video>
```

Options: `--dir`, `--port`, `--no-open`. The player opens at http://127.0.0.1:5730 (next free port if taken). Requires bun 1.4+ and ffmpeg/ffprobe on PATH.

Resolve CLAUDE_PLUGIN_ROOT yourself (it is the folder two levels above this SKILL.md) and show the absolute path to the user. Once framecue is published, `framecue <video>` works the same.

## Live mode

Keep the player open. When the render tool replaces the video file (overwrite, rename, even delete and recreate the folder), the player reloads it, and items marked fixed get their "after" images recaptured. No need to restart.

## MCP tools

- `list_items`
- `next_item`
- `get_item`
- `mark_fixed`

The server finds the `.framecue` workspace by searching upward from the current folder, on each call.

## Review flow

1. Review in the player: pick a frame, set a range with I/O, draw regions with R, press Enter to add the item, write a comment.
2. Run `/framecue:review`: the agent fixes each item and marks it fixed.
3. Verify or reopen in the player (only the user does that).
