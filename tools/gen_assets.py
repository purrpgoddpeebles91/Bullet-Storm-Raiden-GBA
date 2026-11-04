#!/usr/bin/env python3
"""Bullet Storm Raiden - original pixel art generator.
Draws every sprite / tile programmatically (ASCII art + Pillow primitives),
converts to GBA 4bpp tiles and writes game/src/assets.c + game/include/assets.h.
Also writes preview PNGs to dist/art/.
All art here is original."""
import os, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, 'game')
ART = os.path.join(ROOT, 'dist', 'art')
os.makedirs(ART, exist_ok=True)
os.makedirs(os.path.join(GAME, 'src'), exist_ok=True)
os.makedirs(os.path.join(GAME, 'include'), exist_ok=True)

def rgb15(c):
    r, g, b = c
    return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

# ---------------------------------------------------------------- palettes
# OBJ palette banks (16 colours each, index 0 transparent)
OBJ_PALS = {
 0: ('hero',  ".kbcCwoyrgGpnteV", ['000000','101018','203078','30c0f0','a8f0ff','ffffff','ff7818','ffe040','e02828','8890a8','485060','ff90c8','a06030','e8b878','40d060','9050e0']),
 1: ('bullet',".DropwylbmMOngPe", ['000000','600010','e02020','ff5030','ff70b0','ffffff','ffe040','90d8ff','3070ff','d030c0','ff90f0','ff9020','b05010','a0a0b0','ffc0e0','80ffc0']),
 2: ('twilight',".kvVmMdrRgGLwyco",['000000','100818','482070','8040c0','d050d0','ff90f0','601018','a02028','e04040','383848','707888','b0b8c8','ffffff','ffe040','40e0ff','ff8020']),
 3: ('nightmare',".kvVmMdrRgGLwyco",['000000','080004','301030','602060','a02040','e04060','400008','701010','c02010','202024','484850','808088','e0d0d0','ff4020','ff2020','ff8000']),
 4: ('dream', ".kpPwyYmMbBvodEn", ['000000','503058','ff80b8','ffc0dc','ffffff','ffe050','fff4a0','60e0b0','b0ffe0','60b0ff','b8e0ff','c0a0ff','ff9840','ff5060','201828','a06838']),
 5: ('bossN', ".k123456789ABCDE", ['000000','080408','281820','483038','685058','908088','400810','801018','d02020','ff6040','ffd040','204060','40a0ff','b0f0ff','ffffff','603000']),
 6: ('bossD', ".k123456789ABCDE", ['000000','301838','6048a0','9070d0','c0a0f0','ffe8a0','c04080','ff70b0','ff3080','ff90c0','fff080','40a090','60f0c0','e0fff0','ffffff','f0a060']),
 7: ('portrait',".k23456789ABCDEF",['000000','180c10','f8c8a0','d09070','804020','482010','30c0f0','c0f8ff','e02828','801018','ffffff','100818','6030a0','ff2020','ff9090','2848a0']),
 8: ('flash', ".", ['000000'] + ['ffffff']*15),
 9: ('gold', ".", ['000000','503000','a07000','ffd000','fff8a0','ffffff','ff8000','804000','ffffff','ffffff','ffffff','ffffff','ffffff','ffffff','ffffff','ffffff']),
}

# BG palette banks.  text banks: 1=fg 2=shadow 3=panel bg
PANEL = '101838'
TEXT_PALS = {
 0: ['000000','ffffff','000010',PANEL],   # white
 1: ['000000','ffe040','301800',PANEL],   # yellow
 2: ['000000','101010','ff9020','ff9020'],# highlight: dark text on orange
 3: ['000000','707890','000010',PANEL],   # grey
 4: ['000000','60e0ff','001830',PANEL],   # cyan
 5: ['000000','ff5050','300000',PANEL],   # red
 6: ['000000','ffa0e0','300020',PANEL],   # pink
 11:['000000','70ff90','002000',PANEL],   # green
 12:['000000','c090ff','100020',PANEL],   # purple
}
UI_PAL = ['000000', PANEL, '5878d0', 'c0d8ff', '080c20', 'e03030', '401018', 'ffe040', '50e070', 'ff9020', 'c070ff', 'ffffff', '3050a0', '808898', 'ff80c0', '60e0ff']

