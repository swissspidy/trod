# Social media feed ("Click <Like|Share|Retweet> on <1|N|all> posts by @user, then Submit")

The action icons are not in the element list.

## Why sessions failed (014, 020, 021, 024)
- They clicked icons of off-screen posts by extrapolated coordinates, e.g. y=351, 413 or 661. Those clicks did nothing.
- `scroll <id> <dy>` did not move the feed in those runs.

## What passed (015, 019, 022, 023)
- Bring each target post into view first:
  - `hover <id of that post's div.body>` worked in 019.
  - `click <id of a lower post's name/body text>` worked in 015.
  - The feed then scrolls, and the listed @y values change (some go negative).
- Use the observation's new @y for the post's `span.name`. The icon row sits about 48px below that name's y, at these x positions:
  - retweet x≈57
  - like (heart) x≈90
  - share x≈122
- Before clicking, check the position in a screenshot.
- After each icon click, take a screenshot and confirm the icon changed colour: red heart, green retweet, highlighted share.

## Recipe
1. List the target posts: the `span.username` equals "@user". For "N posts" pick any N of them; for "all", take every one, including ones further down.
2. For each target:
   1. `hover <its div.body id>`
   2. Read its name's new y.
   3. `clickxy <icon x> <name_y+48>`
   4. Screenshot and check the icon changed.
3. `click <Submit id>`. Submit is the last listed button and is clickable by id even when off screen.
