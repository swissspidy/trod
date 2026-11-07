# codebase_community (stats.stackexchange dump) — notes

## Tables & joins
- users(Id, Reputation, CreationDate, DisplayName, LastAccessDate, WebsiteUrl, Location, AboutMe, Views, UpVotes, DownVotes, AccountId, Age, ProfileImageUrl). Id -1 = 'Community' bot.
- posts(Id, PostTypeId, AcceptedAnswerId, **CreaionDate** (typo!), Score, ViewCount, Body, OwnerUserId, **LasActivityDate** (typo!), Title, Tags, AnswerCount, CommentCount, FavoriteCount, LastEditorUserId, LastEditDate, CommunityOwnedDate, ParentId, ClosedDate, OwnerDisplayName, LastEditorDisplayName)
- comments(Id, PostId, Score, Text, CreationDate, UserId, UserDisplayName)
- badges(Id, UserId, Name, Date) — one row per award; "number of users with badge X" is usually COUNT(Id) over badges, not DISTINCT.
- votes(Id, PostId, VoteTypeId, CreationDate (date only 'YYYY-MM-DD'), UserId (mostly NULL), BountyAmount)
- postHistory(Id, PostHistoryTypeId, PostId, RevisionGUID, CreationDate, UserId, Text, Comment, UserDisplayName)
- postLinks(Id, CreationDate, PostId, RelatedPostId, LinkTypeId 1 or 3)
- tags(Id, TagName, Count, ExcerptPostId, WikiPostId) — join posts ON posts.Id = tags.ExcerptPostId.
- Joins: post owner = posts.OwnerUserId = users.Id; "edited by" = posts.LastEditorUserId; commenter = comments.UserId; badge owner = badges.UserId; voter = votes.UserId.
- User name filters use users.DisplayName (not unique! e.g. many 'Chris'); join on Id rather than using OwnerDisplayName/UserDisplayName (mostly NULL).

## Coded values / definitions (from docs)
- PostTypeId 1 = question (has Title, ViewCount), 2 = answer (has ParentId). Title is NULL for non-questions.
- Comment Score: positive comment = Score > 60; negative = Score < 60.
- Age: teenager 13–18 (BETWEEN 13 AND 18), adult 19–65 (BETWEEN 19 AND 65), elder Age > 65. Age NULL for most users.
- popularity = ViewCount; valuable = FavoriteCount; influence = Reputation.
- ClosedDate IS NULL → "not well-finished"; NOT NULL → "well-finished".
- ParentId NULL = root post.
- VoteTypeId 8 = bounty start (BountyAmount set). "bounty over 30" was written >= 30.
- Tags string like '<bayesian><prior>'; tag counts via tags.TagName.
- Badge names case-sensitive as stored ('Teacher','Supporter','Announcer','Citizen Patrol','Revival', 'outliers' lowercase).

## Dates
- Format 'YYYY-MM-DD HH:MM:SS.0' (note the trailing .0). Exact match: CreationDate = '2010-07-19 19:37:33.0'.
- Year: STRFTIME('%Y', col) = '2011'. Day: col LIKE '2010-07-19%'.
- "How long between" was computed as plain text subtraction `T1.Date - T2.CreationDate` (yields year difference).

## Output shape conventions
- Return only the asked columns, in question order. "Which user" → DisplayName (sometimes Id + DisplayName).
- Percentage: `CAST(SUM(IIF(cond,1,0)) AS REAL) * 100 / COUNT(T1.Id)`. Ratio: `CAST(COUNT(a) AS REAL) / COUNT(b)`.
- Average per user: `CAST(COUNT(badges.Id) AS REAL) / COUNT(DISTINCT users.DisplayName)`.
- Max/min: two styles both used — `WHERE col = (SELECT MAX(col) FROM t)` (keeps ties; used for single-table users Views/Age/FavoriteCount) or `ORDER BY col DESC LIMIT 1` (used after joins / "top post of user X"). For "first/latest" use ORDER BY date LIMIT 1.
- Top by group count: `GROUP BY x ORDER BY COUNT(Id) DESC LIMIT 1`.
- "More than N things per user": subquery `GROUP BY UserId HAVING COUNT(*) > N`, then COUNT/AVG outer.
- Counting with joins: COUNT(T1.Id) without DISTINCT, unless "how many users" across multi-row joins → COUNT(DISTINCT user Id).
- Usually no DISTINCT on listed rows; joins are INNER JOIN with T1/T2 aliases.
- Yes/no style answers: `IIF(ClosedDate IS NULL, 'NOT well-finished', 'well-finished')`.
- Count of votes for a post: join posts→votes ON posts.Id = votes.PostId, COUNT(posts.Id).
- Comments on a post: join posts→comments ON posts.Id = comments.PostId.
- Text matching: exact '=' for titles/text given verbatim; LIKE '%x%' for "about x"/"contains".