# ---------------------------------------------------------------- helpers
def tiles_from_img(img, w, h):
    """img: P-mode image (indices). returns list of 32-byte tiles (1D sprite order)."""
    out = []
    px = img.load()
    for ty in range(h // 8):
        for tx in range(w // 8):
            t = bytearray()
            for y in range(8):
                for x in range(0, 8, 2):
                    a = px[tx*8+x, ty*8+y] & 15
                    b = px[tx*8+x+1, ty*8+y] & 15
                    t.append(a | (b << 4))
            out.append(bytes(t))
    return out

def ascii_img(rows, chars, w, h):
    img = Image.new('P', (w, h), 0)
    px = img.load()
    for y, r in enumerate(rows[:h]):
        if len(r) != w:
            print('  warn: row width', len(r), '!=', w, repr(r))
        for x, ch in enumerate(r[:w]):
            if ch in chars:
                px[x, y] = chars.index(ch)
    return img

def new(w, h):
    return Image.new('P', (w, h), 0)

def hflip(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)

def outline(img, col=1):
    """add a 1px outline of index col around non-zero pixels"""
    w, h = img.size
    src = img.load(); out = img.copy(); o = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y] == 0:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    xx, yy = x+dx, y+dy
                    if 0 <= xx < w and 0 <= yy < h and src[xx, yy] not in (0, col):
                        o[x, y] = col; break
    return out

# ---------------------------------------------------------------- sprites
SPRITES = []   # (name, size, bank, [frames imgs])
def add(name, size, bank, frames):
    SPRITES.append((name, size, bank, frames))

H = OBJ_PALS[0][1]
B1 = OBJ_PALS[1][1]
TW = OBJ_PALS[2][1]
DR = OBJ_PALS[4][1]

# --- player ships (16x16, hero bank), 2 frames each (thruster flicker)
jet = [
"................",
"................",
"................",
"................",
"....kk..........",
"....kcck........",
"...kkcccckkk....",
"FF.kbcCCwwCckk..",
"FFFkbcccccccccck",
"FF.kbbbbbcccckk.",
"...kbbbkkkkkk...",
"...kbbk.........",
"....kk..........",
"................",
"................",
"................"]
def jet_frame(fl):
    rows = [r.replace('FF.', fl[0]).replace('FFF', fl[1]) for r in jet]
    return ascii_img(rows, H, 16, 16)
add('SHIP_JET', 16, 0, [jet_frame(('oy.', 'yyw')), jet_frame(('.o.', 'oyy'))])

paper = [
"................",
"................",
"................",
"................",
"...........kk...",
"........kkkwwk..",
".....kkkwwwwwwk.",
"..kkkwwwwwwwwwwk",
"kkwwwwwwwwwwwwk.",
".kgggggggwwwwk..",
"..kgggggggwkk...",
"...kkggggk......",
".....kkkk.......",
"................",
"................",
"................"]
paper2 = list(paper); paper2[8] = "pkwwwwwwwwwwwwk."; paper2[9] = "pkgggggggwwwwk.."
add('SHIP_PAPER', 16, 0, [ascii_img(paper, H, 16, 16), ascii_img(paper2, H, 16, 16)])

peng = [
"................",
".....kkkkk......",
"....kGGGGGk.....",
"...kGgggggGk....",
"...kkkkkkkkkk...",
"...kGwwkwwwk....",
"...kGwwwkwwyyk..",
"..kGGwwwwwooook.",
".kGGGwwwwwwk....",
"FFGGGwwwwwwwk...",
"FFkGGwwwwwwwk...",
"FFkGGGwwwwwk....",
"...kGGGwwwk.....",
"....koook ok....",
"....kkk..kk.....",
"................"]
def peng_frame(a, b, c):
    rows = list(peng)
    rows[9] = a + rows[9][2:]; rows[10] = b + rows[10][2:]; rows[11] = c + rows[11][2:]
    return ascii_img(rows, H, 16, 16)
add('SHIP_PENGUIN', 16, 0, [peng_frame('oy', 'yy', 'oy'), peng_frame('.o', 'oy', '.o')])

toast = [
"................",
"................",
"....kk..kk......",
"...ktk.ktk......",
"...kntkkntk.....",
"..kkkkkkkkkkk...",
"..kwgggggggggk..",
"..kwgggggggggGkk",
"FFkwgkkggkkggGkk",
"FFkwggggggggGGk.",
"FFkwggpppgggGGk.",
"..kGGGGGGGGGGGk.",
"..kkkkkkkkkkkkk.",
"...kk.......kk..",
"................",
"................"]
def toast_frame(a, b, c):
    rows = list(toast)
    rows[8] = a + rows[8][2:]; rows[9] = b + rows[9][2:]; rows[10] = c + rows[10][2:]
    return ascii_img(rows, H, 16, 16)
add('SHIP_TOASTER', 16, 0, [toast_frame('oy', 'yy', 'oy'), toast_frame('.o', 'oy', '.o')])

# --- player shots (8x8 hero bank)
add('SHOT_DASH', 8, 0, [ascii_img(["........","........","........",".oyyyww.",".oyyyww.","........","........","........"], H, 8, 8)])
add('SHOT_PAPER', 8, 0, [ascii_img(["........","........","..kk....","..kwwk..","..kwwwwk","..kggk..","..kk....","........"], H, 8, 8)])
add('SHOT_FISH', 8, 0, [ascii_img(["........","........","kk.kkkk.","kckcccCk","kkcccwkk","kckcccck","kk.kkkk.","........"], H, 8, 8)])
add('SHOT_TOAST', 8, 0, [ascii_img(["........",".kkkkk..","kntttnk.","knttttk.","knttttk.","knnnnnk.",".kkkkk..","........"], H, 8, 8)])
add('SHOT_LASER', 8, 0, [ascii_img(["........","........","cccccccc","CwwwwwwC","CwwwwwwC","cccccccc","........","........"], H, 8, 8)])
add('SHOT_MISSILE', 8, 0, [ascii_img(["........","........","..kkk...",".kgggwk.","yogggggk",".kkkkk..","........","........"], H, 8, 8)])
add('SHOT_SPREAD', 8, 0, [ascii_img(["........","........","...pp...","..pwwp..","..pwwp..","...pp...","........","........"], H, 8, 8)])
rip0 = new(16, 16); d = ImageDraw.Draw(rip0); d.arc((5, 3, 11, 12), -70, 70, fill=3); d.arc((4, 3, 10, 12), -60, 60, fill=4)
rip1 = new(16, 16); d = ImageDraw.Draw(rip1); d.arc((2, 0, 14, 15), -70, 70, fill=3); d.arc((1, 0, 13, 15), -60, 60, fill=4)
add('SHOT_RIPPLE', 16, 0, [rip0, rip1])
opt0 = ascii_img(["..oooo..",".oyyyyo.","oyywwyyo","oywwwwyo","oywwwwyo","oyywwyyo",".oyyyyo.","..oooo.."], H, 8, 8)
opt1 = ascii_img(["........","..oooo..",".oyyyyo.",".oywwyo.",".oywwyo.",".oyyyyo.","..oooo..","........"], H, 8, 8)
add('OPTION', 8, 0, [opt0, opt1])
# --- items
cap0 = ascii_img(["........",".kkkkkk.","krroorrk","krwyyrrk","krryyrrk","krroorrk",".kkkkkk.","........"], H, 8, 8)
cap1 = ascii_img(["........",".kkkkkk.","kooyyook","kowwyyok","kooyyook","kooyyook",".kkkkkk.","........"], H, 8, 8)
add('CAPSULE', 8, 0, [cap0, cap1])
coin0 = ascii_img(["..kkkk..",".kyyyyk.","kyywyyok","kywyyyok","kyyyyyok","kyyyyook",".koooo k","..kkkk.."], H, 8, 8)
coin1 = ascii_img(["...kk...","..kyyk..","..kwyk..","..kyyk..","..kyyk..","..kyok..","..kook..","...kk..."], H, 8, 8)
add('COIN', 8, 0, [coin0, coin1])
star = ascii_img(["...ww...","...yy...","yyywwyyy",".ywwwwy.","..yyyy..",".yy..yy.","yy....yy","........"], H, 8, 8)
add('RELICSTAR', 8, 0, [star])

# --- enemy bullets (bank 1)
add('EB_PELLET', 8, 1, [ascii_img(["........","........","...DD...","..DrrD..","..Drwr..","...DD...","........","........"], B1, 8, 8)])
add('EB_ORB', 8, 1, [ascii_img(["........","..DDDD..",".DrrrrD.",".DrwwoD.",".DrwwoD.",".DroorD.","..DDDD..","........"], B1, 8, 8)])
add('EB_STAR', 8, 1, [ascii_img(["...m....","...pm...","mmpwpmm.",".mpwwpm.","..pwwp..",".mp..pm.",".m....m.","........"], B1, 8, 8)])
add('EB_NEEDLE', 8, 1, [ascii_img(["........","........","........","Mmmwwwm.","........","........","........","........"], B1, 8, 8)])
add('EB_BLUE', 8, 1, [ascii_img(["........","........","...bb...","..blwb..","..bllb..","...bb...","........","........"], B1, 8, 8)])

# --- explosions 16x16 (bank 1)
ex = []
for i, (r, cols) in enumerate([(3, (5, 6)), (6, (6, 11)), (7, (11, 3)), (7, (12, 1))]):
    im = new(16, 16); d = ImageDraw.Draw(im)
    rnd = random.Random(i * 7 + 1)
    d.ellipse((8-r, 8-r, 7+r, 7+r), fill=cols[1])
    if i < 3:
        d.ellipse((8-r//2-1, 8-r//2-1, 7+r//2+1, 7+r//2+1), fill=cols[0])
    for k in range(6 + i * 3):
        x, y = rnd.randrange(16), rnd.randrange(16)
        if (x-8)**2 + (y-8)**2 <= (r+1)**2:
            im.putpixel((x, y), 0 if i == 3 else rnd.choice(cols))
    ex.append(im)
add('EXPLODE', 16, 1, ex)
spark0 = ascii_img(["........","...y....","...w....",".ywwwy..","...w....","...y....","........","........"], B1, 8, 8)
spark1 = ascii_img(["........","........","...w....","..www...","...w....","........","........","........"], B1, 8, 8)
add('SPARK', 8, 1, [spark0, spark1])

# --- twilight enemies (bank 2; same index layout used by nightmare bank 3)
def ring_drone(phase):
    im = new(16, 16); d = ImageDraw.Draw(im)
    d.ellipse((1, 1, 14, 14), fill=1)
    d.ellipse((2, 2, 13, 13), fill=3)
    d.ellipse((5, 5, 10, 10), fill=1)
    d.ellipse((6, 6, 9, 9), fill=2)
    # rotating highlight
    import math
    for k in range(3):
        a = phase * math.pi / 2 + k * 0.35
        x = int(round(7.5 + 4.5 * math.cos(a))); y = int(round(7.5 + 4.5 * math.sin(a)))
        im.putpixel((x, y), 5)
    im.putpixel((7, 7), 13); im.putpixel((8, 8), 13); im.putpixel((7, 8), 4); im.putpixel((8, 7), 4)
    return im
add('EN_RING', 16, 2, [ring_drone(0), ring_drone(1)])
fighter = [
"................",
"................",
"................",
"................",
"........kkk.....",
".....kkkdddk....",
"...kkrrrddddk...",
".kkRRrrrrrrrdkk.",
"kyyRrrrrrrrrrrdk",
".kkRRrrrrrrrdkk.",
"...kkrrrddddk.FF",
".....kkkdddk..FF",
"........kkk.....",
"................",
"................",
"................"]
f1 = [r.replace('FF', 'oo') for r in fighter]; f2 = [r.replace('FF', 'yo') for r in fighter]
add('EN_FIGHTER', 16, 2, [ascii_img(f1, TW, 16, 16), ascii_img(f2, TW, 16, 16)])
scout = [
"................",
"................",
"................",
"................",
"................",
"......kkk.......",
"....kkGGGk......",
"..kkGLLLGGkk....",
"kcLLLLGGGGGGkkoo",
"..kkGGGGGGGkk...",
"....kkggggk.....",
"......kkk.......",
"................",
"................",
"................",
"................"]
s2 = list(scout); s2[8] = "kcLLLLGGGGGGkky."
add('EN_SCOUT', 16, 2, [ascii_img(scout, TW, 16, 16), ascii_img(s2, TW, 16, 16)])
heavy = [
"................",
"....kkkkkkk.....",
"..kkGGGGGGGkk...",
".kGLLLLGGGGGGk..",
"kGLkkkkkkkGGGGk.",
"kGkyyRRRRkGGggk.",
"kcLkkkkkkkGgggko",
"kGLLLLLGGGGgggko",
"kGGGGGGGGGgggk..",
".kddddddddddk...",
"..kkkkkkkkkk....",
"................",
"................",
"................",
"................",
"................"]
h2 = list(heavy); h2[5] = "kGkyRRRRykGGggk."
add('EN_HEAVY', 16, 2, [ascii_img(heavy, TW, 16, 16), ascii_img(h2, TW, 16, 16)])
def spike_mine(ph):
    im = new(16, 16); d = ImageDraw.Draw(im)
    import math
    for k in range(8):
        a = k * math.pi / 4 + ph * math.pi / 8
        x = 7.5 + 7 * math.cos(a); y = 7.5 + 7 * math.sin(a)
        d.line((7.5, 7.5, x, y), fill=11)
    d.ellipse((3, 3, 12, 12), fill=1)
    d.ellipse((4, 4, 11, 11), fill=10)
    d.ellipse((5, 5, 8, 8), fill=11)
    d.rectangle((7, 7, 8, 8), fill=8 if ph == 0 else 14)
    return im
add('EN_MINE', 16, 2, [spike_mine(0), spike_mine(1)])
def eye_pod(ph):
    im = new(16, 16); d = ImageDraw.Draw(im)
    d.ellipse((1, 2, 14, 13), fill=1)
    d.ellipse((2, 3, 13, 12), fill=2)
    d.ellipse((3, 3, 11, 10), fill=3)
    d.ellipse((2, 5, 9, 11), fill=12)
    px = 3 if ph == 0 else 4
    d.ellipse((px, 6, px + 4, 10), fill=8); d.rectangle((px+1, 7, px+2, 8), fill=1)
    for k in range(3):
        im.putpixel((13 + (k % 2), 4 + k * 3), 6)
        im.putpixel((14, 5 + k * 3), 7)
    return outline(im, 1)
add('EN_EYEPOD', 16, 2, [eye_pod(0), eye_pod(1)])

# --- dream enemies (bank 4)
def cloud_puff(ph):
    im = new(16, 16); d = ImageDraw.Draw(im)
    oy = ph
    for (x, y, r) in ((5, 8, 4), (10, 7, 4), (7, 5, 4), (12, 10, 3), (3, 10, 3)):
        d.ellipse((x-r, y-r+oy, x+r, y+r+oy), fill=4)
    d.ellipse((2, 9+oy, 13, 13+oy), fill=10)
    d.ellipse((3, 8+oy, 12, 11+oy), fill=4)
    im.putpixel((5, 7+oy), 14); im.putpixel((5, 8+oy), 14); im.putpixel((9, 7+oy), 14); im.putpixel((9, 8+oy), 14)
    im.putpixel((4, 9+oy), 2); im.putpixel((10, 9+oy), 2)
    im.putpixel((6, 10+oy), 14); im.putpixel((7, 11+oy), 14); im.putpixel((8, 10+oy), 14)
    return outline(im, 1)
add('EN_CLOUD', 16, 4, [cloud_puff(0), cloud_puff(1)])
duck = [
"................",
"................",
"....kkkk........",
"...kyyyyk.......",
"..kyyEyyyk......",
"kkoyyyyyyk......",
"kooyyyyyyk......",
".kkkyyyyk..kkk..",
"...kyyyyykkyyyk.",
"..kyyyyyyyyyyyk.",
"..kyyYYYyyyyyyk.",
"..kyyyYYYYyyyk..",
"...kyyyyyyyykk..",
"....kkkkkkkk....",
"....bBbBbBbB....",
"................"]
d2 = list(duck); d2[14] = "....BbBbBbBb...."
add('EN_DUCK', 16, 4, [ascii_img(duck, DR, 16, 16), ascii_img(d2, DR, 16, 16)])
plane = [
"................",
"................",
"...kkkkkkkkkkk..",
"...kdddddddddk..",
"...kkkkkkkkkkk..",
"......k...k.....",
"kk.kkkkkkkkkkkk.",
"kokbbbbwwbbbbbbk",
"kkkbbbbwwbbbbbkk",
"k..kkkkkkkkkkk..",
"...kdddddddddk..",
"...kkkkkkkkkkk..",
"......k..k......",
".....kEk.kEk....",
"......k...k.....",
"................"]
p2 = list(plane); p2[6] = "k..kkkkkkkkkkkk."; p2[7] = "kkkbbbbwwbbbbbbk"; p2[8] = "kokbbbbwwbbbbbkk"
add('EN_TOYPLANE', 16, 4, [ascii_img(plane, DR, 16, 16), ascii_img(p2, DR, 16, 16)])
def gummy(ph):
    im = new(16, 16); d = ImageDraw.Draw(im)
    s = ph
    d.ellipse((3, 1+s, 6, 4+s), fill=2); d.ellipse((9, 1+s, 12, 4+s), fill=2)
    d.ellipse((2, 2+s, 13, 12), fill=2)
    d.ellipse((4, 4+s, 11, 11), fill=3)
    d.ellipse((1, 10, 5, 14), fill=2); d.ellipse((10, 10, 14, 14), fill=2)
    im.putpixel((5, 6+s), 14); im.putpixel((10, 6+s), 14)
    d.line((6, 9+s, 9, 9+s), fill=13)
    im.putpixel((4, 4+s), 4)
    return outline(im, 1)
add('EN_GUMMY', 16, 4, [gummy(0), gummy(1)])

# --- mini bosses 32x32
def gate_warden(ph):
    im = new(32, 32); d = ImageDraw.Draw(im)
    d.polygon([(16, 0), (31, 8), (31, 23), (16, 31), (4, 24), (4, 7)], fill=1)
    d.polygon([(16, 2), (29, 9), (29, 22), (16, 29), (6, 23), (6, 8)], fill=9)
    d.polygon([(16, 4), (27, 10), (27, 21), (16, 27), (8, 22), (8, 9)], fill=10)
    d.ellipse((5, 8, 20, 23), fill=1)
    d.ellipse((6, 9, 19, 22), fill=3)
    d.ellipse((8, 11, 17, 20), fill=4 if ph == 0 else 5)
    d.ellipse((9, 12, 14, 19), fill=1)
    d.rectangle((10, 14, 12, 17), fill=13)
    for y in (6, 25):
        d.rectangle((20, y - 2, 30, y + 1), fill=7); d.line((20, y - 2, 30, y - 2), fill=8)
    d.rectangle((26, 12, 31, 19), fill=6); d.line((27, 13, 27, 18), fill=15 if ph else 7)
    return outline(im, 1)
add('MB_WARDEN', 32, 2, [gate_warden(0), gate_warden(1)])
def iron_moth(ph):
    im = new(32, 32); d = ImageDraw.Draw(im)
    f = 2 if ph else 0
    d.polygon([(14, 14), (30, 1 + f), (26, 14)], fill=10); d.polygon([(14, 17), (30, 30 - f), (26, 17)], fill=10)
    d.polygon([(15, 14), (27, 4 + f), (24, 13)], fill=4); d.polygon([(15, 17), (27, 27 - f), (24, 18)], fill=4)
    d.polygon([(10, 12), (2, 2 + f), (6, 14)], fill=9); d.polygon([(10, 19), (2, 29 - f), (6, 17)], fill=9)
    d.ellipse((4, 11, 24, 20), fill=1)
    d.ellipse((5, 12, 23, 19), fill=11)
    d.ellipse((5, 12, 14, 19), fill=10)
    d.rectangle((6, 14, 8, 17), fill=14 if ph else 13)
    for x in (15, 18, 21):
        d.line((x, 12, x, 19), fill=9)
    return outline(im, 1)
add('MB_MOTH', 32, 3, [iron_moth(0), iron_moth(1)])
def big_teddy(ph):
    im = new(32, 32); d = ImageDraw.Draw(im)
    d.ellipse((2, 1, 11, 10), fill=15); d.ellipse((20, 1, 29, 10), fill=15)
    d.ellipse((4, 3, 9, 8), fill=3); d.ellipse((22, 3, 27, 8), fill=3)
    d.ellipse((2, 4, 29, 30), fill=15)
    d.ellipse((7, 15, 24, 28), fill=6)
    eo = 1 if ph else 0
    d.ellipse((8, 11 - eo, 11, 14), fill=14); d.ellipse((20, 11 - eo, 23, 14), fill=14)
    im.putpixel((9, 12), 4); im.putpixel((21, 12), 4)
    d.ellipse((13, 16, 18, 19), fill=14)
    d.arc((11, 18, 20, 25), 20, 160, fill=14)
    d.ellipse((4, 17, 7, 19), fill=2); d.ellipse((24, 17, 27, 19), fill=2)
    d.rectangle((13, 26, 18, 28), fill=13); d.polygon([(10, 25), (13, 27), (10, 29)], fill=13); d.polygon([(21, 25), (18, 27), (21, 29)], fill=13)
    return outline(im, 1)
add('MB_TEDDY', 32, 4, [big_teddy(0), big_teddy(1)])

# --- main boss 64x64 (banks 5 / 6 share index layout)
def main_boss(ph):
    im = new(64, 64); d = ImageDraw.Draw(im)
    # crescent hull
    d.ellipse((6, 2, 62, 62), fill=2)
    d.ellipse((8, 4, 60, 60), fill=3)
    d.ellipse((12, 8, 56, 56), fill=4)
    d.ellipse((24, 4, 70, 60), fill=0)
    # armour plates / fortress on back
    d.rectangle((34, 10, 58, 54), fill=2)
    d.rectangle((36, 12, 56, 52), fill=3)
    for y in range(14, 52, 6):
        d.line((37, y, 55, y), fill=2)
        d.rectangle((44, y + 1, 47, y + 3), fill=10 if (y // 6 + ph) % 2 else 9)
    # cannons
    for y in (12, 50):
        d.rectangle((14, y - 3, 36, y + 3), fill=1); d.rectangle((16, y - 2, 36, y + 2), fill=5)
        d.line((16, y - 2, 36, y - 2), fill=6); d.rectangle((12, y - 2, 15, y + 2), fill=8)
    # face on crescent
    d.ellipse((12, 22, 18, 28), fill=1); d.rectangle((13, 24, 16, 26), fill=8 if ph else 9)
    d.arc((10, 30, 30, 46), 100, 200, fill=1)
    # core
    d.ellipse((22, 22, 42, 42), fill=1)
    d.ellipse((24, 24, 40, 40), fill=11 if ph == 0 else 12)
    d.ellipse((27, 27, 37, 37), fill=12 if ph == 0 else 13)
    d.ellipse((30, 30, 34, 34), fill=14)
    return outline(im, 1)
add('BOSS_MAIN', 64, 5, [main_boss(0), main_boss(1)])

# --- portraits 32x32 (bank 7)
def milo(ph):
    im = new(32, 32); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 31, 31), fill=11)
    d.ellipse((4, 26, 28, 40), fill=15)              # jacket
    d.rectangle((9, 24, 24, 28), fill=8); d.polygon([(22, 26), (30, 30), (27, 24)], fill=9)  # scarf
    d.ellipse((7, 6, 25, 26), fill=2)                # face
    d.ellipse((7, 18, 25, 26), fill=2)
    d.pieslice((5, 1, 27, 22), 180, 360, fill=4)     # hair
    d.polygon([(6, 12), (10, 4), (12, 12)], fill=4); d.polygon([(26, 12), (22, 4), (20, 12)], fill=4)
    d.rectangle((6, 9, 26, 12), fill=5)              # goggle strap
    d.ellipse((8, 7, 15, 14), fill=1); d.ellipse((17, 7, 24, 14), fill=1)
    d.ellipse((9, 8, 14, 13), fill=6); d.ellipse((18, 8, 23, 13), fill=6)
    im.putpixel((10, 9), 7); im.putpixel((19, 9), 7)
    d.rectangle((11, 16, 12, 18), fill=1); d.rectangle((19, 16, 20, 18), fill=1)
    d.line((14, 22, 18, 22) if ph else (14, 21, 18, 23), fill=3)
    d.point([(9, 19), (23, 19)], fill=14)
    return im
add('PORT_MILO', 32, 7, [milo(0), milo(1)])
def shadow(ph):
    im = new(32, 32); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 31, 31), fill=1)
    d.ellipse((2, 2, 30, 40), fill=12)
    d.ellipse((4, 4, 28, 40), fill=11)
    d.polygon([(6, 8), (2, 0), (12, 5)], fill=12); d.polygon([(26, 8), (30, 0), (20, 5)], fill=12)
    e = 1 if ph else 0
    d.polygon([(8, 14), (14, 15 + e), (9, 17)], fill=13); d.polygon([(24, 14), (18, 15 + e), (23, 17)], fill=13)
    im.putpixel((10, 15), 14); im.putpixel((22, 15), 14)
    for x in range(9, 24, 2):
        d.line((x, 22, x + 1, 25 + (x % 3)), fill=10)
    return im
add('PORT_SHADOW', 32, 7, [shadow(0), shadow(1)])
def merchant(ph):
    im = new(32, 32); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 31, 31), fill=10)
    d.ellipse((3, 8, 11, 16), fill=4); d.ellipse((21, 8, 29, 16), fill=4)
    d.ellipse((4, 9, 28, 34), fill=4)
    d.ellipse((10, 20, 22, 30), fill=3)
    d.rectangle((8, 0, 24, 7), fill=1); d.rectangle((4, 7, 28, 9), fill=1); d.rectangle((8, 5, 24, 6), fill=8)
    d.ellipse((10, 14, 12, 16 - ph), fill=1); d.ellipse((20, 14, 22, 16 - ph), fill=1)
    d.ellipse((14, 21, 18, 23), fill=1)
    d.arc((12, 22, 20, 28), 20, 160, fill=1)
    d.rectangle((24, 15, 27, 17), fill=7); d.line((25, 17, 25, 22), fill=7)  # monocle
    return im
