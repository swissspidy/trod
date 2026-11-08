# Environment notes: weighted-sum attempts

## What an attempt is
- Each attempt has input.txt: 5 lines, one integer each. Read it as is; nothing else in the project changes the numbers.
- The task is to write the total into answer.txt. Nobody states the formula in the task; the rule below is the one the checker applies (confirmed by trod-try).
- RULE: total = sum over lines of value x weight, where weight is 1 for odd line numbers (1, 3, 5) and 2 for even line numbers (2, 4). Line numbers are 1-based. Do not use a plain sum: a plain sum fails trod-try.
- RULE: answer.txt holds one plain integer, e.g. `288`. Surrounding spaces and newlines are fine. A decimal form such as `259.0` fails, so do not write a decimal point, commas or units.
- RULE: write answer.txt in the attempt directory (the project root), not elsewhere.

## Checking
- RULE: run the check only through `trod-try` (or the check_answer tool, which calls it). Run it from the attempt directory: the checker reads answer.txt by relative path, so from another directory it reports "no answer.txt yet" even when answer.txt exists.
- trod-try prints `correct` (exit 0) or `wrong answer` (exit 1). It prints no reason, so if it fails, recheck the weighting, the 1-based line numbers and the integer format before changing anything else.
- trod-try only reads answer.txt and logs the run. Re-running it is harmless.

## Starting a new attempt
- RULE: run `trod-reset` only to start a new attempt; it replaces input.txt with new random numbers. Do not run it in the middle of an attempt you still need to answer.
- trod-reset writes input.txt and removes answer.txt. Read the new input after the reset, not before.

## Recipe (per attempt)
1. From the attempt directory, read input.txt (or attempt_input). Line k has value v_k.
2. total = v_1 + 2*v_2 + v_3 + 2*v_4 + v_5 (general: weight 2 for even k, 1 for odd k).
3. Write the total as a plain integer to answer.txt, e.g. `echo <total> > answer.txt`.
4. Run trod-try from the attempt directory (or check_answer). Expect `correct`.
5. If it fails, recheck step 2 and step 3; do not change the input or the check.
