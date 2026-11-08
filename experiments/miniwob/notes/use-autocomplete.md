# use-autocomplete (jQuery UI "Tags:" input + Submit)

RULES
- Clicking Submit ENDS the episode, right or wrong. Submitting a wrong or partial value gives reward -1. Get the full item into the input first.
- The answer is ONE full item from the suggestion list (country names like "Bermuda" or "Slovakia"), NOT the prefix you typed. Pick the item that starts with <prefix> AND ends with <suffix>. If the task gives only a start, any item that starts with it worked.
- `type <input> <prefix>` opens the menu. Then run `observe` to read the items (div.ui-menu-item-wrapper). Several items can match the prefix, so check the ending.
- Fill the input by clicking the item, or with `press ArrowDown` (once per row) then `press Enter`. Neither one submits. Pressing Enter in the input does NOT end the episode.
- TRAP: an open menu covers the Submit button (both near y≈95). If the menu is still open, a click on Submit hits the menu item instead and does not submit. After choosing an item the menu closes. Before clicking Submit, run `observe` and make sure no ul.ui-autocomplete is listed. If you typed the full word yourself, the menu stays open: choose the item from it first.
- Before submitting, check that the input's value= is the full, exact item.

RECIPE (worked 5/5)
1. type <inputId> <prefix>
2. observe → find the item whose text starts with <prefix> and ends with <suffix>
3. click <thatItemId>
4. observe → input value="<FullItem>" and no menu listed
5. click <submitId>
