// Bullet Storm Raiden - audio "driver"
//  * PSG music player (square 1/2, wave, noise) - hardware channels, or a software
//    re-implementation of the same four voices mixed into DirectSound ("DS only")
//  * software mixer: SFX samples (+ soft-synth music) resampled to the chosen rate,
//    tone filter, bit-crush, stereo matrix -> DirectSound A (left) / B (right)
//  * buffer ring with selectable latency and sync source (VBlank / Timer1 IRQ / free run)
#include "common.h"

#define NB 4
#define MAXSPF 528
#define PAD 16
static const u16 rate_period[6] = { 2508, 1596, 1254, 924, 798, 532 };
static const u16 rate_spf[6]    = { 112, 176, 224, 304, 352, 528 };
const u16 snd_rate_hz[6]        = { 6689, 10512, 13379, 18157, 21024, 31536 };

#define IWBSS __attribute__((section(".iwram_bss"), aligned(4)))
#define ARMFN __attribute__((section(".iwram"), long_call, target("arm"), noinline))
static s8 ringL[NB * MAXSPF + PAD + 16] IWBSS;
static s8 ringR[NB * MAXSPF + PAD + 16] IWBSS;
static s32 acc[2 * MAXSPF] IWBSS;

static int drv = -1, rate, spf, lat, sync_mode, ds_on;
static volatile int play_seg;
static int wseg;
static volatile int start_pending;
static u32 last_vbl;
int g_vu[2];

// ---------------------------------------------------------------- voices
typedef struct { const s8 *data; u32 pos, step, len; int pri, rem, active; } SfxVoice;
static SfxVoice sv[2];
typedef struct { u32 ph, st; int vol, dir, per, cnt, on, duty; u16 lfsr; u8 nshort; } SynVoice;
static SynVoice syn[4];
static s8 wave_s8[32] IWBSS;
static int gainL[6], gainR[6];        // per-voice pan gains (0..16)
static int mvol_k = 16, svol_k = 16;  // 0..16
static int tone, crush_mask, stereo;

// ---------------------------------------------------------------- music state
typedef struct { const u8 *p, *start; u16 rem; u16 gate; u8 active; } Chan;
static Chan ch[4];
static const Song *cur;
static int cur_id = -1, req_id = -1;
static const u8 sfx_priority[] = { 0, 3, 5, 2, 4, 4, 6, 1, 2, 1, 5, 0 };
static int steal[4];                 // PSG-only: frames a channel is used by an SFX

static void load_wave(int w)
{
    const u8 *src = waves[w];
    for (int i = 0; i < 16; i++) { wave_s8[i * 2] = (s8)(((src[i] >> 4) - 8) * 3); wave_s8[i * 2 + 1] = (s8)(((src[i] & 15) - 8) * 3); }
    REG_SND3SEL = 0x40;    // play bank 1, so writes go to bank 0
    for (int i = 0; i < 4; i++)
        ((vu32 *)(REG_BASE + 0x90))[i] = src[i * 4] | (src[i * 4 + 1] << 8) | (src[i * 4 + 2] << 16) | (src[i * 4 + 3] << 24);
    REG_SND3SEL = 0x80;    // enable, play bank 0
}

static void silence(int c)
{
    syn[c].on = 0;
    if (drv == DRV_DS || steal[c]) return;
    switch (c) {
    case 0: REG_SND1CNT = 0; REG_SND1FREQ = 0x8000; break;
    case 1: REG_SND2CNT = 0; REG_SND2FREQ = 0x8000; break;
    case 2: REG_SND3CNT = 0; break;
    case 3: REG_SND4CNT = 0; REG_SND4FREQ = 0x8000; break;
    }
}

void music_stop(void)
{
    cur = 0; cur_id = -1; req_id = -1;
    for (int i = 0; i < 4; i++) { silence(i); ch[i].active = 0; }
}

static int style_map(int id)
{
    if (id == MUS_W1 || id == MUS_W1_DREAM || id == MUS_W1_NIGHT) {
        if (g_set[S_MSTYLE] == 1) return MUS_W1_DREAM;
        if (g_set[S_MSTYLE] == 2) return MUS_W1_NIGHT;
    }
    return id;
}