add('PORT_TEDDY', 32, 7, [merchant(0), merchant(1)])

# ---------------------------------------------------------------- BG: UI tiles (bank 10)
def tile(rows):
    return ascii_img(rows, ".fbhdrRyg", 8, 8)  # 0 . 1 f(fill) 2 b(border) 3 h(hilite) 4 d(dark) 5 r red 6 R dark red 7 y 8 g
UI = []
def ui(name, rows):
    UI.append((name, tile(rows)))
ui('FILL',   ["ffffffff"]*8)
ui("TL", ["........", ".ddddddd", ".dhhhhhh", ".dhbbbbb", ".dhbffff", ".dhbffff", ".dhbffff", ".dhbffff"])
ui('T',  ["........", "dddddddd", "hhhhhhhh", "bbbbbbbb", "ffffffff", "ffffffff", "ffffffff", "ffffffff"])
ui('TR', ["........", "dddddd..", "hhhhhhd.", "bbbbbhd.", "ffffbhd.", "ffffbhd.", "ffffbhd.", "ffffbhd."])
ui('L',  [".dhbffff"]*8)
ui('R',  ["ffffbhd."]*8)
ui('BL', [".dhbffff", ".dhbffff", ".dhbffff", ".dhbbbbb", ".dhhhhhh", ".ddddddd", "........", "........"])
ui('B',  ["ffffffff", "ffffffff", "ffffffff", "bbbbbbbb", "hhhhhhhh", "dddddddd", "........", "........"])
ui('BR', ["ffffbhd.", "ffffbhd.", "ffffbhd.", "bbbbbhd.", "hhhhhhd.", "dddddd..", "........", "........"])
ui('BAR_FULL', ["........", "dddddddd", "rrrrrrrr", "rrrrrrrr", "RRRRRRRR", "RRRRRRRR", "dddddddd", "........"])
ui('BAR_EMPTY', ["........", "dddddddd", "dfffffff", "dfffffff", "dfffffff", "dfffffff", "dddddddd", "........"])
ui('BAR_HALF', ["........", "dddddddd", "rrrrffff", "rrrrffff", "RRRRffff", "RRRRffff", "dddddddd", "........"])
ui('LINE_H', ["........", "........", "........", "hhhhhhhh", "bbbbbbbb", "........", "........", "........"])
ui('LINE_UP', [".......h", "......hb", ".....hb.", "....hb..", "...hb...", "..hb....", ".hb.....", "hb......"])
ui('LINE_DN', ["hb......", ".hb.....", "..hb....", "...hb...", "....hb..", ".....hb.", "......hb", ".......h"])
ui('NODE', ["..dddd..", ".dhhhhd.", "dhyyyyhd", "dhyyyyhd", "dhyyyyhd", "dhyyyyhd", ".dhhhhd.", "..dddd.."])
ui('NODE_G', ["..dddd..", ".dhhhhd.", "dhggggbd", "dhggggbd", "dhggggbd", "dhggggbd", ".dbbbbd.", "..dddd.."])
ui('ARROW', ["...y....", "...yy...", "yyyyyy..", "yyyyyyy.", "yyyyyy..", "...yy...", "...y....", "........"])
UI_PAL_FULL = UI_PAL

