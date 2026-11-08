# Menus, nested selects, food orders, timed sequences

Nested select ("Select Drusilla>Sarine", "Select Dee>Opaline>Lotty"; 105, 106 failed):
- Clicking a top-level item ends the episode as a wrong answer. Hover each parent to open its submenu, then click the leaf. Single-level items passed in one click (107, 108).

Icon menu ("Click the Menu button, then click the item with the … icon", 101-104):
- Click Menu, screenshot, then hover items that have submenus. 101 hovered Playback, saw Prev with the matching glyph, clicked it: pass. 102 clicked Playback itself: fail.
- When two items share the icon (Zoom In / Zoom Out), 103 and 104 picked the first and passed. Look for a tie-breaker in the task text first.

Food orders ("Order 4 items that are vegan / gluten-free"; 026, 031, 032 passed, 030 failed):
- Items are numbered in the listing. Click each item once, then check the quantity badges (1 each, correct count) before the Order button.
- Dietary markers are small coloured icons with no legend. Zoom the icons and compare with a known item before deciding. 030 guessed gluten-free from one icon and failed.

Timed sequences ("Click button ONE, wait 3 seconds, then click TWO", 113-120):
- Use exactly the N the task gives: `sleep 3` passed (117-119). 120 used 1.5 for "1 second" and failed.
