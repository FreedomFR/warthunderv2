import numpy as np, json, sys, colorsys
from PIL import Image, ImageDraw
# Orthographic pictures (top, side, front from both ends) of the materials of a baked model, in the model's own frame, each material in its colour (or the colour of its texture):
#   python3 tools/refs/matview.py refs/<id>/split <mat,mat,...|all> out.png [tex]
# (to tell which material is the skin, the interior, the glass, the propellers, the bombs: the numbers are those of the `mats` of info.json and of `--probe`)
src=sys.argv[1]; sys.argv=[sys.argv[0]]+sys.argv[2:]
mats_all=None
info=json.load(open(src+'/info.json')); nv=info['vertices']
P=np.fromfile(src+'/pos.f32',dtype=np.float32).reshape(nv,3)
VM=np.fromfile(src+'/vmat.i16',dtype=np.int16)
C=np.fromfile(src+'/colfull.u8',dtype=np.uint8).reshape(nv,3)
mats=list(range(len(info['mats']))) if sys.argv[1]=='all' else [int(a) for a in sys.argv[1].split(',')]; out=sys.argv[2]
tex = len(sys.argv)>3 and sys.argv[3]=='tex'
cols=[tuple(int(c*255) for c in colorsys.hsv_to_rgb(i/max(1,len(info['mats'])),0.7,0.95)) for i in range(len(info['mats']))]
k=np.isin(VM,mats); Pm=P[k]; Vm=VM[k]; Cm=C[k]
def view(ax,ay,az,sgn,W,H):
    # draw nearest along axis az (sign sgn: larger az*sgn nearer)
    x=Pm[:,ax]; y=Pm[:,ay]; d=Pm[:,az]*sgn
    x0,x1=x.min(),x.max(); y0,y1=y.min(),y.max(); s=min((W-20)/(x1-x0),(H-20)/(y1-y0))
    xs=((x-x0)*s+10).astype(int); ys=(H-10-(y-y0)*s).astype(int)
    order=np.argsort(d)  # far first, near last overwrite
    im=np.full((H,W,3),30,np.uint8)
    for r in (0,1):  # 2x2 splat
        for q in (0,1):
            xx=np.clip(xs[order]+r,0,W-1); yy=np.clip(ys[order]+q,0,H-1)
            im[yy,xx]=(Cm[order] if tex else np.array([cols[m] for m in range(len(info['mats']))],np.uint8)[Vm[order]])
    return Image.fromarray(im)
a=view(0,2,1,1,900,520); b=view(2,1,0,1,900,520); c=view(0,1,2,1,900,420); d=view(0,1,2,-1,900,420)
Wd=Image.new('RGB',(1800,940)); Wd.paste(a,(0,0)); Wd.paste(b,(900,0)); Wd.paste(c,(0,520)); Wd.paste(d,(900,520)); Wd.save(out)
