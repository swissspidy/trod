# enter-text-2 NOTES

Task: 'Type "<WORD>" in all lower|upper case letters in the text input and press Submit.'
Elements: [1] input#tt, [2] button "Submit" (ids from the latest observation).

RULES
- Read the case word every time. Both "lower case" and "upper case" episodes happen, and the quoted word may be in the opposite case (e.g. "enola" + upper case -> ENOLA).
- Convert the WHOLE word to the requested case. Change the letters only: no quotes, no spaces, no extra characters.
- Clicking Submit ends the episode, right or wrong. Submitting the word in the wrong case gave reward -1. Check the value= shown after `type` before you click.
- Pressing Enter in the input does NOT submit (reward stayed 0 and the episode kept running). Click Submit.
- `type` clears the field first, so retyping before Submit is safe.

RECIPE (solved 4 of 4 this way)
1. mw type <input id> <WORD converted to requested case>
2. Check that the observation shows value="<converted word>"
3. mw click <Submit id>
