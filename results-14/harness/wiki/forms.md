# Form tasks

Every form here has a Submit button, and the task fails without clicking it. That cost 7 sessions:
- autocomplete: 007–009
- radio + textbox: 041–044

## Autocomplete ("Enter an item that starts with A and ends with B")
1. `type <input> <prefix>`
2. `click <suggestion id>` (the `ui-menu-item-wrapper` whose text matches)
3. `click <Submit id>`

## Radio + textbox
1. `mw <<'EOF'`, then `click <nth radio>` and `type <nth textbox> <value>`, close with EOF.
2. Check the observation shows `checked` and the `value=` you typed.
3. `click <Submit>`.

## Change case ("Type "X" in all lower case")
- Convert the text yourself before typing. Typing it as quoted failed 048.
- Then `type 1 <converted>`, check `value=`, and `click <Submit>`.

## Copy-paste
- The textarea's text is shown in the element list as `value="…"`. Skip the clipboard: `type <answer input> <that text>`, then Submit.
- `ctrl+a` is not a valid key name; use `Control+A`.

## Date (`input type="date"`, mm/dd/yyyy) — passed in 051 and 052
- `type 1 07152017` and `type 1 07/15/2017` both land in the YEAR segment and give `mm/dd/152017`. Failed: 045, 046.
- `press Left` errors. Opening the calendar icon or picker ended the episode with no date.
- Recipe that worked (field @x,y with height h):
```
mw <<'EOF'
clickxy <x+10> <y+h/2>
press <M1>
press <M2>
press <D1>
press <D2>
press <Y1>
press <Y2>
press <Y3>
press <Y4>
EOF
```
  - Use one `press` per digit, with zero padding: 01/23/2017 is `0 1 2 3 2 0 1 7`.
  - In those sessions the field was @7,62, so the click went to `clickxy 15–18 72`.
  - Then check the observation shows `value="YYYY-MM-DD"`, and `click <Submit>`.
