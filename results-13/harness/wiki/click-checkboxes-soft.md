# Select words similar to … (checkbox synonyms)
Tasks like: "Select words similar to <word1>, <word2>, … and click Submit."

## Rule: one checkbox per query word
- Each query word has EXACTLY ONE matching label in the list. Tick as many boxes as there are query words, never fewer.
- The match is often THE SAME WORD, or a plural or variant of it (e.g. the query word itself appears as a label). Tick it. Past runs lost reward (0.33, 0.6) because they left the identical word unticked, thinking "nothing matched".
- Otherwise the match is a synonym or close variant of the query word.
- The remaining labels are unrelated distractors. Leave them unticked.

## Recipe (2 tool calls, fastest)
1. Read the element list in the prompt or from `mw observe`. The labels are `[n] label "<word>"`. The checkbox for that label is the next id, `[n+1] input … type="checkbox"`.
2. Match each query word to one label: first look for an identical or near-identical label, then for a synonym. Write down the checkbox ids.
3. In ONE heredoc, tick every match and click Submit:
```
mw <<'EOF'
click <checkbox id for word1>
click <checkbox id for word2>
click <Submit button id>
EOF
```
4. Output shows "The episode has ended." → reply DONE.

## Do NOT
- Do not skip a query word. If unsure, tick the closest label, because every query word has a match.
- Do not tick more boxes than there are query words.
- Do not click a label/checkbox twice. A second click unticks it.
- Do not read wiki pages, take screenshots or run extra observe/sleep steps. They only cost time, and the reward decays.
