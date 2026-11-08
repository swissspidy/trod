# social-media-all (Reply/Retweet/Like/Share on all posts by @user, then Submit)

RULES
- The action icons are NOT in `mw observe`. Click them with `clickxy <x> <y>`.
  Icon x (fixed): Reply 25, Retweet 58, Like 91, Share 122.
  Icon y = (current y of that post's span.username) + 47 (same for 1- or 2-line bodies).
- Visible area is only ~y 50..210; the feed scrolls inside. `mw scroll` did NOT
  scroll it. Use `hover <id>` to scroll an element into view, then `observe` again:
  coordinates in observe update after scrolling (can go negative).
- Clicking Submit ends the episode, right or wrong. Do every post first.
- Match by span.username text exactly (e.g. "@quis"), not span.name; targets are
  interleaved with other users. Count them all, incl. ones far below (y up to ~700).
- Icons toggle: a wrong icon click does not end the episode; clicking it again
  undoes it (verified reward 1 after undo). So never click a target icon twice.
- Verify via `screenshot` if unsure: active Like=red, Share=purple, Reply=blue.

RECIPE (6/6 solved)
1. `mw observe` -> list ids of span.username "<@user>" (id U; U+1 = body, U+2 = next post name or Submit).
2. For each U top to bottom: `mw hover <U+1>`; `mw hover <U+2>` (element just below the post, so its icon row is on screen);
   `mw observe` -> read y of [U]; `mw clickxy <X> <y+47>`.
3. `mw click <Submit id>`.
