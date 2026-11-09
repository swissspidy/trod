# Tic-tac-toe as X: run a solver script
Tasks like: "Playing as '<X>', win a game of tic-tac-toe."

- No elements. Cells: clickxy x=33,78,122 (cols), y=83,127,171 (rows). O may move first and answers each click at once.
- O blocks/wins only about half the time. A draw gives negative reward like a loss, so safe "centre then block" play that draws FAILS. Hand play from screenshots drew/lost; don't.
- Run this in ONE Bash call, copied exactly. It reads the board, clicks the move with the best win chance, and repeats until the episode ends:
```
python3 - <<'EOF2'
import subprocess as S,time
from PIL import Image
from functools import lru_cache as C
P=[(x,y) for y in(83,127,171) for x in(33,78,122)]
L=[(0,1,2),(3,4,5),(6,7,8),(0,3,6),(1,4,7),(2,5,8),(0,4,8),(2,4,6)]
w=lambda b,p:any(b[i]==b[j]==b[k]==p for i,j,k in L)
u=lambda b,i,p:b[:i]+p+b[i+1:]
E=lambda b:[i for i in range(9) if b[i]=='.']
F=lambda b,p:[i for i in E(b) if w(u(b,i,p),p)]
@C(None)
def X(b):return 0 if w(b,'O') or not E(b) else max(O(u(b,i,'X')) for i in E(b))
@C(None)
def O(b):
 if w(b,'X'):return 1
 if not E(b):return 0
 a=lambda m:sum(X(u(b,i,'O')) for i in m)/len(m)
 return (a(F(b,'O') or F(b,'X') or E(b))+a(E(b)))/2
m=lambda *a:S.run(['mw',*a],capture_output=True,text=True).stdout
while 'ended' not in m('screenshot','/tmp/b.png'):
 g=Image.open('/tmp/b.png').convert('L').getpixel
 b=''.join('X' if g(p)<150 else 'O' if g((p[0]+17,p[1]))<150 else '.' for p in P)
 if not E(b):break
 i=max(E(b),key=lambda i:O(u(b,i,'X')));print(b,i,m('clickxy',*map(str,P[i])));time.sleep(.3)
EOF2
```
- Last output must contain "The episode has ended." If it crashed, fix the typo and run it again (it resumes from the current board). Then reply DONE.
