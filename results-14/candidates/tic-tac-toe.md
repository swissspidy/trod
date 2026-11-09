# Tic-tac-toe as X: run a solver script
Tasks like: "Playing as '<X>', win a game of tic-tac-toe."

- No elements. Cells: clickxy x=33,78,122 (cols), y=83,127,171 (rows). O may move first and answers each click at once.
- O plays a random cell 55% of the time, else wins/blocks (exact policy in the script). A draw gives negative reward like a loss, so safe "centre then block" play that draws FAILS. Hand play from screenshots drew/lost; don't.
- Run this in ONE Bash call, copied exactly. It reads the board, clicks the move with the best win chance, and repeats until the episode ends:
```
python3 - <<'EOF2'
import subprocess as S,time,os,tempfile
from PIL import Image
from functools import lru_cache as C
P=[(x,y) for y in(83,127,171) for x in(33,78,122)]
L=[(0,1,2),(3,4,5),(6,7,8),(0,3,6),(1,4,7),(2,5,8),(0,4,8),(2,4,6)]
w=lambda b,p:any(b[i]==b[j]==b[k]==p for i,j,k in L)
u=lambda b,i,p:b[:i]+p+b[i+1:]
E=lambda b:[i for i in range(9) if b[i]=='.']
F=lambda b,p:[i for i in E(b) if w(u(b,i,p),p)]
# O's exact policy (page source): first move random; then 55% a random free cell, 45% "smart":
# its own winning cell, else a cell that blocks X, else random. Each check returns the LAST hit in this order.
R=[[(r*3,r*3+1,r*3+2) for r in range(3)],[(r*3+1,r*3,r*3+2) for r in range(3)],[(r*3+2,r*3,r*3+1) for r in range(3)]]
D=[(0,4,8),(4,0,8),(8,0,4),(2,4,6),(4,2,6),(6,2,4)]
V=[[(0,3,6),(3,0,6),(6,0,3)],[(1,4,7),(4,1,7),(7,1,4)],[(2,5,8),(5,2,8),(8,2,5)]]
def hit(b,p):
 out=None
 for grp in R+[D]+V:
  for c,x,y in grp:
   if b[c]=='.' and b[x]==b[y]==p:out=c;break
 return out
def sm(b):
 h=hit(b,'O');return h if h is not None else hit(b,'X')
@C(None)
def X(b):return 0 if w(b,'O') or not E(b) else max(O(u(b,i,'X')) for i in E(b))
@C(None)
def O(b):
 if w(b,'X'):return 1
 if not E(b):return 0
 r=sum(X(u(b,i,'O')) for i in E(b))/len(E(b));s=sm(b)
 return .55*r+.45*(X(u(b,s,'O')) if s is not None else r)
m=lambda *a:S.run(['mw',*a],capture_output=True,text=True).stdout
T=os.path.join(tempfile.gettempdir(),f'ttt-{os.getpid()}.png')  # one file per solver: parallel episodes share /tmp
while 'ended' not in m('screenshot',T):
 g=Image.open(T).convert('L').getpixel
 b=''.join('X' if g(p)<150 else 'O' if g((p[0]+17,p[1]))<150 else '.' for p in P)
 if not E(b):break
 i=max(E(b),key=lambda i:O(u(b,i,'X')));r=m('clickxy',*map(str,P[i]));print(b,i,r)
 if 'ended' in r:break
 time.sleep(.3)
EOF2
```
- Last output must contain "The episode has ended." If it crashed, fix the typo and run it again (it resumes from the current board). Then reply DONE.
