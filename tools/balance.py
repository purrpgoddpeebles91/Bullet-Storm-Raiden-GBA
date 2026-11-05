#!/usr/bin/env python3
"""Balance check: runs the ROM headless with the built-in test autopilot (title: hold L+R, press DOWN;
1x = skilled, 2x = novice) on several seeds per difficulty and reads g_stats via runrom 'peek'.
usage: balance.py ROM [seeds] [maxframes] [skills e.g. 2,1] -> prints a table, writes dist/balance_v03.txt"""
import os, sys, subprocess, tempfile, statistics
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rom = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 6
MAXF = int(sys.argv[3]) if len(sys.argv) > 3 else 15000
SKILLS = [int(x) for x in (sys.argv[4] if len(sys.argv) > 4 else '2,1').split(',')]
elf = os.path.join(ROOT, 'game', 'build', 'BulletStormRaiden.elf')
addr = None
for line in subprocess.run(['/opt/wonderful/toolchain/gcc-arm-none-eabi/bin/arm-none-eabi-nm', elf], capture_output=True, text=True).stdout.splitlines():
    if line.endswith(' g_stats'): addr = line.split()[0]
assert addr, 'g_stats not found'
FIELDS = ['magic', 'frames', 'hits', 'bombs', 'shifts', 'score', 'sub', 'bosses', 'died', 'diff', 'bf0', 'bf1', 'bf2', 'sf0', 'sf1', 'sf2', 'shields']

def run(skill, diff, k):
    d = tempfile.mkdtemp()
    sc = ['wait %d' % (40 + k * 13), 'hold L+R 5'] + ['hold L+R+DOWN 3', 'hold L+R 3'] * skill + ['wait 10',
          'press START', 'press A', 'wait 10'] + ['press DOWN'] * diff + ['press A', 'wait 10', 'press A', 'wait 10',
          'press DOWN', 'press DOWN', 'press A']
    # peek periodically so a run that ended early is still read (stats stay after death / clear)
    sc += ['wait %d' % MAXF, 'peek %s 17' % addr]
    open(d + '/s.txt', 'w').write('\n'.join(sc) + '\n')
    out = subprocess.run([os.path.join(ROOT, 'tools', 'runrom'), rom, d + '/s.txt', d, d + '/x.sav'], capture_output=True, text=True).stdout
    vals = [int(v) for v in out.split('peek')[-1].split(':')[1].split()]
    return dict(zip(FIELDS, vals))

DIFFS = [int(x) for x in os.environ.get('DIFFS', '0,1,2,3').split(',')]
jobs = [(s, d, k) for s in SKILLS for d in DIFFS for k in range(N)]
with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
    res = list(ex.map(lambda j: (j, run(*j)), jobs))
lines = ['skill   diff     runs  died  med_time_s  med_hits  reach(1-1/1-2/1-3/clear)  med_boss11_s  bombs']
for s in SKILLS:
    for d in DIFFS:
        rs = [r for (j, r) in res if j[0] == s and j[1] == d]
        t = [r['frames'] / 60 for r in rs]
        reach = [0, 0, 0, 0]
        for r in rs:
            if r['bosses'] >= 3: reach[3] += 1
            else: reach[r['sub']] += 1
        b11 = [r['bf0'] / 60 for r in rs if r['bf0']]
        lines.append('%-7s %-8s %4d  %4d  %10.0f  %8.1f  %-24s  %12.1f  %5.1f' % (
            'novice' if s == 2 else 'skilled', ['EASY', 'NORMAL', 'HARD', 'EXTREME'][d], len(rs), sum(r['died'] for r in rs),
            statistics.median(t), statistics.median([r['hits'] for r in rs]), '/'.join(map(str, reach)),
            statistics.median(b11) if b11 else 0, statistics.mean([r['bombs'] for r in rs])))
print('\n'.join(lines))
if len(sys.argv) > 5:
    open(sys.argv[5], 'w').write('\n'.join(lines) + '\n')
