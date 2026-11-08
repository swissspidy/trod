# click-menu notes (jQuery UI nested menu)

Task: "Select A>B>C" (path of 1-3 levels; 1 level = just "Select A").

RULES
- NEVER click a parent (non-final) item: clicking any item ends the episode at once; a parent click scored -1. Only the LAST name in the path gets a click.
- Open submenus with `hover <id>`, not click. The submenu shows up after a short delay: the observation printed by `hover` usually does NOT show it yet. Run `sleep 0.5; mw observe` before looking for the next level.
- After each hover, new submenu items get NEW ids. Always take ids from the latest observe.
- Match names exactly, whole word: "Bea" is not "Beatrisa". Look under the submenu `ul` that appeared after the item you hovered (it is listed right after its parent).
- You don't need a submit button: clicking the final item is the whole answer.
- The menu is small (~3-4 items per level), so you never need to scroll.

RECIPE (worked 5/5)
1. `mw observe`, then find the item named <level1>.
2. If the path has more levels: `mw hover <id1>; sleep 0.5; mw observe`
3. Repeat the hover + sleep + observe for each middle level <levelK>, using the new ids.
4. `mw click <id of last name>`, and you're done (one try).
Single-level path: just `mw click <id>` on the item.
