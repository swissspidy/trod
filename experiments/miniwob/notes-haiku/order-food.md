# order-food notes

RULES
- Clicking "Order!" (last button in observe) ends the episode. Verify all quantities first; there is no retry.
- "one of each item: A, B" = quantity 1 for each named item.
- "Order N items that are <attr>" = total quantity N over items with that attribute. 2 Spicy Thai + 2 Ice cream sundae (both peanut) solved it. Do not order other items. "3 items that are meat" with 4 meat items: any 3 of them solved (Chicken wings, Spaghetti and Meatballs, Spicy Thai Peanut Chicken).
- Attributes are not in the text. Read the icon row under each item name: red meat cut = meat; outlined yellow peanut = peanut; green leaf = vegetarian; blue carton = dairy.
- Icons are ~12px. Do not use `scroll` to reveal items, it does not move the view. Use `hover <id>` (scrolls the item into view), then `screenshot <f>.png`, then `convert <f>.png -crop 90x40+0+<y> -scale 800% z.png` and Read z.png.
- "+" adds 1 per click. A span.quantity appears after the first click.
- Clicks scroll the page and renumber elements. Run `observe` again and grep the target id before each click.

RECIPE (worked 4/4)
1. mw observe; read the task and find the add ("+") ids.
2. mw click <add-id> once per unit needed.
3. mw observe | grep -E 'quantity|<item>'; check counts.
4. mw click <Order-id>; then mw reward -> reward 1 = solved.