void music_play(int id)
{
    int real = style_map(id);
    if (real == cur_id) { req_id = id; return; }
    music_stop();
    req_id = id;
    cur = &songs[real]; cur_id = real;
    load_wave(cur->wave);
    for (int i = 0; i < 4; i++) { ch[i].p = ch[i].start = cur->ch[i]; ch[i].rem = 0; ch[i].gate = 0; ch[i].active = 1; }
}
int music_current(void) { return req_id >= 0 ? req_id : cur_id; }
void music_restyle(void) { if (req_id >= 0) { int r = req_id; if (style_map(r) != cur_id) { cur_id = -2; music_play(r); } } }

static u32 synth_step(u32 num, int x) { return (u32)((((u64)num) << 32) / ((u32)(2048 - x) * snd_rate_hz[rate])); }

static void note_on(int c, int n, int frames)
{
    if (drv == DRV_DS) {
        SynVoice *v = &syn[c];
        switch (c) {
        case 0: case 1: {
            int x = sq_freq[n]; if (!x) return;
            u8 env = c ? cur->env2 : cur->env1; u8 duty = c ? cur->duty2 : cur->duty1;
            static const u32 dt[4] = { 0x20000000, 0x40000000, 0x80000000, 0xC0000000 };
            v->st = synth_step(131072, x); v->duty = dt[duty & 3];
            v->vol = env >> 4; v->dir = (env >> 3) & 1; v->per = env & 7; v->cnt = 0; v->on = 1;
            ch[c].gate = c ? frames - 1 : frames - (frames > 4 ? 2 : 1);
            break; }
        case 2: {
            int x = wv_freq[n]; if (!x) return;
            v->st = synth_step(65536, x); v->vol = 15; v->per = 0; v->on = 1;
            ch[c].gate = frames - 1;
            break; }
        case 3: {
            static const u16 dcnt[5] = { 0, 0xF200, 0xC200, 0x6100, 0xA400 };
            static const u16 dfrq[5] = { 0, 0x0077, 0x0032, 0x0011, 0x0041 };
            if (n > 4 || n == 0) return;
            int r = dfrq[n] & 7, s = (dfrq[n] >> 4) & 15;
            u32 f = (r ? 524288u / r : 1048576u) >> (s + 1);
            v->st = (u32)(((u64)f << 16) / snd_rate_hz[rate]);
            v->nshort = (dfrq[n] >> 3) & 1; v->lfsr = 0x7FFF;
            v->vol = dcnt[n] >> 12; v->dir = (dcnt[n] >> 11) & 1; v->per = (dcnt[n] >> 8) & 7; v->cnt = 0; v->on = 1;
            ch[c].gate = 0;
            break; }
        }
        return;
    }
    if (steal[c]) { ch[c].gate = 0; return; }
    switch (c) {
    case 0:
        if (!sq_freq[n]) return;
        REG_SND1CNT = (cur->duty1 << 6) | ((cur->env1 & 0xF) << 8) | ((cur->env1 >> 4) << 12);
        REG_SND1FREQ = 0x8000 | sq_freq[n];
        ch[c].gate = frames - (frames > 4 ? 2 : 1);
        break;
    case 1:
        if (!sq_freq[n]) return;
        REG_SND2CNT = (cur->duty2 << 6) | ((cur->env2 & 0xF) << 8) | ((cur->env2 >> 4) << 12);
        REG_SND2FREQ = 0x8000 | sq_freq[n];
        ch[c].gate = frames - 1;
        break;
    case 2:
        if (!wv_freq[n]) return;
        REG_SND3CNT = 0x2000;
        REG_SND3FREQ = 0x8000 | wv_freq[n];
        ch[c].gate = frames - 1;
        break;
    case 3: {
        static const u16 dcnt[5] = { 0, 0xF200, 0xC200, 0x6100, 0xA400 };
        static const u16 dfrq[5] = { 0, 0x0077, 0x0032, 0x0011, 0x0041 };
        if (n > 4) return;
        REG_SND4CNT = dcnt[n];
        REG_SND4FREQ = 0x8000 | dfrq[n];
        ch[c].gate = 0;
        break; }
    }
}

