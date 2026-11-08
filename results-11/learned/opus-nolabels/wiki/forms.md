# Forms and text entry

## Date input (`input type="date"`)
- `type 1 07152017` or `type 1 07/15/2017` fails. `type` clicks the centre of the field, which is the year segment, and the field shows `mm/dd/152017`. Three sessions wasted 20+ actions on this; one opened the calendar picker and its click ended the episode.
- What worked (2 of 2 sessions): click the **month segment** near the field's left edge, then press each digit:
```
mw <<'EOF'
clickxy <field_x+11> <field_y+10>
press 0
press 7
press 1
press 5
press 2
press 0
press 1
press 7
EOF
```
  Check the listing for `value="2017-07-15"`, then `click <submit id>`.

## Change case ("Type "JESS" in all lower case")
- Convert the text first, then use `type <id> jess` and `click <submit id>`. Typing the quoted string unchanged and submitting failed.
- If you typed the wrong text, just run `type` again: it clears the field.

## Autocomplete ("starts with "Pan" and ends with "nama"")
- Run `type <input id> <prefix>`, click the suggestion `div.ui-menu-item-wrapper` whose text matches both ends, and **then click Submit**. Three sessions stopped before Submit, so the episode never ended.

## Copy/paste ("Copy the text from the 2nd text area…")
- Don't use the clipboard: `ctrl+c` is an invalid key name, and clicking the textarea timed out. The textarea's `value="..."` is in the listing. Copy it exactly, trailing space included, with `type <answer-input id> <value>`, then click Submit.

## Radio + textbox ("Check the 3rd radio button and enter "26" into the 3rd textbox")
- Use `click <nth radio id>`, then `type <nth text input id> 26`, **then click Submit**. All four sessions skipped Submit.
