"""Original loopable Sesh sound recordings, synthesized from scratch; no samples."""
import wave, math, random, struct
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public'/'atelier'/'sound'
root.mkdir(exist_ok=True)
rate=22050
def render(name,duration,fun):
    rng=random.Random(91); out=bytearray(); state=[0.,0.]
    for j in range(int(rate*duration)):
        t=j/rate; edge=min(1.,t/.04,(duration-t)/.04)
        out.extend(struct.pack('<h',int(max(-.98,min(.98,fun(t,rng,state)*edge))*32767)))
    with wave.open(str(root/(name+'.wav')),'wb') as w:w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(out)
seq=[48,55,62,64,67,64,62,55,45,52,59,60,64,60,59,52,41,48,55,57,60,57,55,48,43,50,57,59,62,59,57,50]
def note(n,t):
    pitch=440*2**((n-69)/12);w=2*math.pi*pitch*t
    return min(1,t/.009)*(.29*math.exp(-2.4*t)*(math.sin(w)+.20*math.sin(w*1.0015))+.13*math.exp(-4.4*t)*math.sin(w*2.001)+.055*math.exp(-5.7*t)*math.sin(w*3.008))
def etude(t,r,s):
    beat=t/.43; i=int(beat); v=0
    for d in range(5):
        k=i-d; age=(beat-k)*.43;v+=note(seq[k%32],age)
        if k%8==0:v+=.43*note(seq[k%32]-12,age)
    return v*.86
def rain(t,r,s):
    n=r.uniform(-1,1);s[0]=s[0]*.964+n*.036;s[1]=s[1]*.63+n*.37
    return (.64*s[1]+.62*s[0])*(.70+.12*math.sin(2*math.pi*t/8))
def nature(t,r,s):
    n=r.uniform(-1,1);s[0]=.984*s[0]+.016*n
    k=t%4;bird=0
    for onset,f in [(.3,1900),(.68,2240),(2.38,1660)]:
        u=k-onset
        if 0<u<.23:bird+=.075*math.sin(math.pi*u/.23)**2*math.sin(2*math.pi*(f*u+550*u*u))
    return s[0]*1.3+bird
def lofi(t,r,s):
    u=t%(.43*2);kick=.25*math.exp(-u*21)*math.sin(2*math.pi*(55*u+2*(1-math.exp(-u*38))));h=t%.43
    return .54*etude(t,r,s)+kick+.04*r.uniform(-1,1)*math.exp(-h*42)
render('piano',13.76,etude);render('rain',8,rain);render('nature',8,nature);render('lofi',13.76,lofi)