static void music_tick(void)
{
    // PSG-only SFX channel stealing
    for (int c = 0; c < 4; c++) if (steal[c] && --steal[c] == 0) {
        if (c == 0) REG_SND1SWEEP = 0x0008;
        silence(c);
    }
    // soft-synth envelopes (~1/64 s steps)
    for (int c = 0; c < 4; c++) {
        SynVoice *v = &syn[c];
        if (!v->on || !v->per) continue;
        if (++v->cnt >= v->per) { v->cnt = 0; if (v->dir) { if (v->vol < 15) v->vol++; } else if (v->vol > 0) v->vol--; }
    }
    if (!cur) return;
    int alive = 0;
    for (int c = 0; c < 4; c++) {
        Chan *k = &ch[c];
        if (!k->active) continue;
        alive++;
        if (k->gate && --k->gate == 0) silence(c);
        if (k->rem == 0) {
            if (k->p[0] == 255) {
                if (!cur->loop) { k->active = 0; silence(c); continue; }
                k->p = k->start;
            }
            int n = k->p[0], len = k->p[1];
            k->p += 2;
            k->rem = len * cur->rows;
            if (n) note_on(c, n, k->rem);
            else if (c != 3) silence(c);
        }
        k->rem--;
    }
    if (!alive) { cur = 0; cur_id = -1; }
}

// ---------------------------------------------------------------- PSG-only SFX recipes
typedef struct { u8 c; u8 frames; u16 sweep, cnt, freq; } PsgSfx;
static const PsgSfx psfx[12] = {
    { 0, 4,  0x001A, 0xA180, 1800 },   // shot
    { 3, 20, 0,      0xF200, 0x0055 }, // explode
    { 3, 50, 0,      0xF500, 0x0067 }, // big explode
    { 0, 6,  0x0015, 0xC180, 1600 },   // pickup
    { 0, 14, 0x0026, 0xD280, 1400 },   // powerup
    { 3, 15, 0,      0xF300, 0x0034 }, // hit
    { 3, 60, 0,      0xF700, 0x0077 }, // bomb
    { 0, 3,  0x0008, 0x8180, 1750 },   // menu
    { 0, 6,  0x0014, 0xA280, 1700 },   // select
    { 0, 6,  0x0012, 0xB180, 1850 },   // coin
    { 0, 30, 0x0008, 0xF0C0, 1500 },   // warning
    { 3, 3,  0,      0x8100, 0x0011 }, // enemy hit
};

void sfx(int id)
{
    if (!svol_k) return;
    if (drv == DRV_PSG) {
        const PsgSfx *p = &psfx[id];
        int v = ((p->cnt >> 12) * svol_k + 8) >> 4; if (v < 1) v = 1;
        u16 cnt = (p->cnt & 0x0FFF) | (v << 12);
        steal[p->c] = p->frames;
        if (p->c == 0) { REG_SND1SWEEP = p->sweep; REG_SND1CNT = cnt; REG_SND1FREQ = 0x8000 | p->freq; }
        else { REG_SND4CNT = cnt; REG_SND4FREQ = 0x8000 | p->freq; }
        return;
    }
    int c = (id == SFX_EXPLODE || id == SFX_BIGEXPLODE || id == SFX_BOMB || id == SFX_HIT || id == SFX_WARNING) ? 1 : 0;
    int pri = sfx_priority[id];
    SfxVoice *v = &sv[c];
    if (v->active && v->pri > pri) return;
    const SfxDef *s = &sfx_defs[id];
    int irq = REG_IME; REG_IME = 0;
    v->data = s->data; v->len = s->len; v->pos = 0;
    v->step = (u32)SFX_RATE * 65536u / snd_rate_hz[rate];
    v->pri = pri; v->active = 1;
    REG_IME = irq;
}

