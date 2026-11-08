# Icon actions: Like, Share, Retweet, star, forward, reply

- Icons (heart, share, retweet, star, send arrow) are usually NOT in the listing. Screenshot, Read it, find the icon under the target, `clickxy` it, then screenshot again to see the colour change (red, green, highlighted) before the final click.
- Passes: targets visible in the first screen (019 one post, 022 one post, 023 two posts, 056 star, 054 forward, 055 reply).
- Fails: targets below the visible area. 020 and 021 clicked guessed coordinates (y=351, 661) for off-screen posts; 024 retweeted posts 3-6 blind; 014 never saw its target.
- Off-screen targets: `scroll <id-of-a-post-in-the-feed> <px>` (015 scrolled and passed with four posts), screenshot, click the icon where it now is. If scrolling does nothing, say so; do not guess coordinates.
- "All posts by @X": find every post with that handle first (scroll through the whole feed), then act on each.
- Email send arrow: paper-plane at top right of the open panel (`clickxy 147 61` in 054, 055). Star: header icon of the open email (`clickxy 133 62` in 056).
- Opening an email marks it read. For read/unread or importance tasks, use the row icons, not the open view (053 opened the email and failed).
