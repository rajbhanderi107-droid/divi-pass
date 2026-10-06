"""Synthesises the promo soundtrack: drone, dhol, dandiya clicks, bansuri-style melody.
Usage: python3 music.py out.wav   (21 s, 120 BPM, hits land on the video's scene cuts)"""
import sys, wave
import numpy as np

SR, DUR, BPM = 44100, 21.0, 120
BEAT = 60 / BPM
SIX = BEAT / 4
CUTS = [3, 7, 11, 14, 17.5]
N = int(SR * DUR)
rng = np.random.default_rng(1)
mix = np.zeros((N, 2))


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    mix[i:i + len(sig), 0] += sig * np.sqrt((1 - pan) / 2)
    mix[i:i + len(sig), 1] += sig * np.sqrt((1 + pan) / 2)


def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)


def dhol_bass(d=0.35):
    n = int(SR * 0.9); t = np.arange(n) / SR
    f = 55 + 70 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, d)


def dhol_high():
    n = int(SR * 0.25); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 380 * t) * 0.6 + np.sin(2 * np.pi * 610 * t) * 0.3
    return (tone + rng.normal(0, 0.5, n) * np.exp(-t / 0.01)) * env(n, 0.001, 0.06)


def click():  # dandiya sticks
    n = int(SR * 0.08); t = np.arange(n) / SR
    s = rng.normal(0, 1, n) * np.exp(-t / 0.008) + np.sin(2 * np.pi * 2200 * t) * np.exp(-t / 0.02)
    return np.diff(s, prepend=0) * 0.6


def cymbal(d=1.2):
    n = int(SR * 2.5); t = np.arange(n) / SR
    s = np.diff(rng.normal(0, 1, n), prepend=0)
    return s * env(n, 0.002, d) * 0.5


def bell(f, d=1.6):
    n = int(SR * 3); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (d / r ** .5)) for r, a in [(1, 1), (2.76, .5), (5.4, .25), (8.9, .1)])
    return s * env(n, 0.001, 10)


def flute(f, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.3)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    s = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph) + rng.normal(0, 0.03, n)
    a = np.minimum(1, t / 0.06) * np.minimum(1, (dur - t) / 0.12)
    return s * np.clip(a, 0, 1)


def riser(dur):
    n = int(SR * dur); t = np.arange(n) / SR
    noise = np.diff(rng.normal(0, 1, n), prepend=0)
    return noise * (t / dur) ** 2 * 0.4


# Drone (D + A), swells in
t = np.arange(N) / SR
drone = sum(a * np.sin(2 * np.pi * f * t + p) for f, a, p in [(73.42, .5, 0), (146.83, .35, 1), (220.0, .3, 2), (293.66, .15, 3), (440.0, .06, 4)])
drone *= (0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t) ** 2) * np.minimum(1, t / 2.5) * np.minimum(1, (DUR - t) / 1.0)
mix[:, 0] += drone * 0.10; mix[:, 1] += drone * 0.10

# Intro: bells and a riser into the first hit
for i, (tm, f) in enumerate([(0.3, 587.3), (1.0, 880), (1.6, 739.9), (2.2, 1174.7)]):
    add(bell(f), tm, 0.12, [-.5, .5, -.3, .3][i])
add(riser(2.0), 1.0, 0.5)

# Groove from the title on: 16-step pattern per bar
BASS = {0: 1, 6: .7, 8: .9, 11: .6, 14: .7}
HIGH = {2: .5, 4: .8, 7: .4, 10: .6, 12: .8, 15: .5}
CLAP = {4: 1, 12: 1}
bar_len = SIX * 16
bar = 0
while CUTS[0] + bar * bar_len < DUR - 1:
    b0 = CUTS[0] + bar * bar_len
    for s in range(16):
        tm = b0 + s * SIX
        if tm >= DUR - 1.0:
            break
        if s in BASS: add(dhol_bass(), tm, 0.55 * BASS[s])
        if s in HIGH: add(dhol_high(), tm, 0.30 * HIGH[s], 0.2)
        if s in CLAP: add(click(), tm, 0.55, -0.3)
        if 7 <= tm < 11 and s % 4 == 2: add(click(), tm, 0.4, 0.4)  # extra dandiya in the dance scene
    bar += 1

# Scene-cut accents and the final hit
for c in CUTS + [DUR - 1.0]:
    add(dhol_bass(0.6), c, 0.75)
    add(cymbal(), c, 0.18)
for c in CUTS[1:]:
    add(riser(0.5), c - 0.5, 0.35)

# Bansuri-style phrase in D (pentatonic) over the groove
D = 293.66
note = lambda semi: D * 2 ** (semi / 12)
phrase = [(7, 1), (9, .5), (12, .5), (14, 1), (12, .5), (9, .5), (7, 1),
          (4, .5), (7, .5), (9, 1), (7, .5), (4, .5), (2, 1), (0, 1)]
for start in (3.0, 10.0):
    tm = start
    for semi, beats in phrase:
        add(flute(note(semi), beats * BEAT * 0.95), tm, 0.11, 0.1)
        tm += beats * BEAT
for semi, tm, beats in [(12, 17.5, 1), (14, 18.0, .5), (16, 18.25, .5), (19, 18.5, 2)]:
    add(flute(note(semi), beats * BEAT), tm, 0.11, 0.1)
add(bell(1174.7), 20.0, 0.14)

# Simple reverb: convolve with a decaying-noise impulse response
ir_n = int(SR * 1.2)
ir = rng.normal(0, 1, ir_n) * np.exp(-np.arange(ir_n) / SR / 0.35)
ir /= np.abs(ir).sum() / 6
L = 1 << int(np.ceil(np.log2(N + ir_n)))
IR = np.fft.rfft(ir, L)
for ch in range(2):
    wet = np.fft.irfft(np.fft.rfft(mix[:, ch], L) * IR, L)[:N]
    mix[:, ch] = mix[:, ch] + 0.18 * wet

mix *= np.minimum(1, (DUR - t) / 0.6)[:, None]
mix = np.tanh(mix * 1.4)  # gentle saturation / limiter
mix /= np.abs(mix).max() / 0.92
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