// ---------------------------------------------------------------- mixer (ARM, IWRAM)
ARMFN static void mix_sfx(SfxVoice *v, s32 *a, int n, int gl, int gr)
{
    u32 pos = v->pos, st = v->step, end = v->len << 16;
    const s8 *d = v->data;
    for (int i = 0; i < n; i++) {
        if (pos >= end) { v->active = 0; break; }
        int s = d[pos >> 16]; pos += st;
        a[0] += s * gl; a[1] += s * gr; a += 2;
    }
    v->pos = pos;
}
// all four soft-synth voices in one pass (writes acc, so no clear needed)
ARMFN static void mix_music(s32 *a, int n)
{
    SynVoice *q0 = &syn[0], *q1 = &syn[1], *w = &syn[2], *nz = &syn[3];
    u32 p0 = q0->ph, s0 = q0->st, d0 = q0->duty, p1 = q1->ph, s1 = q1->st, d1 = q1->duty, pw = w->ph, sw = w->st, pn = nz->ph, sn = nz->st;
    int k = mvol_k;
    int a0 = q0->on ? q0->vol * 2 * k >> 4 : 0, a1 = q1->on ? q1->vol * 2 * k >> 4 : 0;
    int aw = w->on ? k : 0, an = nz->on ? nz->vol * 2 * k >> 4 : 0;
    int l0 = a0 * gainL[0], r0 = a0 * gainR[0], l1 = a1 * gainL[1], r1 = a1 * gainR[1];
    int lw = aw * gainL[2] >> 4, rw = aw * gainR[2] >> 4, ln = an * gainL[3], rn = an * gainR[3];
    u32 lf = nz->lfsr; int sh = nz->nshort; int fast = sn >= 0x10000;
    for (int i = 0; i < n; i++) {
        int L, R;
        if (p0 < d0) { L = l0; R = r0; } else { L = -l0; R = -r0; }
        if (p1 < d1) { L += l1; R += r1; } else { L -= l1; R -= r1; }
        int ws = wave_s8[pw >> 27];
        L += ws * lw; R += ws * rw;
        p0 += s0; p1 += s1; pw += sw;
        if (an) {
            pn += sn;
            if (pn >= 0x10000) {
                pn = fast ? pn & 0xFFFF : pn - 0x10000;
                u32 bb = (lf ^ (lf >> 1)) & 1;
                lf = (lf >> 1) | (bb << 14);
                if (sh) lf = (lf & ~0x40) | (bb << 6);
            }
            if (lf & 1) { L -= ln; R -= rn; } else { L += ln; R += rn; }
        }
        a[0] = L; a[1] = R; a += 2;
    }
    q0->ph = p0; q1->ph = p1; w->ph = pw; nz->ph = pn; nz->lfsr = (u16)lf;
}
typedef struct { int fl, fr, f2l, f2r, pl, pr, pkl, pkr; } PostState;
#define CLIP8(v) do { if ((unsigned)((v) + 128) > 255) (v) = (v) < 0 ? -128 : 127; } while (0)
static inline __attribute__((always_inline)) void post_body(const s32 *a, s8 *ol, s8 *or_, int n, PostState *st, const int tn, const int sm, int mask)
{
    int fl = st->fl, fr = st->fr, f2l = st->f2l, f2r = st->f2r, pl = st->pl, pr = st->pr, pk = 0;
    for (int i = 0; i < n; i++) {
        int l = a[0] >> 4, r = a[1] >> 4; a += 2;
        if (sm == 1) { l = r = (l + r) >> 1; }
        else if (sm == 3) { int d = (l - r) >> 1; l += d; r -= d; }
        if (tn == 0) { int nl = l + ((l - pl) >> 1), nr = r + ((r - pr) >> 1); pl = l; pr = r; l = nl; r = nr; }
        else if (tn == 2) { fl += (l - fl) >> 1; fr += (r - fr) >> 1; l = fl; r = fr; }
        else if (tn == 3) { fl += (l - fl) >> 3; fr += (r - fr) >> 3; f2l += (fl - f2l) >> 2; f2r += (fr - f2r) >> 2; l = f2l + (f2l >> 2); r = f2r + (f2r >> 2); }
        CLIP8(l); CLIP8(r);
        l &= mask; r &= mask;
        ol[i] = (s8)l; or_[i] = (s8)r;
        pk |= (l ^ (l >> 31)) | (r ^ (r >> 31));   // cheap peak estimate (OR of magnitudes)
    }
    st->fl = fl; st->fr = fr; st->f2l = f2l; st->f2r = f2r; st->pl = pl; st->pr = pr; st->pkl = pk;
}
static PostState pst;
#define POSTV(T, S) ARMFN static void post_##T##_##S(const s32 *a, s8 *l, s8 *r, int n, int m) { post_body(a, l, r, n, &pst, T, S, m); }
#define POSTROW(T) POSTV(T, 0) POSTV(T, 1) POSTV(T, 3)
POSTROW(0) POSTROW(1) POSTROW(2) POSTROW(3)
typedef void (*PostFn)(const s32 *, s8 *, s8 *, int, int);
static PostFn const post_fns[4][4] = {
    { post_0_0, post_0_1, post_0_0, post_0_3 }, { post_1_0, post_1_1, post_1_0, post_1_3 },
    { post_2_0, post_2_1, post_2_0, post_2_3 }, { post_3_0, post_3_1, post_3_0, post_3_3 },
};
static void mix_post(const s32 *a, s8 *ol, s8 *or_, int n)
{
    post_fns[tone][stereo](a, ol, or_, n, crush_mask);
    g_vu[0] = g_vu[1] = pst.pkl > 127 ? 127 : pst.pkl;
}

