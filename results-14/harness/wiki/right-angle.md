# Right angle: place a third point, then submit
Tasks like: "Add a third point to create a right angle, then press submit."

## Rules
- The right angle goes at the BLUE point (`circle#init-blue`): blue→P must be perpendicular to blue→black. Do NOT put the angle at the new point (circle with diameter black–blue). That earned only ~0.5 or −1.
- A click puts the new centre 2 px right and 2 px down, so click at target − (2,2). Without this the reward drops to ~0.96.
- The canvas is x 10–150, y 60–166 (not the yellow bar or Submit). Use an arm about as long as blue→black that fits, on an exact integer multiple of the perpendicular (the script does this).
- Speed counts. Do it all in ONE Bash call, the script below. No screenshot, no wiki reading, no checking.

## Recipe (exact right angle on the pixel grid)
Run exactly this as one Bash command (clicks P, then Submit):
```
python3 - <<'P'
import re,subprocess as S
o=S.run(['mw','observe'],capture_output=True,text=True).stdout
def c(n):x,y,w,h=map(int,re.search(n+r'.*?@(-?\d+),(-?\d+) (\d+)x(\d+)',o).groups());return x+(w-1)/2,y+(h-1)/2  # observe rounds the .5 edge up
bx,by=c('init-black');ux,uy=c('init-blue');i=re.search(r'\[(\d+)\] button#subbtn',o).group(1)
import math
# The page scores the angle between bounding-box corners: the new circle (r 3) sits 0.5 px off the given ones (r 3.5),
# and a click lands its centre 2 px right and down. Search every click for the smallest angle error, prefer long arms.
ax,ay=bx-ux,by-uy;best=None
for X in range(10,151):
 for Y in range(60,167):
  vx,vy=X-ux+2.5,Y-uy+2.5;n=math.hypot(vx,vy)
  if n<20:continue
  e=abs(math.degrees(math.acos(max(-1,min(1,(ax*vx+ay*vy)/(n*math.hypot(ax,ay))))))-90)
  k=(round(e,4),-n)
  if best is None or k<best[0]:best=(k,X,Y)
_,X,Y=best
print(S.run(['mw'],input=f'clickxy {X} {Y}\nclick {i}\n',capture_output=True,text=True).stdout)
P
```
Output shows "clicked at …" and "The episode has ended." Then reply DONE.

## Manual fallback (only if the script errors)
centre = (@x + w/2, @y + h/2). B = black, U = blue, d = B − U.
P = U + s·(−dy, dx) or U − s·(−dy, dx), with the largest s ≤ 1 that keeps P inside the canvas.
Then `mw <<'EOF'` with `clickxy <round(Px−2)> <round(Py−2)>` and `click <Submit id>` in one batch.