# ---------------------------------------------------------------- title logo (BG1, bank 7)
GLYPH = {
'B': ["11110","10001","10001","11110","10001","10001","11110"],
'U': ["10001"]*6 + ["01110"],
'L': ["10000"]*6 + ["11111"],
'E': ["11111","10000","10000","11110","10000","10000","11111"],
'T': ["11111"] + ["00100"]*6,
'S': ["01111","10000","10000","01110","00001","00001","11110"],
'O': ["01110","10001","10001","10001","10001","10001","01110"],
'R': ["11110","10001","10001","11110","10100","10010","10001"],
'M': ["10001","11011","10101","10101","10001","10001","10001"],
'A': ["01110","10001","10001","11111","10001","10001","10001"],
'I': ["11111","00100","00100","00100","00100","00100","11111"],
'D': ["11110","10001","10001","10001","10001","10001","11110"],
'N': ["10001","11001","10101","10011","10001","10001","10001"],
' ': ["00000"]*7,
}
LOGO_PAL = ['000000', '080818', '40d8ff', '2090e8', '1858b8', 'ffffff', 'fff060', 'ffb030', 'ff6020', 'd02040', '701030', '303060', 'a0f0ff', 'ffd8a0', '000000', '000000']
def draw_word(img, word, x0, y0, sc, grad):
    px = img.load()
    w = len(word) * 6 * sc
    mask = Image.new('L', img.size, 0); mp = mask.load()
    for i, ch in enumerate(word):
        g = GLYPH[ch]
        for gy in range(7):
            for gx in range(5):
                if g[gy][gx] == '1':
                    for yy in range(sc):
                        for xx in range(sc + (1 if gx < 4 and g[gy][gx+1] == '1' else 0)):
                            X = x0 + (i * 6 + gx) * sc + xx; Y = y0 + gy * sc + yy
                            if 0 <= X < img.size[0] and 0 <= Y < img.size[1]:
                                mp[X, Y] = 1
    W, Hh = img.size
    # shadow
    for y in range(Hh):
        for x in range(W):
            if mp[x, y] and x + 2 < W and y + 2 < Hh and not mp[x+2, y+2]:
                px[x+2, y+2] = 11
    # outline
    for y in range(Hh):
        for x in range(W):
            if not mp[x, y]:
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < W and 0 <= yy < Hh and mp[xx, yy]:
                            px[x, y] = 1
    th = 7 * sc
    for y in range(Hh):
        for x in range(W):
            if mp[x, y]:
                t = (y - y0) / th
                c = grad[min(len(grad) - 1, int(t * len(grad)))]
                if (y - y0) % sc == 0 and t < 0.15: c = 5
                px[x, y] = c
    return w
