# Menus and multiple choice

## Nested menu ("Select Dee>Opaline>Lotty")
- **Clicking a parent item ends the episode** (2 of 2 failed this way). `hover` each parent instead. Its submenu items then show up in the listing:
```
mw hover <id of Dee>         # listing now shows Opaline
mw hover <id of Opaline>     # listing now shows Lotty
mw click <id of Lotty>
```
- A single name ("Select Legra") means one `click`.

## "Click the Menu button, then the item with the [icon] icon"
- The icon glyph is often lost from the task text. Click Menu, take a screenshot, and hover items that have a submenu arrow (e.g. Playback → Prev/Stop/Play/Next) to see their icons. Pick the item whose icon matches, then `click` it. Clicking a parent item does not end the episode.

## Synonym checkboxes ("Select words similar to favor, hide, frightened…")
- **Pick exactly one option per target word.** If an option is the target word itself, it counts: select it. Sessions that skipped literal matches ("favor", "hide", "adore") or submitted nothing failed.
- Leave the leftover distractors unchecked. Then click Submit.