static u8 seg_silent[NB];
static void mix_segment(int seg)
{
    int any = sv[0].active || sv[1].active;
    if (drv == DRV_DS && mvol_k) for (int c = 0; c < 4; c++) any |= syn[c].on;
    if (!any) {                       // nothing playing: write silence once, then skip the mixer entirely
        if (!seg_silent[seg]) {
            memset32(ringL + seg * spf, 0, spf / 4); memset32(ringR + seg * spf, 0, spf / 4);
            if (seg == 0) { memset32(ringL + NB * spf, 0, PAD / 4); memset32(ringR + NB * spf, 0, PAD / 4); }
            seg_silent[seg] = 1;
        }
        g_vu[0] = g_vu[1] = 0;
        return;
    }
    seg_silent[seg] = 0;
    if (drv == DRV_DS && mvol_k) mix_music(acc, spf);
    else memset32(acc, 0, spf * 2);
    for (int c = 0; c < 2; c++) if (sv[c].active) {
        int gl = gainL[4 + c] * svol_k >> 4, gr = gainR[4 + c] * svol_k >> 4;
        mix_sfx(&sv[c], acc, spf, gl, gr);
    }
    s8 *l = ringL + seg * spf, *r = ringR + seg * spf;
    mix_post(acc, l, r, spf);
    if (seg == 0) {   // pad after the ring mirrors its start (DMA reads ahead into it)
        memcpy32(ringL + NB * spf, ringL, PAD / 4);
        memcpy32(ringR + NB * spf, ringR, PAD / 4);
    }
}

// ---------------------------------------------------------------- DMA / timer plumbing
static inline void ds_point(int off)
{
    REG_DMA1CNT = 0; REG_DMA2CNT = 0;
    REG_DMA1SAD = (u32)(ringL + off); REG_DMA1DAD = (u32)&REG_FIFO_A;
    REG_DMA2SAD = (u32)(ringR + off); REG_DMA2DAD = (u32)&REG_FIFO_B;
    REG_DMA1CNT = DMA_DST_FIXED | DMA_REPEAT | DMA_32 | DMA_AT_FIFO | DMA_ENABLE;
    REG_DMA2CNT = DMA_DST_FIXED | DMA_REPEAT | DMA_32 | DMA_AT_FIFO | DMA_ENABLE;
}

static void timer1_isr(void)
{
    if (sync_mode == SY_TIMER) { play_seg = (play_seg + 1) % NB; ds_point(play_seg * spf + PAD); }
    else { play_seg = 0; ds_point(PAD); }
}

static void ds_start_now(void)   // runs inside the vblank ISR
{
    REG_TM0CNT = 0; REG_TM1CNT = 0;
    REG_SNDDSCNT |= SDS_ARESET | SDS_BRESET;
    play_seg = 0;
    ds_point(0);
    if (sync_mode != SY_VSYNC) {
        int first = sync_mode == SY_TIMER ? spf - 8 : NB * spf - 8;
        REG_TM1D = 65536 - first;
        REG_TM1CNT = TM_CASCADE | TM_IRQ | TM_ENABLE;
        REG_TM1D = 65536 - (sync_mode == SY_TIMER ? spf : NB * spf);
    }
    // start the sample clock half a sample after vblank so buffer swaps never race a sample edge
    for (volatile int i = 0; i < rate_period[rate] / 16; i++) ;
    REG_TM0D = 65536 - rate_period[rate];
    REG_TM0CNT = TM_ENABLE;
    wseg = lat % NB;
}

void snd_isr(void)   // vblank
{
    if (start_pending) { start_pending = 0; if (ds_on) ds_start_now(); return; }
    if (ds_on && sync_mode == SY_VSYNC) { play_seg = (play_seg + 1) % NB; ds_point(play_seg * spf + PAD); }
}

static void psg_pan(void)
{
    // SNDDMGCNT: bits 8-11 right enables, 12-15 left (sq1, sq2, wave, noise)
    int L = 0xF, R = 0xF;
    switch (stereo) {
    case ST_STEREO: L = 0x7; R = 0xD; break;
    case ST_SWAP:   L = 0xD; R = 0x7; break;
    case ST_WIDE:   L = 0x5; R = 0xE; break;
    }
    // music volume -> best (ratio, master) pair
    int best = 0, bd = 1 << 30, bv = 7, br = 2;
    int want = mvol_k * 64 / 16;       // 0..64
    static const u8 ratio[3] = { 16, 32, 64 };   // 25/50/100%  (x64)
    for (int r = 0; r < 3; r++) for (int v = 0; v < 8; v++) {
        int got = (v + 1) * ratio[r] / 8, d = got > want ? got - want : want - got;
        if (d < bd) { bd = d; bv = v; br = r; best = 1; }
    }
    (void)best;
    if (drv == DRV_DS || mvol_k == 0) { L = 0; R = 0; }
    REG_SNDDMGCNT = (R << 8) | (L << 12) | bv | (bv << 4);
    REG_SNDDSCNT = (REG_SNDDSCNT & ~3) | br;
}