logo = new(240, 64)
w1 = len("BULLET STORM") * 6 * 2
draw_word(logo, "BULLET STORM", (240 - w1) // 2, 2, 2, [12, 2, 2, 3, 3, 4])
w2 = len("RAIDEN") * 6 * 5
draw_word(logo, "RAIDEN", (240 - w2) // 2 + 2, 20, 5, [5, 6, 6, 7, 7, 8, 8, 9, 10])

def bg_tileset(img, maxtiles=1024, base=None, pal_bank=0):
    """dedupe tiles of a P image; returns tiles list and map (list of u16 screen entries)"""
    tl = base if base is not None else []
    idx = {t: i for i, t in enumerate(tl)}
    W, Hh = img.size
    mp = []
    for ty in range(Hh // 8):
        for tx in range(W // 8):
            t = tiles_from_img(img.crop((tx*8, ty*8, tx*8+8, ty*8+8)), 8, 8)[0]
            if t not in idx:
                idx[t] = len(tl); tl.append(t)
            mp.append(idx[t] | (pal_bank << 12))
    return tl, mp

logo_tiles, logo_map = bg_tileset(logo, pal_bank=7)
print('logo tiles', len(logo_tiles))

# ---------------------------------------------------------------- stage backgrounds
# far layer (bank 8): idx 1..3 star colours. near layer (bank 9) per theme.
def far_layer(seed):
    tl = [bytes(32)]
    rnd = random.Random(seed)
    for k in range(10):
        im = new(8, 8)
        x, y = rnd.randrange(8), rnd.randrange(8)
        c = 1 + (k % 3)
        im.putpixel((x, y), c)
        if k >= 8:  # small cross star
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                if 0 <= x+dx < 8 and 0 <= y+dy < 8: im.putpixel((x+dx, y+dy), 1)
            im.putpixel((x, y), 3)
        tl.append(tiles_from_img(im, 8, 8)[0])
    mp = []
    for i in range(32 * 32):
        mp.append(rnd.randrange(1, len(tl)) if rnd.random() < 0.16 else 0)
    return tl, mp

def wrap_ellipse(d, box, fill, W=512):
    x0, y0, x1, y1 = box
    for off in (-W, 0, W):
        d.ellipse((x0 + off, y0, x1 + off, y1), fill=fill)
def wrap_poly(d, pts, fill, W=512):
    for off in (-W, 0, W):
        d.polygon([(x + off, y) for x, y in pts], fill=fill)
def wrap_rect(d, box, fill, W=512):
    x0, y0, x1, y1 = box
    for off in (-W, 0, W):
        d.rectangle((x0 + off, y0, x1 + off, y1), fill=fill)

def near_twilight():
    im = new(512, 256); d = ImageDraw.Draw(im); rnd = random.Random(11)
    for i in range(70):
        x, y = rnd.randrange(512), rnd.randrange(18, 150)
        c = rnd.choice((1, 2, 3))
        im.putpixel((x, y), c)
        if rnd.random() < 0.3:
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                im.putpixel(((x+dx) % 512, y+dy), 4)
    # ringed planet + small moon
    wrap_ellipse(d, (300, 40, 340, 80), 5); wrap_ellipse(d, (304, 44, 334, 74), 6); wrap_ellipse(d, (310, 46, 330, 66), 7)
    d.arc((286, 54, 354, 68), 0, 360, fill=8); d.arc((286, 55, 354, 67), 200, 340, fill=0)
    wrap_ellipse(d, (90, 110, 102, 122), 6); wrap_ellipse(d, (92, 111, 100, 119), 7)
    return im
def near_nightmare():
    im = new(512, 256); d = ImageDraw.Draw(im); rnd = random.Random(23)
    # bottom fortress skyline, rows 15..18 (y 120..151)
    x = 0
    while x < 512:
        w = rnd.choice((16, 24, 32, 40)); hgt = rnd.choice((8, 12, 16, 20, 26))
        top = 152 - hgt
        d.rectangle((x, top, x + w - 1, 151), fill=2)
        d.line((x, top, x + w - 1, top), fill=3)
        d.line((x, top, x, 151), fill=3)
        for yy in range(top + 4, 150, 6):       # truss
            d.line((x + 2, yy, x + w - 3, yy + 4), fill=1)
        for k in range(rnd.randrange(0, 3)):
            wx = x + 3 + rnd.randrange(max(1, w - 8)); wy = top + 3 + rnd.randrange(max(1, hgt - 6))
            d.rectangle((wx, wy, wx + 2, wy + 1), fill=5)
        if rnd.random() < 0.4:
            for sx in range(x + 2, x + w - 2, 4):
                d.polygon([(sx, top), (sx + 1, top - 4), (sx + 2, top)], fill=4)
        x += w
    # top pipes rows 2..3 (y 16..31)
    x = 0
    while x < 512:
        w = rnd.choice((8, 16, 24)); hgt = rnd.choice((4, 6, 10, 14))
        d.rectangle((x, 16, x + w - 1, 16 + hgt), fill=2); d.line((x, 16 + hgt, x + w - 1, 16 + hgt), fill=3)
        if w >= 16: d.rectangle((x + w // 2 - 1, 16, x + w // 2, 16 + hgt), fill=1)
        if rnd.random() < 0.3: d.rectangle((x + 2, 16 + hgt - 2, x + 3, 16 + hgt - 1), fill=5)
        x += w + rnd.choice((0, 0, 8, 16))
    for i in range(30):
        im.putpixel((rnd.randrange(512), rnd.randrange(34, 110)), 6)
    return im
def near_dream():
    im = new(512, 256); d = ImageDraw.Draw(im); rnd = random.Random(37)
    # pastel hills behind
    for i in range(7):
        cx = i * 80 + rnd.randrange(30); r = rnd.randrange(30, 50)
        wrap_ellipse(d, (cx - r, 128, cx + r, 128 + r * 2), 5)
    # candy stripes on hills
    for x in range(0, 512, 6):
        for y in range(132, 152, 2):
            if im.getpixel((x, y)) == 5 and (x // 6 + y // 8) % 3 == 0:
                im.putpixel((x, y), 6)
    # cloud floor
    for i in range(26):
        cx = i * 20 + rnd.randrange(8); r = rnd.randrange(7, 13)
        wrap_ellipse(d, (cx - r, 146 - r, cx + r, 146 + r), 2)
    for i in range(26):
        cx = i * 20 + rnd.randrange(8) + 4; r = rnd.randrange(5, 9)
        wrap_ellipse(d, (cx - r, 148 - r, cx + r, 148 + r), 1)
    d.rectangle((0, 148, 511, 151), fill=1)
    # top cloud puffs
    for i in range(14):
        cx = i * 37 + rnd.randrange(10); r = rnd.randrange(4, 9)
        wrap_ellipse(d, (cx - r, 12 - r // 2, cx + r, 18 + r), 2)
        wrap_ellipse(d, (cx - r + 2, 10 - r // 2, cx + r - 2, 15 + r), 1)
    d.rectangle((0, 0, 511, 15), fill=0)
    for i in range(40):
        x, y = rnd.randrange(512), rnd.randrange(36, 110)
        im.putpixel((x, y), 3)
        if i % 4 == 0:
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)): im.putpixel(((x+dx) % 512, y+dy), 4)
    return im

THEMES = [  # name, near image fn, backdrop, far colours(3), near palette(15)
 ('TWILIGHT', near_twilight, '1a2a68', ['8090c0', 'ffffff', 'a0c0ff'],
     ['ffffff', 'ffe080', 'a0d0ff', '80a0ff', '603090', 'a050c0', 'e090f0', 'ffd080']),
 ('HIVE', near_nightmare, '1c0610', ['603040', 'b07080', '804050'],
     ['0c0408', '3a2028', '6a4048', 'c03020', 'ff5030', '804050']),
 ('CLOUDS', near_dream, '8c90e8', ['ffffff', 'fff0a0', 'ffd0f0'],
     ['ffffff', 'ffd0ec', 'fff6b0', 'ffffff', 'a0f0c8', 'ff9cc8']),
 ('FOUNDRY', near_nightmare, '0c0808', ['804020', 'ffa040', '603020'],
     ['040202', '302018', '584030', 'ff8000', 'ffd040', 'a04010']),
 ('CANDYMOON', near_dream, '403a90', ['ffffff', 'ffe080', 'c0a0ff'],
     ['f0e0ff', 'c0a0f0', 'fff0a0', 'ffffff', 'ff90d0', '90e0ff']),
]
NEAR_IMGS = {}
theme_out = []
bg_tiles_all = []  # per theme tileset (far + near share charblock 2)
for ti, (name, fn, back, farc, nearc) in enumerate(THEMES):
    key = fn.__name__
    if key not in NEAR_IMGS:
        NEAR_IMGS[key] = fn()
    far_t, far_m = far_layer(100 + ti)
    tl = list(far_t)
    near_img = NEAR_IMGS[key]
    tl, near_m_raw = bg_tileset(near_img, base=tl, pal_bank=9)
    # near map is 64x32 -> GBA layout: two 32x32 screenblocks side by side
    near_m = []
    for half in range(2):
        for y in range(32):
            for x in range(32):
                near_m.append(near_m_raw[y * 64 + half * 32 + x])
    far_m = [v | (8 << 12) for v in far_m]
    pal = [rgb15(hexc(back))] + [rgb15(hexc(c)) for c in farc] + [0] * 12
    npal = [0] + [rgb15(hexc(c)) for c in nearc] + [0] * (15 - len(nearc))
    print('theme', name, 'tiles', len(tl))
    assert len(tl) <= 512
    theme_out.append((name, key, tl, far_m, near_m, pal, npal))
    # preview
    prev = Image.new('RGB', (512, 160), hexc(back))
    nimg = near_img.convert('RGB'); npx = near_img.load(); pp = prev.load()
    for y in range(160):
        for x in range(512):
            v = npx[x, y]
            if v: pp[x, y] = hexc(nearc[v - 1]) if v - 1 < len(nearc) else (255, 0, 255)
    prev.save(os.path.join(ART, 'bg_%s.png' % name.lower()))

# ---------------------------------------------------------------- emit C
out_c = ['// generated by tools/gen_assets.py - original art', '#include "assets.h"', '']
out_h = ['// generated by tools/gen_assets.py', '#pragma once', '#include <tonc_types.h>', '']

def carr_u32(name, data):
    words = []
    for i in range(0, len(data), 4):
        words.append('0x%08X' % int.from_bytes(data[i:i+4], 'little'))
    lines = [', '.join(words[i:i+8]) for i in range(0, len(words), 8)]
    return 'const u32 %s[%d] = {\n  %s\n};' % (name, len(words), ',\n  '.join(lines))
def carr_u16(name, vals):
    lines = [', '.join('0x%04X' % v for v in vals[i:i+16]) for i in range(0, len(vals), 16)]
    return 'const u16 %s[%d] = {\n  %s\n};' % (name, len(vals), ',\n  '.join(lines))

# OBJ tiles
obj = bytearray(); sheet_imgs = []
for name, size, bank, frames in SPRITES:
    start = len(obj) // 32
    n = (size // 8) ** 2
    for f in frames:
        assert f.size == (size, size), (name, f.size)
        for t in tiles_from_img(f, size, size): obj += t
        sheet_imgs.append((name, bank, f))
    out_h.append('#define SPR_%s %d  // %dx%d bank %d frames %d (tiles/frame %d)' % (name, start, size, size, bank, len(frames), n))
    out_h.append('#define SPRPAL_%s %d' % (name, bank))
out_h.append('#define OBJ_TILE_COUNT %d' % (len(obj) // 32))
assert len(obj) // 32 <= 1024
out_c.append(carr_u32('obj_tiles', bytes(obj)))
objpal = []
for b in range(16):
    if b in OBJ_PALS:
        cols = OBJ_PALS[b][2]
        objpal += [rgb15(hexc(c)) for c in cols] + [0] * (16 - len(cols))
    else:
        objpal += [0] * 16
out_c.append(carr_u16('obj_pal', objpal))
out_h += ['extern const u32 obj_tiles[];', 'extern const u16 obj_pal[256];']
print('obj tiles', len(obj) // 32)

# BG palettes (static part)
bgpal = [0] * 256
for b, cols in TEXT_PALS.items():
    for i, c in enumerate(cols): bgpal[b * 16 + i] = rgb15(hexc(c))
for i, c in enumerate(LOGO_PAL): bgpal[7 * 16 + i] = rgb15(hexc(c))
for i, c in enumerate(UI_PAL): bgpal[10 * 16 + i] = rgb15(hexc(c))
bgpal[0] = rgb15(hexc('1a2a68'))
out_c.append(carr_u16('bg_pal', bgpal))
out_h.append('extern const u16 bg_pal[256];')

# UI tiles
ui_data = bytearray()
for i, (name, im) in enumerate(UI):
    ui_data += tiles_from_img(im, 8, 8)[0]
    out_h.append('#define UI_%s %d' % (name, i))
out_h.append('#define UI_COUNT %d' % len(UI))
out_c.append(carr_u32('ui_tiles', bytes(ui_data)))
out_h.append('extern const u32 ui_tiles[];')

# logo
out_c.append(carr_u32('logo_tiles', b''.join(logo_tiles)))
out_c.append(carr_u16('logo_map', logo_map))
out_h += ['#define LOGO_TILES %d' % len(logo_tiles), '#define LOGO_W 30', '#define LOGO_H 8',
          'extern const u32 logo_tiles[];', 'extern const u16 logo_map[];']

# themes
emitted_sets = {}
for ti, (name, key, tl, far_m, near_m, pal, npal) in enumerate(theme_out):
    data = b''.join(tl)
    if data not in emitted_sets:
        nm = 'bgset%d' % len(emitted_sets)
        out_c.append(carr_u32(nm + '_tiles', data))
        out_c.append(carr_u16(nm + '_near', near_m))
        out_c.append(carr_u16(nm + '_far', far_m))
        emitted_sets[data] = (nm, len(tl))
    nm, cnt = emitted_sets[data]
    out_c.append(carr_u16('theme%d_pal' % ti, pal + npal))
out_c.append('const ThemeGfx themes[%d] = {' % len(theme_out))
for ti, (name, key, tl, far_m, near_m, pal, npal) in enumerate(theme_out):
    nm, cnt = emitted_sets[b''.join(tl)]
    out_c.append('  { %s_tiles, %d, %s_near, %s_far, theme%d_pal },' % (nm, cnt, nm, nm, ti))
out_c.append('};')
out_h += ['typedef struct { const u32 *tiles; u16 ntiles; const u16 *near; const u16 *far; const u16 *pal; } ThemeGfx;',
          'extern const ThemeGfx themes[%d];' % len(theme_out),
          'enum { TH_TWILIGHT, TH_HIVE, TH_CLOUDS, TH_FOUNDRY, TH_CANDYMOON };']

open(os.path.join(GAME, 'src', 'assets.c'), 'w').write('\n'.join(out_c) + '\n')
open(os.path.join(GAME, 'include', 'assets.h'), 'w').write('\n'.join(out_h) + '\n')

# ---------------------------------------------------------------- preview sheet
def pal_rgb(bank):
    return [hexc(c) for c in OBJ_PALS[bank][2]] + [(0, 0, 0)] * 16
cols = 12; cell = 68
rows_n = (len(sheet_imgs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows_n * cell), (40, 40, 60))
for i, (name, bank, im) in enumerate(sheet_imgs):
    p = pal_rgb(bank); w, h = im.size
    big = Image.new('RGB', (w, h), (40, 40, 60)); bp = big.load(); ip = im.load()
    for y in range(h):
        for x in range(w):
            if ip[x, y]: bp[x, y] = p[ip[x, y]]
    s = 4 if w <= 16 else (2 if w <= 32 else 1)
    big = big.resize((w * s, h * s), Image.NEAREST)
    sheet.paste(big, ((i % cols) * cell + 2, (i // cols) * cell + 2))
sheet.save(os.path.join(ART, 'sprites.png'))
lp = Image.new('RGB', (240, 64)); lpp = lp.load(); lip = logo.load()
for y in range(64):
    for x in range(240):
        lpp[x, y] = hexc(LOGO_PAL[lip[x, y]]) if lip[x, y] else (26, 42, 104)
lp.resize((480, 128), Image.NEAREST).save(os.path.join(ART, 'logo.png'))
print('done')
