# Pictures of a model in the GAME's frame (x forward, y up, z starboard, metres), cropped to a box: the places of things to write in a config (boxes of rules, positions of guns, engines).
#   python3 planegroups.py refs/<id>/split <cfg> --qdump=refs/<id>/q.npz      (once)
#   python3 tools/refs/qview.py refs/<id>/q.npz <mats|all> <side|top|front|bottom> <x0,x1,y0,y1,z0,z1> <out.png> [tex] [px_per_m]
import numpy as np, json, sys, colorsys
from PIL import Image
d=np.load(sys.argv[1]); Q=d['Q']; VM=d['VM']; C=d['C']
sys.argv=[sys.argv[0]]+sys.argv[2:]
mats=list(range(int(VM.max())+1)) if sys.argv[1]=='all' else [int(a) for a in sys.argv[1].split(',')]
view=sys.argv[2]; box=[float(a) for a in sys.argv[3].split(',')]; out=sys.argv[4]
tex='tex' in sys.argv[5:]
ppm=float([a for a in sys.argv[5:] if a!='tex'][0]) if len([a for a in sys.argv[5:] if a!='tex']) else 60
k=np.isin(VM,mats)&(Q[:,0]>=box[0])&(Q[:,0]<=box[1])&(Q[:,1]>=box[2])&(Q[:,1]<=box[3])&(Q[:,2]>=box[4])&(Q[:,2]<=box[5])
q=Q[k]; vm=VM[k]; c=C[k]
cols=np.array([[int(v*255) for v in colorsys.hsv_to_rgb(i/max(1,int(VM.max())+1),0.7,0.95)] for i in range(int(VM.max())+1)],np.uint8)
col=c if tex else cols[vm]
ax,ay,depth,sgn={'side':(0,1,2,1),'top':(0,2,1,1),'front':(2,1,0,1),'bottom':(0,2,1,-1)}[view]
x=q[:,ax]; y=q[:,ay]; d=q[:,depth]*sgn
fx=(-1 if view=='front' else 1)
W=int((box[1]-box[0])*ppm) if view!='front' else int((box[5]-box[4])*ppm)
lo={'side':(box[0],box[2],box[3]),'top':(box[0],box[4],box[5]),'front':(box[4],box[2],box[3]),'bottom':(box[0],box[4],box[5])}[view]
H=int((lo[2]-lo[1])*ppm)
W=max(W,50); H=max(H,50)
xs=((x-lo[0])*ppm).astype(int); ys=(H-1-((y-lo[1])*ppm)).astype(int)
o=np.argsort(d)
im=np.full((H,W,3),30,np.uint8)
for r in (0,1,2):
    for t in (0,1,2):
        im[np.clip(ys[o]+t-1,0,H-1),np.clip(xs[o]+r-1,0,W-1)]=col[o]
Image.fromarray(im).save(out)
print(out,W,H)
