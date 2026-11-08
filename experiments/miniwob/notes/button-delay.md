# button-delay notes

RULES
- Clicking TWO ends the episode. Clicking TWO too early or too late only gets part credit (0.35–0.6 seen).
- Start the wait right after clicking ONE. Run nothing in between (no observe, no screenshot). Each mw call takes about 0.25 s.
- Sleep N−0.2 s, where N is the "wait N seconds" from the task text. This scored 1 every time for N=1,2,3. Waits that ran long (about 1.7 s for N=1, 4.7 s for N=3) and an early TWO (about 0.75 s for N=1) got 0, 0.35 or 0.6.
- Find each button by its label "ONE"/"TWO", not by id order.
- The buttons can overlap, and TWO is drawn on top. Then `click <ONE id>` lands on TWO and scores −1. So click ONE with `clickxy` on a spot TWO does not cover. `@x,y` is the top-left corner and each box is 40x40.
- Time since reset does not matter: an 8 s idle before acting still scored 1. Plan first, then do the click, sleep, click in ONE bash command.
- Plain `sleep` may be blocked. Use python3 -c "import time;time.sleep(S)".

RECIPE (one bash command)
1. `mw observe`: note N, ONE @ax,ay, TWO @bx,by and TWO's id.
2. Pick a point (px,py) inside ONE, x in [ax+3,ax+37] and y in [ay+3,ay+37], that is NOT inside [bx-2,bx+42]x[by-2,by+42]. Prefer (ax+20,ay+20) if it is not covered.
3. `mw clickxy <px> <py>; python3 -c "import time;time.sleep(<N>-0.2)"; mw click <TWO id>`
