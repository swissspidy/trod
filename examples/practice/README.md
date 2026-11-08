# Practice forging: a toy example

Each attempt gives you `input.txt` (five numbers) and asks for "the right total" in `answer.txt`. The rule the
checker uses is never stated: numbers on even lines count double. Reading the files cannot reveal that; practice can.

```sh
cp -r examples/practice /tmp/practice && cd /tmp/practice && git init -q . && ./gen.sh
trod forge --brief "Each attempt gives you input.txt with numbers. Write the right total into answer.txt. Nobody says how the total is computed." \
  --practice ./check.sh --reset ./gen.sh --model claude-haiku-5-5
```

`check.sh` exits 0 when the answer is right (the forge calls it as `trod-try`); `gen.sh` starts a fresh attempt
(`trod-reset`). In our run Haiku passed 11 of 16 attempts for $0.03, wrote the rule into `.trod/notes.md`
(`forged-notes.md` here) and trod linked it into `CLAUDE.md`, so every later session knows it. Notes from a forge that
never passes the check are not linked.

Use the same pattern on real projects: the check can be a test suite (`npm test`), a grader, a linter or a smoke test.
