# Click-menu: select a (nested) menu item
Tasks like: "Select <A>" or "Select <A>><B>" or "Select <A>><B>><C>"

## Key facts
- The path is split by `>`. Only the LAST name (the leaf) may be clicked.
- Clicking ANY item ends the episode at once. If you click a parent (A or B in a path), the reward is -1. Haiku did this once: it clicked A, and the episode ended without ever showing B.
- Submenus open only on `hover`, after about 1 second. The output printed right after `hover` does NOT show the submenu yet. Always run `sleep 1; mw observe` after hovering.
- Ids stay the same, and each new submenu's items get new ids.

## Recipe (one Bash call per step)
1. Read the task and the element list (`mw observe` if you don't have it yet).
2. Task has no `>` (just "Select <A>"): run `mw click <id of A>`. You're done, even if A has a submenu.
3. Task is a path. For each name except the last:
   `mw hover <id of name>; sleep 1; mw observe`
   Then find the next name in the new list. It shows up as a new `ul.ui-menu…ui-front` with its items.
4. When the leaf is listed, run `mw click <id of leaf>`. The page prints "The episode has ended." Then reply DONE.

Example for "Select <A>><B>><C>": hover A, sleep 1, observe → hover B, sleep 1, observe → click C. That's 3 calls, which earned full reward.

## Do NOT
- Do not click a parent name to "open" it. Opening is done by hovering only.
- Do not decide "the next item isn't there" from the output of `hover` alone. Run `sleep 1; mw observe` first. If it still isn't there, hover the parent again and observe again.
- Do not hover a name that isn't in the path, and don't move to other items. That can close the open submenu.
- Don't take screenshots. The element list is enough, and pausing a few seconds didn't lower the reward.
