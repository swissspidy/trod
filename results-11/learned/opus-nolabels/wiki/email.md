# Email inbox (forward / reply / mark important / mark unread / delete)

- The inbox lists `div.email-sender`, `div.email-subject`, `div.email-body`. Click the subject or sender to open an email.
- In the open email, Reply and Forward have ids. **The send arrow and the star (important) icon have no ids.** Seen positions: send ≈ (147,61) in the reply/forward panel, star ≈ (133,62) in the open email's header. Confirm them with a screenshot, then use `clickxy`.
- Clicking send or the star ended the episode right away. Finish every edit before that click.
- Reply recipe: `click <sender/subject id>`, `click <Reply id>`, `type <body textarea id> <text>`, screenshot, `clickxy <send>`.
- Forward recipe: open the email, `click <Forward id>`, `type <to-field id> <name>` (one heredoc), screenshot, `clickxy <send>`.
- "all of X's emails": check the whole inbox list, including entries below y≈210 in the listing. One session sent only the first email and the episode ended. Opening an email may mark it read.
