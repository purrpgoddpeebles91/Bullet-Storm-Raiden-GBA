#!/usr/bin/env python3
"""Original chiptune for Bullet Storm Raiden (PSG channels 1-4) + DirectSound SFX.
Writes game/src/music_data.c and game/include/music_data.h"""
import os, math, random
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def parse(seq):
    ev = []
    for tok in seq.split():
        n, l = tok.split(':')
        l = int(l)
        if n == '-':
            ev.append([0, l]); continue
        if n in 'kshc':
            ev.append(['kshc'.index(n) + 1, l]); continue
        p = NOTES[n[0]]; i = 1
        if n[1] == '#': p += 1; i = 2
        elif n[1] == 'b': p -= 1; i = 2
        ev.append([12 * (int(n[i:]) + 1) + p, l])
    return ev

def total(ev): return sum(l for n, l in ev)

# ---------------- World 1 theme "Dream War" (A minor), 16 bars of 16 rows
LEAD = """
A4:2 C5:2 E5:4 D5:2 C5:2 B4:2 C5:2
A4:4 E4:2 A4:2 B4:4 C5:4
D5:2 E5:2 F5:4 E5:2 D5:2 C5:2 D5:2
E5:8 -:4 E5:2 G5:2
A5:4 G5:2 E5:2 F5:4 E5:2 D5:2
C5:4 D5:2 E5:2 A4:8
F5:2 E5:2 D5:2 C5:2 B4:2 C5:2 D5:2 G4:2
A4:12 -:4
C5:2 C5:2 E5:2 G5:2 F5:4 E5:4
D5:2 D5:2 F5:2 A5:2 G5:8
E5:2 E5:2 G5:2 B5:2 A5:4 G5:2 F5:2
E5:8 D5:4 C5:4
A5:2 G5:2 F5:2 E5:2 D5:2 C5:2 B4:2 C5:2
D5:4 E5:4 F5:4 G#5:4
A5:6 E5:2 C5:4 E5:4
A5:12 -:4
"""
CHORDS = [('A', 'min'), ('F', 'maj'), ('D', 'min'), ('E', 'maj'), ('F', 'maj'), ('A', 'min'), ('D', 'min'), ('A', 'min'),
          ('C', 'maj'), ('D', 'min'), ('E', 'min'), ('A', 'min'), ('F', 'maj'), ('E', 'maj'), ('A', 'min'), ('A', 'min')]

def chord_notes(root, q, octv):
    r = NOTES[root] + 12 * (octv + 1)
    return [r, r + (3 if q == 'min' else 4), r + 7]

def bass_line(chords, octv=2, style='octave'):
    ev = []
    for root, q in chords:
        r = NOTES[root] + 12 * (octv + 1)
        if r < 40: r += 12
        if style == 'octave':
            for k in range(4): ev += [[r, 2], [r + 12, 2]]
        elif style == 'bounce':
            for k in range(4): ev += [[r, 1], [0, 1], [r + 7 if k % 2 else r + 12, 2]]
        elif style == 'drive':
            for k in range(8): ev += [[r if k % 4 != 3 else r + 12, 2]]
        elif style == 'drone':
            ev += [[r, 6], [r, 2], [r + 1 if root != 'E' else r, 4], [r, 4]]
    return ev

