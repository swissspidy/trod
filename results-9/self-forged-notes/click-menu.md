# click-menu (mw) notes

Task text: "Select A>B>C" (a nested jQuery-UI-style menu). Some episodes are a single item ("Select Anette"), some are two levels ("Select Dode>Lorrin"), some three.

RULES
- The episode ends at the first click on the target leaf; a wrong click ends it too. Only click the final item, once.
- Element ids change every episode and every time a submenu opens. Always `mw observe` before choosing an id; never reuse ids from an earlier observation.
- Submenus open on HOVER, not click. Run `mw hover <id>` on each level in order, then `sleep 1` (the submenu appears about 1 s later), then `mw observe`. Observing right after hover showed no submenu.
- Do not click a parent item (A or B) on the way; hover is enough. Clicking the leaf directly works even from a different submenu (the mouse jumps; no intermediate hovers needed).
- Ids of the new submenu appear in the observe output with the `ul.ui-menu...ui-front` element before its items; match the item text, not position.
- Don't rely on `mw reward` to know the answer before clicking; check it after the final click.

RECIPE (worked 5/5 episodes, 3 of them chains)
1. `mw reset` then `mw observe`.
2. For each level except the last: `mw hover <id of <level-i item>>`, `sleep 1`, `mw observe`.
3. `mw click <id of final item>`.
4. `mw reward` should print reward 1 (episode ended).
Single-item task: `mw observe`, `mw click <id>`, `mw reward`.
