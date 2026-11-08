# click-menu-2 (jQuery UI menu)

Task is one of two forms: item *labeled "<Label>"*, or item *with the <icon> icon* (the icon is an image, so the task text shows an empty gap).

RULES
- First `click` the "Menu" button (id 1). The menu items show up only after that.
- Clicking any enabled leaf item ends the episode. A wrong one scores -1. Be sure before you click.
- Clicking or hovering "Playback" (the parent with ">") only opens its submenu (Prev, Stop, Play, Next). It does NOT end the episode. Do this first if the target is not in the top-level list.
- "Print..." is disabled (greyed). Clicking it does nothing and does not end the episode.
- ICON tasks: the icon name is missing from the text, so you MUST `screenshot` and Read it. Compare the icon in the yellow task bar with the item icons. Open Playback first so the submenu icons are visible too. Upscale/crop if they're unclear: Zoom In = magnifier with "+", Zoom Out = magnifier with "-", Save = floppy disk, Prev = |◄, Stop = ■, Play = ►, Next = ►|.
- Labels match the item text exactly. Submenu items get new ids (e.g. 9-12) after Playback opens, so read the ids from the latest observation.

RECIPE
1. `click 1` (Menu)
2. If the target is a Playback child or this is an icon task: `click <Playback id>`
3. Icon task: `screenshot /tmp/s.png` and Read it, then map the icon to its item label
4. `click <id of target item>` (done, no submit needed)