def arp_line(chords, octv=4, step=1):
    ev = []
    for root, q in chords:
        cn = chord_notes(root, q, octv) + [chord_notes(root, q, octv)[0] + 12]
        for k in range(16 // step):
            ev.append([cn[k % 4], step])
    return ev

def drums(pattern_bars):
    ev = []
    m = {'k': 1, 's': 2, 'h': 3, 'c': 4, '.': 0}
    for bar in pattern_bars:
        for ch in bar:
            if m[ch]: ev.append([m[ch], 1])
            elif ev and ev[-1][0] == 0: ev[-1][1] += 1
            else: ev.append([0, 1])
    # merge note + following rests
    out = []
    for n, l in ev:
        if n == 0 and out: out[-1][1] += l
        else: out.append([n, l])
    return out

def to_major(ev):
    # A minor -> A major: C->C#, F->F#, G->G#
    out = []
    for n, l in ev:
        if n and n % 12 in (0, 5, 7): n += 1
        out.append([n, l])
    return out

def shift(ev, s): return [[n + s if n else 0, l] for n, l in ev]

def staccato(ev):  # split each note into note + rest (bouncy)
    out = []
    for n, l in ev:
        if n and l >= 2: out += [[n, l - 1], [0, 1]]
        else: out.append([n, l])
    return out

lead = parse(LEAD)
assert total(lead) == 256, total(lead)
SONGS = {}
# neutral (title / 1-1)
SONGS['W1'] = dict(rows=7, ch=[lead, arp_line(CHORDS), bass_line(CHORDS, 2, 'octave'),
    drums(['k...h...s...h...', 'k...h.k.s...h.h.'] * 8)],
    duty=(2, 1), env=(0xB2, 0x52), wave=0, loop=1)
# dream variant: major mode, octave up, bouncy, faster
dch = [(r, 'maj' if q == 'min' else 'min') if r in 'AE' else (r, q) for r, q in CHORDS]
SONGS['W1_DREAM'] = dict(rows=6, ch=[staccato(to_major(lead)), to_major(arp_line(CHORDS, 5, 2)),
    to_major(bass_line(CHORDS, 2, 'bounce')), drums(['k.h.h.h.k.h.hhh.', 'k.h.h.h.k.h.h.c.'] * 8)],
    duty=(2, 2), env=(0xC1, 0x61), wave=1, loop=1)
# nightmare variant: same melody an octave lower, thin duty, heavy drums, drone bass
SONGS['W1_NIGHT'] = dict(rows=8, ch=[shift(lead, -12), arp_line(CHORDS, 3, 4), bass_line(CHORDS, 1, 'drone'),
    drums(['k...k.s.k...k.s.', 'k.k.k.s.k.k.s.ss'] * 8)],
    duty=(0, 0), env=(0xD3, 0x44), wave=2, loop=1)

# ---------------- boss theme (E minor, driving)
BOSS = """
E5:2 E5:2 D5:2 E5:2 G5:2 E5:2 D5:2 B4:2
C5:4 B4:4 A4:4 B4:4
E5:2 E5:2 D5:2 E5:2 A5:2 G5:2 F#5:2 D5:2
E5:8 B4:4 D#5:4
G5:2 F#5:2 E5:2 D5:2 C5:2 D5:2 E5:2 G5:2
F#5:4 E5:4 D#5:4 B4:4
E5:2 G5:2 B5:2 A5:2 G5:2 F#5:2 G5:2 A5:2
B5:8 A#5:4 B5:4
"""
bl = parse(BOSS); assert total(bl) == 128
BCH = [('E', 'min'), ('C', 'maj'), ('E', 'min'), ('B', 'maj'), ('C', 'maj'), ('B', 'maj'), ('E', 'min'), ('B', 'maj')]
def boss_bass():
    ev = []
    for r, q in BCH:
        n = NOTES[r] + 36
        for k in range(16): ev.append([n + (12 if k % 4 == 2 else 0), 1])
    return ev
SONGS['BOSS'] = dict(rows=6, ch=[bl, arp_line(BCH, 4, 1), boss_bass(), drums(['k.s.k.s.k.s.kss.'] * 8)],
    duty=(1, 0), env=(0xD2, 0x51), wave=2, loop=1)

# ---------------- jingles (no loop)
SONGS['GAMEOVER'] = dict(rows=8, ch=[parse('A4:4 G4:4 F4:4 E4:4 D#4:4 D4:4 C#4:4 A3:12 -:4'), parse('-:44'), parse('A2:8 F2:8 D2:8 A1:16 -:4'), parse('k:4 -:40')],
    duty=(2, 2), env=(0xC3, 0x40), wave=0, loop=0)
SONGS['CLEAR'] = dict(rows=6, ch=[parse('A4:2 C#5:2 E5:2 A5:6 G#5:2 F#5:2 G#5:2 A5:2 B5:2 C#6:12 -:4'),
    parse('E4:2 A4:2 C#5:2 E5:6 E5:2 D5:2 E5:2 F#5:2 G#5:2 A5:12 -:4'), parse('A2:8 E2:8 F#2:4 G#2:4 A2:16'), parse('k:2 s:2 k:2 s:4 h:2 h:2 c:2 k:2 s:2 k:4 c:12 -:4')],
    duty=(2, 1), env=(0xC3, 0x73), wave=1, loop=0)
SONGS['FORK'] = dict(rows=10, ch=[parse('E5:6 D5:2 C5:4 B4:4 A4:6 B4:2 C5:8 D5:6 C5:2 B4:4 G4:4 A4:16'),
    parse('C5:16 F4:16 G4:16 A4:16'), parse('A2:16 F2:16 G2:16 A2:16'), parse('-:64')],
    duty=(2, 2), env=(0x93, 0x40), wave=1, loop=1)

ORDER = ['W1', 'W1_DREAM', 'W1_NIGHT', 'BOSS', 'GAMEOVER', 'CLEAR', 'FORK']

WAVES = [
    [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10],  # triangle
    [0x8B, 0xDE, 0xFF, 0xED, 0xB8, 0x52, 0x10, 0x01, 0x25, 0x8B, 0xDE, 0xFF, 0xED, 0xB8, 0x52, 0x10],  # soft
    [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],  # square-ish bass
]

c = ['// generated by tools/gen_music.py - original music', '#include "music_data.h"', '']
h = ['// generated by tools/gen_music.py', '#pragma once', '#include <tonc_types.h>',
     'typedef struct { const u8 *ch[4]; u8 rows; u8 duty1, duty2; u8 env1, env2; u8 wave; u8 loop; } Song;',
     'extern const Song songs[];', 'extern const u16 sq_freq[128];', 'extern const u16 wv_freq[128];', 'extern const u8 waves[][16];']
for i, k in enumerate(ORDER): h.append('#define MUS_%s %d' % (k, i))
for k in ORDER:
    s = SONGS[k]
    lens = [total(e) for e in s['ch']]
    if s['loop']: assert len(set(lens)) == 1, (k, lens)
    for ci, ev in enumerate(s['ch']):
        data = []
        for n, l in ev:
            while l > 255: data += [n, 255]; n = 0 if n else 0; l -= 255
            data += [n, l]
        data += [255, 255]
        c.append('static const u8 %s_c%d[] = {%s};' % (k.lower(), ci, ','.join(map(str, data))))
c.append('const Song songs[] = {')
for k in ORDER:
    s = SONGS[k]
    c.append('  {{%s}, %d, %d, %d, 0x%02X, 0x%02X, %d, %d},' % (','.join('%s_c%d' % (k.lower(), i) for i in range(4)), s['rows'], s['duty'][0], s['duty'][1], s['env'][0], s['env'][1], s['wave'], s['loop']))
c.append('};')
sq = []; wv = []
for n in range(128):
    f = 440 * 2 ** ((n - 69) / 12)
    r = round(2048 - 131072 / f); sq.append(r if 0 <= r < 2048 else 0)
    r = round(2048 - 65536 / f); wv.append(r if 0 <= r < 2048 else 0)
c.append('const u16 sq_freq[128] = {%s};' % ','.join(map(str, sq)))
c.append('const u16 wv_freq[128] = {%s};' % ','.join(map(str, wv)))
c.append('const u8 waves[][16] = {%s};' % ','.join('{%s}' % ','.join('0x%02X' % b for b in w) for w in WAVES))

# ---------------- DirectSound SFX (8-bit signed PCM @ 13379 Hz)
RATE = 13379
def env_exp(i, n, k=4.0): return math.exp(-k * i / n)
def sfx_shot():
    n = int(RATE * 0.07); out = []
    ph = 0
    for i in range(n):
        f = 1800 - 1300 * i / n; ph += f / RATE
        out.append((1 if (ph % 1) < 0.5 else -1) * 46 * env_exp(i, n, 3))
    return out
def sfx_noise(dur, vol, k, lp=0.0, seed=1, pitchdrop=False):
    r = random.Random(seed); n = int(RATE * dur); out = []; v = 0; hold = 0; cur = 0
    for i in range(n):
        period = 1 + (int(8 * i / n) if pitchdrop else 0)
        if hold <= 0: cur = r.uniform(-1, 1); hold = period
        hold -= 1
        v = v * lp + cur * (1 - lp)
        out.append(v * vol * env_exp(i, n, k))
    return out
def sfx_tones(freqs, each, vol=50, duty=0.5):
    out = []
    for f in freqs:
        n = int(RATE * each)
        for i in range(n):
            out.append((1 if ((i * f / RATE) % 1) < duty else -1) * vol * (1 - 0.6 * i / n))
    return out
def sfx_sweep(f0, f1, dur, vol=50):
    n = int(RATE * dur); out = []; ph = 0
    for i in range(n):
        f = f0 + (f1 - f0) * i / n; ph += f / RATE
        out.append(math.sin(ph * 2 * math.pi) * vol * env_exp(i, n, 2))
    return out
def mix(a, b):
    n = max(len(a), len(b)); return [(a[i] if i < len(a) else 0) + (b[i] if i < len(b) else 0) for i in range(n)]
SFX = [
    ('SHOT', sfx_shot()),
    ('EXPLODE', mix(sfx_noise(0.35, 70, 4, 0.3, 2), sfx_sweep(220, 40, 0.3, 30))),
    ('BIGEXPLODE', mix(sfx_noise(1.0, 80, 3, 0.55, 3, True), sfx_sweep(120, 30, 0.9, 40))),
    ('PICKUP', sfx_tones([988, 1319], 0.045, 40)),
    ('POWERUP', sfx_tones([523, 659, 784, 1047, 1319], 0.05, 40, 0.25)),
    ('HIT', mix(sfx_noise(0.25, 60, 3, 0.1, 4), sfx_tones([200, 150, 100], 0.07, 40))),
    ('BOMB', mix(sfx_noise(1.3, 90, 2.2, 0.7, 5, True), sfx_sweep(400, 30, 1.2, 50))),
    ('MENU', sfx_tones([1568], 0.03, 30)),
    ('SELECT', sfx_tones([784, 1175], 0.05, 40)),
    ('COIN', sfx_tones([1976, 2637], 0.04, 30)),
    ('WARNING', sfx_tones([440, 330, 440, 330, 440, 330], 0.12, 40, 0.5)),
    ('ENHIT', sfx_noise(0.03, 30, 2, 0.0, 6)),
]
c.append('// SFX: 8-bit signed PCM @ %d Hz' % RATE)
names = []
for name, data in SFX:
    b = [max(-127, min(127, int(round(v)))) & 0xFF for v in data]
    b += [0] * (448 + (-len(b)) % 16)  # pad (DMA reads ahead)
    c.append('static const s8 sfx_%s[] __attribute__((aligned(4))) = {%s};' % (name.lower(), ','.join(str(x if x < 128 else x - 256) for x in b)))
    names.append((name, len(data)))
c.append('const SfxDef sfx_defs[] = {%s};' % ','.join('{sfx_%s, %d}' % (n.lower(), l) for n, l in names))
h.append('typedef struct { const s8 *data; u32 len; } SfxDef;')
h.append('extern const SfxDef sfx_defs[];')
for i, (n, l) in enumerate(names): h.append('#define SFX_%s %d' % (n, i))
h.append('#define SFX_RATE %d' % RATE)
open(os.path.join(ROOT, 'game/src/music_data.c'), 'w').write('\n'.join(c) + '\n')
open(os.path.join(ROOT, 'game/include/music_data.h'), 'w').write('\n'.join(h) + '\n')
print('ok', [(k, [total(e) for e in SONGS[k]['ch']]) for k in ORDER])
