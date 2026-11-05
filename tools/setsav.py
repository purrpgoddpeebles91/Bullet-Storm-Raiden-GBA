#!/usr/bin/env python3
"""Patch GAME SETTINGS in a Bullet Storm Raiden .sav (SRAM block at 0x100) for reproducible test runs.
usage: setsav.py FILE.sav INDEX=VALUE [INDEX=VALUE ...]   (indices = enum order in game/include/common.h)
Creates a 32 KB file with v0.3 defaults if FILE does not exist. Keeps the checksum valid."""
import sys, os
NUM_SET = 27
DEFAULTS = [0, 0, 0, 0, 3, 3, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 1, 10, 10, 0, 0, 0, 0, 3]
NAMES = ['RENDER','SHADER','SCAN','SCALE','BRIGHT','SAT','GHOST','SHAKE','FLASH','FPS','ASPECT','BULLET','METER',
         'ADRV','ARATE','CRUSH','LAT','ASYNC','STEREO','TONE','MVOL','SVOL','MSTYLE','AUTOFIRE','SWAP','HUD','CARTOON']
f = sys.argv[1]
data = bytearray(open(f, 'rb').read()) if os.path.exists(f) else bytearray(b'\xff' * 32768)
vals = list(DEFAULTS)
if data[0x100:0x104] == b'BSRS' and data[0x104] == NUM_SET:
    vals = list(data[0x105:0x105 + NUM_SET])
for a in sys.argv[2:]:
    k, v = a.split('=')
    i = NAMES.index(k.upper()) if not k.isdigit() else int(k)
    vals[i] = int(v)
c = 0xA5
for v in vals: c = ((c << 1 | c >> 7) & 0xFF) ^ v
data[0x100:0x104] = b'BSRS'; data[0x104] = NUM_SET
data[0x105:0x105 + NUM_SET] = bytes(vals); data[0x105 + NUM_SET] = c
open(f, 'wb').write(data)
print('settings', dict(zip(NAMES, vals)))