// apply audio settings (instant)
void snd_settings(void)
{
    int nd = g_set[S_ADRV], nr = g_set[S_ARATE];
    static const u8 lat_frames[3] = { 1, 2, 3 };
    int nl = lat_frames[g_set[S_LAT]], ns = g_set[S_ASYNC];
    static const int masks[4] = { ~0, ~3, ~15, ~63 };
    crush_mask = masks[g_set[S_CRUSH]];
    tone = g_set[S_TONE];
    stereo = g_set[S_STEREO];
    mvol_k = g_set[S_MVOL] * 16 / 10; svol_k = g_set[S_SVOL] * 16 / 10;
    // pan gains: sq1, sq2, wave, noise, sfx0, sfx1
    static const u8 pans[4][6][2] = {
        { {16,16},{16,6},{16,16},{6,16},{16,16},{16,16} },   // stereo
        { {16,16},{16,16},{16,16},{16,16},{16,16},{16,16} }, // mono
        { {16,16},{6,16},{16,16},{16,6},{16,16},{16,16} },   // swap
        { {16,9},{16,0},{16,16},{0,16},{9,16},{16,16} },     // wide
    };
    for (int i = 0; i < 6; i++) { gainL[i] = pans[stereo][i][0]; gainR[i] = pans[stereo][i][1]; }
    int restart = nd != drv || nr != rate || nl != lat || ns != sync_mode;
    if (restart) {
        int irq = REG_IME; REG_IME = 0;
        int old = drv;
        drv = nd; rate = nr; lat = nl; sync_mode = ns; spf = rate_spf[rate];
        REG_TM0CNT = 0; REG_TM1CNT = 0; REG_DMA1CNT = 0; REG_DMA2CNT = 0;
        sv[0].active = sv[1].active = 0;
        for (int c = 0; c < 4; c++) { syn[c].on = 0; steal[c] = 0; }
        memset32(ringL, 0, sizeof(ringL) / 4); memset32(ringR, 0, sizeof(ringR) / 4);
        for (int i = 0; i < NB; i++) seg_silent[i] = 1;
        ds_on = drv != DRV_PSG;
        REG_SNDDSCNT = SDS_DMG100 | SDS_A100 | SDS_B100 | SDS_AL | SDS_ATMR0 | SDS_ARESET | SDS_BR | SDS_BTMR0 | SDS_BRESET;
        if (!ds_on) REG_SNDDSCNT = SDS_DMG100 | SDS_ARESET | SDS_BRESET;
        REG_SND1SWEEP = 0x0008;
        if (old != drv && cur) {   // restart the song on the new driver
            int r = req_id; cur_id = -2; music_play(r);
        }
        if (drv == DRV_DS) for (int c = 0; c < 4; c++) { switch (c) { case 0: REG_SND1CNT = 0; break; case 1: REG_SND2CNT = 0; break; case 2: REG_SND3CNT = 0; break; default: REG_SND4CNT = 0; } }
        start_pending = 1;
        REG_IME = irq;
    }
    psg_pan();
}

void snd_init(void)
{
    REG_SNDSTAT = SSTAT_ENABLE;
    REG_SNDBIAS = 0x200;
    REG_SND1SWEEP = 0x0008;
    irq_add(II_TIMER1, timer1_isr);
    last_vbl = g_vbl;
    snd_settings();
}

int snd_cpu_rate(void) { return snd_rate_hz[rate]; }

void snd_update(void)
{
    u32 now = g_vbl;
    int ticks = (int)(now - last_vbl);
    last_vbl = now;
    if (ticks < 1) ticks = 1;
    if (ticks > 4) ticks = 4;
    for (int t = 0; t < ticks; t++) music_tick();
    if (!ds_on || start_pending) return;
    if (sync_mode == SY_FREE) {
        for (int t = 0; t < ticks; t++) { mix_segment(wseg); wseg = (wseg + 1) % NB; }
    } else {
        mix_segment((play_seg + lat) % NB);
    }
}
