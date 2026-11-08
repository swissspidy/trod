#!/bin/sh
# New attempt: 5 random numbers, one per line.
for i in 1 2 3 4 5; do echo $(( $(od -An -N2 -tu2 /dev/urandom) % 100 )); done > input.txt
rm -f answer.txt
