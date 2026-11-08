# Social media feed (Like / Share / Retweet / Reply on posts by @user)

- The listing shows each post as `span.name`, `span.username`, `div.body`. **The action icons are not listed.** Each post's icon row sits about 23px below the bottom of its `div.body` (body_y + body_h + 23). Icon x positions seen in these sessions: Reply ≈ 25, Retweet ≈ 57, Like (heart) ≈ 90, Share ≈ 122. Confirm them on your first screenshot.
- Posts are spaced 62px apart. Only the top ~210px is visible, so most target posts are off-screen.
- `scroll 0 300` errors. Bring a post into view with `hover <its div.body id>` or `scroll <body id> 150`, then read its **new** y from the listing. Clicking far off-screen coordinates (y=661) could not be verified, and one session gave up without submitting.
- A clicked icon changes colour (heart red, retweet green, share purple). Verify each click with a screenshot.
- "1 post" / "2 posts" means exactly that many posts by @user. "all posts" means every post whose `span.username` matches. Count them in the listing first.
- The Submit button is the last id in the listing, e.g. `[31] button "Submit"`. Click it last.

Recipe:
```
# for each target post:
mw hover <body id>                              # scrolls it into view; note new y,h
mw clickxy <icon x> <body_y+body_h+23>
mw screenshot p.png                             # Read: icon coloured?
# after all targets:
mw click <Submit id>
```
