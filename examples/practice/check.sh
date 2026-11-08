#!/bin/sh
# Hidden rule: the answer is the sum of the numbers, where every number on an even line counts double.
[ -f answer.txt ] || { echo "no answer.txt yet"; exit 1; }
want=$(awk '{ s += (NR % 2 == 0 ? 2 : 1) * $1 } END { print s }' input.txt)
got=$(tr -d ' \n' < answer.txt)
[ "$got" = "$want" ] && { echo "correct"; exit 0; } || { echo "wrong answer"; exit 1; }
