# copy-paste task notes

RULES
- Clicking Submit ends the episode, right or wrong. Check the input's value before you click it.
- Do NOT use `type` for the answer. The source text usually ends with a trailing space, and `type` strips it. That makes the answer wrong (reward -1, seen).
- Copy with the real clipboard instead. It keeps the text exactly, including the trailing space (seen 4/4).
- Element ids change between episodes: the textarea and the input swap order. Before acting, read the ids from `mw observe`: textarea#to-copy, input#answer-input, button#subbtn.
- Before copying, click the textarea first. Otherwise Control+A/Control+C copy nothing useful.

RECIPE (worked 4 times in a row)
```
mw observe                  # note ids <TA>, <IN>, <BTN>
mw click <TA>               # textarea#to-copy
mw press Control+A
mw press Control+C
mw click <IN>               # input#answer-input
mw press Control+A          # select anything already there
mw press Control+V          # check: value matches the textarea exactly, trailing space included
mw click <BTN>              # Submit -> episode ends
```
