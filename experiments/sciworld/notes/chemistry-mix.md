# chemistry-mix: notes

Task: "use chemistry to create <product>... recipe near the kitchen... focus on <product>".
The recipe, the ingredients, a sink and empty containers are in the **kitchen**.

## Start
- Run `look around` first. You may already be in the kitchen. If you are, `open door to kitchen` / `go to kitchen` fail ("No known action" / "not clear how to get there") and still use up actions.
- Elsewhere: `open door to hallway`, `go to hallway`, `open door to kitchen`, `go to kitchen`.
- Each `sw` line is one action. Failed or invalid commands count too.

## Procedure (about 8-12 actions in the kitchen)
1. `read recipe` works without picking it up. It says "To make <product>, you need to mix <a>, <b>[, <c>]."
2. Get an empty container. Usually `a glass cup (containing nothing)` is on the table. The cupboard (`open cupboard`) has a ceramic cup, a tin cup and a metal pot. `pick up glass cup`.
   - If two objects share a name, the parser asks you to pick one. You can refer to it by contents and location: `pick up cup containing nothing in table`.
3. Put each loose solid in: `move <a> to glass cup` works straight from the room floor. No need to pick it up first.
   - Substance in a closed jar, e.g. `a glass jar (containing a substance called sodium chloride)`: `open glass jar`, `pick up sodium chloride`, `move sodium chloride to <cup>`.
   - Some ingredients may be inside the fridge, cupboard or drawer (`open fridge`, `open drawer in counter`). `look around` again after opening things.
4. **Water**: `move <cup> to sink`, `activate sink`, `deactivate sink`, `pick up <cup>`. The cup now contains water. You don't need to `wait`.
   - With items in the sink, refer to the cup by contents if needed: `pick up cup containing soap and water`.
5. Check with `look at <cup>` (or `examine <cup>`). Expect "(containing <a>, <b>...)" with every recipe ingredient.
6. `mix <cup>`. Expect "<a> and <b> mix to produce <product>." If it doesn't say that, an ingredient is missing.
7. `focus on <product>`, e.g. `focus on salt water`, `focus on soapy water`, `focus on mixed nuts`. This ends the task. Focus only once, only on the product, and only after mixing: focusing on anything else (or too early) ends or fails the task.

## Examples (gold runs scored 100; live run: no score shown)
- salt water = sodium chloride (glass jar in kitchen) + water (sink).
- soapy water = soap (loose in kitchen, "a substance called soap") + water (sink).
- mixed nuts = peanut + almond + cashew (all loose on the kitchen floor). Live run: read recipe, pick up glass cup, 3x move, mix glass cup, focus on mixed nuts.

## Tips
- Skip pointless actions. Don't eat ingredients. Don't heat anything unless the recipe says so.
- Ingredients don't need to be in the inventory. Mixing works on a container you are holding (it may also work on one in the room).
- Kitchen also has the fridge, freezer, oven, stove, a counter with a drawer and a fruit bowl, the soap and the jar of sodium chloride.
