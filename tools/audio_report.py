#!/usr/bin/env python3
"""Compare the v0.2 audio-setting WAV captures: level, spectrum, stereo image. (needs numpy)"""
import sys, glob, wave, os
import numpy as np
rows = []
for f in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else 'dist/audio/v02_*.wav')):
    w = wave.open(f); n = w.getnframes(); sr = w.getframerate()
    a = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, 2).astype(np.float64)
    L, R = a[:, 0], a[:, 1]; M = (L + R) / 2
    rms = np.sqrt(np.mean(M ** 2)); rl = np.sqrt(np.mean(L ** 2)); rr = np.sqrt(np.mean(R ** 2))
    side = np.sqrt(np.mean(((L - R) / 2) ** 2))
    sp = np.abs(np.fft.rfft(M * np.hanning(len(M)))); fr = np.fft.rfftfreq(len(M), 1 / sr)
    cen = (sp * fr).sum() / max(sp.sum(), 1e-9)
    hf = sp[fr > 4000].sum() / max(sp.sum(), 1e-9)
    corr = np.corrcoef(L, R)[0, 1] if rl > 0 and rr > 0 else float('nan')
    rows.append((os.path.basename(f)[4:-4], n / sr, rms, rl, rr, side, cen, hf * 100, corr))
print(f"{'variant':28s} {'sec':>4s} {'RMS':>7s} {'L':>7s} {'R':>7s} {'side':>7s} {'centroid':>8s} {'HF>4k%':>7s} {'L/Rcorr':>7s}")
for r in rows:
    print(f"{r[0]:28s} {r[1]:4.1f} {r[2]:7.0f} {r[3]:7.0f} {r[4]:7.0f} {r[5]:7.0f} {r[6]:8.0f} {r[7]:7.1f} {r[8]:7.3f}")
