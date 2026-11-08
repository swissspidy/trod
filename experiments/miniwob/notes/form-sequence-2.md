# form-sequence-2 NOTES

Task looks like: "Check the <Nth> radio button and enter the number "<num>" into the <Mth> textbox."
Layout seen every time: 3 radios (ids 1-3, value=1..3, left to right), 3 textboxes (input-1..input-3, ids 4-6), then a Submit button (id 7). Check the ids in your own observation before acting.

RULES
- Clicking Submit ends the episode right away, right or wrong. Click it LAST, only after you have checked the radio AND filled the textbox. (Submitting with no radio checked scored -1.)
- You MUST click Submit. Filling the form alone leaves reward 0 with the episode still running, and pressing Enter in a textbox does NOT submit.
- Count "Nth" by position, starting from 1: 1st radio = radio value="1", 2nd textbox = input#input-2.
- Type the number exactly as given, including a leading minus ("-5" works fine as `mw type <id> -5`).
- The order of the radio click and the typing does not matter.
- Before Submit, check the observation output: the radio should show `checked` and the textbox should show `value="<num>"`.

RECIPE (solved 6 of 7; the one failure was a deliberate test that skipped the radio)
  mw click <radio id for Nth>
  mw type <textbox id for Mth> <num>
  (check the output: radio checked, value="<num>")
  mw click <Submit id>
