# social-media-some (click <Action> on N posts by @user, then Submit)

RULES
- The action icons (Reply/Retweet/Like/Share) are NOT in the element list. Click them with `clickxy <x> <name_y+49>`. x: Reply=25, Retweet=58, Like=90, Share=121. Each post is 62px tall, and its icon row is always at the post's name y + 49.
- Match posts by the USERNAME span (@user), not the display name. Two posts can share a name but have different handles.
- The feed shows only y≈50..210. A clickxy below ~205 hits nothing, and the episode then fails at Submit. Before clicking a lower post, `press PageDown` (scrolls ~133px), then read the new y values from the printed list and click at new name_y+49. `scroll <id>` does NOT move the feed.
- Click EXACTLY N matching posts, one click per post. A second click probably toggles it off.
- To check, take a screenshot: an active icon turns colored (Share purple, Reply blue).
- Clicking Submit ends the episode, right or wrong. Use `click <submit id>`; it works even when Submit is off-screen. Do it last.

RECIPE
1. Read the list. Pick the first N posts whose username is @<user>.
2. For each one with name_y+49 <= 200: `clickxy <iconX> <name_y+49>`.
3. For the rest: `press PageDown`, read the new name_y values, then `clickxy <iconX> <name_y+49>` (keep the result between 60 and 200).
4. Optionally `screenshot` and check that N icons are colored.
5. `click <Submit id>`.
