---
name: review
description: Fix the items of a finished framecue video review through the framecue MCP tools. Use when the user says the framecue review is done ("revue framecue terminée", "framecue review finished", "fix the framecue review", "go through the framecue queue") or asks to handle framecue items.
---

# framecue review

Work through the framecue queue until nothing is waiting. The MCP tools are `list_items`, `next_item`, `get_item` and `mark_fixed`.

1. Call `list_items` to see the queue. If the tools are missing or no workspace is found, tell the user to run `framecue <video>` in the project folder, then stop.
2. Call `next_item`. If it reports nothing waiting, go to step 7.
3. Read the comment and look at every image: the frame or range, and each numbered or coloured region if present. Regions mark exactly where the comment applies.
4. Find the cause in the current project and fix it with the smallest change that answers the comment. If the comment is unclear, the cause is outside this project, or the fix needs a decision from the user, skip the item and record why. Do not mark it fixed.
5. If the project has a render command (check `package.json` scripts, a Makefile, the README), run it so the change shows in the output. If none is found, say so in the summary.
6. Call `mark_fixed` with the item id and a short note: what changed and where. Only for an item you actually changed. Then go back to step 2.
7. A skipped item stays waiting, so `next_item` returns it again. Keep the ids you skipped; when `next_item` returns one of them, call `list_items` and take the next `todo` or `reopened` item you have not skipped. If there is none, go to step 8.
8. Summarise: items fixed (id and one line each), items skipped and why, and whether a render ran. Never verify or reopen an item: only the user does, in the player.
