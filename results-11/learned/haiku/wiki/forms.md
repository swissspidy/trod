# Forms: autocomplete, radio + textbox, text case, dates

Autocomplete ("Enter an item that starts with P and ends with S"):
- Recipe: `click <input>`, `type <input> <prefix>`, read the suggestion items in the listing, keep only the one that matches both start and end, `click <suggestion id>`, then `click <Submit id>`.
- 006 typed "Pan", picked "Panama", pressed Submit: pass. 007-009 picked correct items but never pressed Submit: all failed.

Radio + textboxes ("Check the 3rd radio button and enter 26 into the 3rd textbox"):
- One batch: `click <radio>`, `click <textbox>`, `type <textbox> 26`, then `click <Submit>`. Re-read the listing: `checked` on the radio, `value="26"` on the textbox.
- 041-044 set the values and stopped without Submit. All failed.

Text case ("Type JERALD in all lower case"):
- Write the exact string first. `type` clears the field and types. Check `value="..."` in the listing, then Submit. 048 typed uppercase and failed.

Dates (`input type="date"`, e.g. "Enter 07/15/2017"):
- Typing a whole date string fills the wrong segments (045, 046 ended in a calendar popup or `0123`). Do not use the calendar picker.
- Recipe that passed (051, 052): `click <date id>`, then `clickxy <x+11> <y+10>` on the month segment (input at @7,62 -> `clickxy 18 72`), then `press` each digit of MMDDYYYY separately: 0,7,1,5,2,0,1,7. Check the listing shows `value="2017-07-15"`, then `click <Submit>`.
