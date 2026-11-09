# Find and click the HOT area (hidden hot spot, hot/cold signal)
Tasks like: "Find and click on the HOT area."

## How it works
- The box looks blank. Clicking anywhere in it ends the episode, and a wrong spot scores -1. Do NOT guess (a guess at 80,150 failed 4 of 4 times) and do NOT click to test.
- When the mouse moves over the box, a text below it shows ICE COLD / COLD / WARM / HOT. The HOT disc is tiny, about 9 px across.
- Move the mouse without clicking: `dragxy 400 300 <x> <y>`. Start at 400,300, on the grey background. A drag that starts in the yellow task text never updates the signal.
- Run the script below as your FIRST and ONLY action, in one Bash call. No screenshot first (reward decays with time). The script probes about 5 to 15 points, picking each one to rule out the most places, and then it clicks the first HOT point. It passed 10 of 10 at reward 1 (~4 s).

```
python3 - <<'EOF'
import subprocess as S,re,numpy as np
L=[36,7,2.5,0];U=[1e9,41,12,6];N=['ICE COLD','COLD','WARM','HOT']
g=np.mgrid[3:158,53:178].reshape(2,-1).astype(float)
for n in range(40):
 s=g[:,::max(1,g.shape[1]//300)]
 D=np.hypot(*(g[:,None,:]-s[:,:,None]))
 x,y=s[:,np.argmin(np.max([((D>=L[i])&(D<=U[i])).sum(1) for i in range(4)],0))].astype(int)
 o=S.run(['mw','dragxy','400','300',str(x),str(y)],capture_output=True,text=True).stdout
 l=N.index(re.findall(r'"(HOT|WARM|COLD|ICE COLD)"',o)[-1]);print(x,y,N[l])
 if l==3:print(S.run(['mw','clickxy',str(x),str(y)],capture_output=True,text=True).stdout);break
 d=np.hypot(g[0]-x,g[1]-y);g=g[:,(d>=L[l])&(d<=U[l])]
EOF
```
- Success looks like this: the last lines say `clicked at X,Y` and `The episode has ended.` Then reply DONE.
- If it stops without HOT, do NOT give up: run it once more.
