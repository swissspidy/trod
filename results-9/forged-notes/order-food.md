# order-food NOTES

RULES
- Clicking "Order!" ends the episode. Set all quantities first.
- Counts must be exact; an extra item gives -1. Before ordering, check `mw observe | grep quantity`.
- Click the `span.add "+"` right after the item's name. Ids stay the same; off-screen (negative y) clicks still work, so don't scroll.
- "Order N items that are <tag>": any mix of matching items works, repeats included (3+1 and 4x one item both scored 1). Tags show only as icons in a screenshot, not in observe. The menu was the same 12 items every time:
  - meat: Chicken wings, Spicy Thai Peanut Chicken, Grilled Pork Tenderloin, Spaghetti and Meatballs
  - peanuts: Spicy Thai Peanut Chicken, Ice cream sundae
  - vegan (leaf): Caesar Salad, Garlic bread, Tofu and Vegetable stone pot, Coconut mango tart
  - dairy (blue carton): Spinach and goat cheese dip, Cheese wheel, Chocolate cake, Ice cream sundae
  - gluten-free (yellow wheat): Caesar Salad, Spinach dip, Tofu pot, Grilled Pork, Cheese wheel, Ice cream sundae
  If the menu differs, run `mw hover <item id>` then `mw screenshot x.png` to see the icons.
- "One of each item: A, B": press + once on each, nothing else.

RECIPE
1. `mw observe` and note the "+" id for each <item>.
2. `mw click <plus id>` until the counts are right.
3. `mw observe | grep quantity` and confirm the total is <N>.
4. `mw click <Order! id>` (the last element).
