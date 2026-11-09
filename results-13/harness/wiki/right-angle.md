# Right angle: place a third point, then submit
Tasks like: "Add a third point to create a right angle, then press submit."

## Rules
- The right angle goes at the BLUE point (`circle#init-blue`): blue→P must be perpendicular to blue→black. Do NOT put the angle at the new point (circle with diameter black–blue). That earned only ~0.5 or −1.
- A click puts the new centre 2 px right and 2 px down, so click at target − (2,2). Without this the reward drops to ~0.96.
- The canvas is x 10–150, y 60–166 (not the yellow bar or Submit). Use the longest arm that fits.
- Speed counts. Do it all in ONE Bash call, the script below. No screenshot, no wiki reading, no checking.

## Recipe (passed 6 of 6 at 0.985–0.996)
Run exactly this as one Bash command (clicks P, then Submit):
```
python3 - <<'P'
import re,subprocess as S
o=S.run(['mw','observe'],capture_output=True,text=True).stdout
def c(n):x,y,w,h=map(int,re.search(n+r'.*?@(-?\d+),(-?\d+) (\d+)x(\d+)',o).groups());return x+w/2,y+h/2
bx,by=c('init-black');ux,uy=c('init-blue');i=re.search(r'\[(\d+)\] button#subbtn',o).group(1)
dx,dy=bx-ux,by-uy
for s in(1,.9,.8,.7,.6,.5,.4,.3,.2,.1):
 ok=[(ux-dy*k,uy+dx*k) for k in(s,-s) if 10<=ux-dy*k<=150 and 60<=uy+dx*k<=166]
 if ok:px,py=ok[0];break
print(S.run(['mw'],input=f'clickxy {round(px-2)} {round(py-2)}\nclick {i}\n',capture_output=True,text=True).stdout)
P
```
Output shows "clicked at …" and "The episode has ended." Then reply DONE.

## Manual fallback (only if the script errors)
centre = (@x + w/2, @y + h/2). B = black, U = blue, d = B − U.
P = U + s·(−dy, dx) or U − s·(−dy, dx), with the largest s ≤ 1 that keeps P inside the canvas.
Then `mw <<'EOF'` with `clickxy <round(Px−2)> <round(Py−2)>` and `click <Submit id>` in one batch.
