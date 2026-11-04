import sys
from PIL import Image
files=sys.argv[2:]; cols=2
ims=[Image.open(f) for f in files]
w,h=ims[0].size
out=Image.new('RGB',(cols*w+(cols-1)*4,((len(ims)+cols-1)//cols)*(h+4)),(255,0,255))
for i,im in enumerate(ims): out.paste(im,((i%cols)*(w+4),(i//cols)*(h+4)))
out.save(sys.argv[1])
