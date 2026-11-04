// Bullet Storm Raiden - "video driver": real-time palette shaders, temporal dither,
// HDMA scanlines / interlace, hardware mosaic, window aspect masks, OBJ frame-blend
// ghosting, screen shake, flash control, frame pacing and the FPS / CPU meter.
#include "common.h"

extern const unsigned int sys8Glyphs[192];

u16 g_mpal[512];                 // master palettes: bg 0..255, obj 256..511 (what the game "means")
static u16 pal_out[2][512];      // transformed copies (two for temporal dithering)
static u32 dirty;                // bit per 16-colour bank: 0..15 bg, 16..31 obj
static int upload;               // pal_out changed -> copy at next vblank
u32 g_pal_skip;                  // bg banks drawn unshaded (settings menu text); backdrop always shaded
int g_preview;                   // settings menu live preview active
int g_px0, g_py0, g_px1, g_py1;  // preview rectangle (pixels)
int g_aspect_on;                 // gameplay aspect mask allowed (ST_PLAY)
int g_shx, g_shy;                // current shake offset
static int shake_t, shake_amp;
volatile u32 g_vbl;              // vblank counter (ISR)
static u32 vbl_mark, fps_cnt, fps_val, cpu_val, cpu_peak, cpu_frames;
int g_render_this;               // this loop iteration is shown (30 fps / adaptive skip)

// transform state
static int shader, satk = 16, dither, bullets;
static u8 lutb[32];
static int scan_active, ghost, mos_bg, mos_obj;
static u16 scan_tbl[2][162];
static OBJ_ATTR obj_out[128];
static u16 ghist[2][128][3];
static int ghn[2];

#define METER_TILE 480
static const char meter_chars[] = "0123456789FPSCU% ";

static inline int cl(int v) { return v < 0 ? 0 : v > 31 ? 31 : v; }

// ---------------------------------------------------------------- palette master
void pal_master_init(void)
{
    memcpy16(g_mpal, bg_pal, 256);
    memcpy16(g_mpal + 256, obj_pal, 256);
    // obj bank 15: private copy of the enemy-bullet bank (bank 1) so bullets can be recoloured alone
    for (int i = 0; i < 16; i++) g_mpal[256 + 15 * 16 + i] = obj_pal[16 + i];
    // obj bank 14: perf meter text
    g_mpal[256 + 14 * 16 + 1] = RGB15(31, 31, 31);
    g_mpal[256 + 14 * 16 + 2] = RGB15(0, 0, 0);
    g_mpal[256 + 14 * 16 + 3] = RGB15(31, 31, 0);
    // bg bank 13: solid fills for BG1 (1 = menu navy, 2 = black letterbox)
    g_mpal[13 * 16 + 1] = RGB15(2, 3, 9);
    g_mpal[13 * 16 + 2] = RGB15(0, 0, 0);
    dirty = 0xFFFFFFFF;
}
void pal_bg_set(int i, u16 c) { if (g_mpal[i] != c) { g_mpal[i] = c; dirty |= 1u << (i >> 4); } }
void pal_mark_all(void) { dirty = 0xFFFFFFFF; }

static void shade(int *pr, int *pg, int *pb)
{
    int r = *pr, g = *pg, b = *pb;
    int l = (r * 77 + g * 150 + b * 29) >> 8;
    switch (shader) {
    case SH_LCD: {          // GBA/SP LCD response: darker gamma + colour bleed between channels
        r = (r * r / 31 + r) >> 1; g = (g * g / 31 + g) >> 1; b = (b * b / 31 + b) >> 1;
        int R2 = (r * 26 + g * 4 + b * 2) >> 5, G2 = (r * 3 + g * 24 + b * 5) >> 5, B2 = (r * 2 + g * 6 + b * 24) >> 5;
        r = R2 + 1; g = G2 + 1; b = B2 + 2; break; }
    case SH_CRT:            // warm phosphor, lifted blacks
        r = r * 17 / 16 + 2; g = g * 31 / 32 + 1; b = b * 13 / 16 + 1; break;
    case SH_DMG: {          // original Game Boy 4-shade green
        static const u8 pr4[4] = { 1, 6, 17, 19 }, pg4[4] = { 7, 12, 21, 23 }, pb4[4] = { 1, 6, 1, 1 };
        int k = l >> 3; r = pr4[k]; g = pg4[k]; b = pb4[k]; break; }
    case SH_POCKET: {       // Game Boy Pocket greys
        static const u8 v4[4] = { 3, 11, 20, 28 };
        int k = l >> 3; r = v4[k]; g = v4[k] + 1; b = v4[k]; break; }
    case SH_SEPIA:
        r = l * 17 / 16 + 3; g = l * 15 / 16 + 1; b = l * 3 / 4; break;
    case SH_VBOY: {         // Virtual Boy red on black, 4 shades
        static const u8 v4[4] = { 0, 10, 20, 31 };
        r = v4[l >> 3]; g = 0; b = 0; break; }
    case SH_NIGHT: {        // night-vision phosphor
        int v = l * 3 / 2 + 3; if (v > 31) v = 31;
        r = v >> 2; g = v; b = v >> 2; break; }
    case SH_INVERT:
        r = 31 - r; g = 31 - g; b = 31 - b; break;
    case SH_CONTRAST: {     // S-curve + saturation push
        #define SC(x) ((x) < 16 ? (x) * (x) / 16 : 31 - (31 - (x)) * (31 - (x)) / 16)
        r = SC(r); g = SC(g); b = SC(b);
        int l2 = (r * 77 + g * 150 + b * 29) >> 8;
        r = l2 + (r - l2) * 3 / 2; g = l2 + (g - l2) * 3 / 2; b = l2 + (b - l2) * 3 / 2; break; }
    case SH_PASTEL:         // dream pastel: lift toward white, pink/lilac tint
        r = (r * 5 + 31 * 3) / 8 + 1; g = (g * 5 + 27 * 3) / 8; b = (b * 5 + 31 * 3) / 8 + 1; break;
    case SH_GRIT: {         // nightmare grit: desaturate, crush blacks, blood push
        r = l + (r - l) * 2 / 5; g = l + (g - l) * 2 / 5; b = l + (b - l) * 2 / 5;
        r = r < 6 ? 0 : (r - 6) * 31 / 25 + 3; g = g < 6 ? 0 : (g - 6) * 31 / 27; b = b < 6 ? 0 : (b - 6) * 31 / 30 * 3 / 4; break; }
    }
    *pr = cl(r); *pg = cl(g); *pb = cl(b);
}

static inline int dq(int x, int pass)
{
    int v = x * 7, lv = v / 31, fr = v - lv * 31;
    lv += pass ? (fr > 7) : (fr > 23);
    if (lv > 7) lv = 7;
    return lv * 31 / 7;
}

// mode 0 = shaded, 1 = unshaded (menu text), 2 = high-visibility bullet
static u16 xf(u16 c, int pass, int mode)
{
    int r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    if (mode == 2) {
        int l = (r * 77 + g * 150 + b * 29) >> 8;
        if (l > 13) { r = g = b = 31; }
        else if (bullets == 1) { r = 31; g = 4; b = 2; }
        else { r = 31; g = 0; b = 31; }
        return r | g << 5 | b << 10;
    }
    if (mode == 0) {
        if (satk != 16) {
            int l = (r * 77 + g * 150 + b * 29) >> 8;
            r = cl(l + (((r - l) * satk) >> 4)); g = cl(l + (((g - l) * satk) >> 4)); b = cl(l + (((b - l) * satk) >> 4));
        }
        if (shader) shade(&r, &g, &b);
    } else return c;
    r = lutb[r]; g = lutb[g]; b = lutb[b];
    if (dither && mode == 0) { r = dq(r, pass); g = dq(g, pass); b = dq(b, pass); }
    return r | g << 5 | b << 10;
}

static void pal_prepare(void)
{
    if (!dirty) return;
    u32 d = dirty; dirty = 0;
    for (int bank = 0; bank < 32; bank++) {
        if (!(d & (1u << bank))) continue;
        int mode = 0;
        if (bank < 16 && (g_pal_skip & (1u << bank))) mode = 1;
        if (bank == 31 && bullets) mode = 2;
        if (bank == 30 || bank == 13) mode = 1;   // perf meter readable, letterbox bars stay true black
        for (int i = 0; i < 16; i++) {
            int idx = bank * 16 + i;
            int m = (idx == 0) ? 0 : mode;   // backdrop always shaded
            u16 c = g_mpal[idx];
            pal_out[0][idx] = xf(c, 0, m);
            pal_out[1][idx] = dither ? xf(c, 1, m) : pal_out[0][idx];
        }
    }
    upload = 1;
}

// ---------------------------------------------------------------- settings -> state
void vid_settings(void)
{
    shader = g_set[S_SHADER];
    static const u8 sk[6] = { 0, 8, 12, 16, 20, 24 };
    satk = sk[g_set[S_SAT]];
    dither = g_set[S_RENDER] == RM_DITHER;
    bullets = g_set[S_BULLET];
    int t = (int)g_set[S_BRIGHT] - 3;
    for (int x = 0; x < 32; x++) {
        int tgt = t < 0 ? x * x / 31 : x * (62 - x) / 31;
        int a = t < 0 ? -t : t;
        lutb[x] = (u8)cl(x + (tgt - x) * a / 3);
    }
    static const u8 sl[4] = { 0, 4, 7, 10 };
    int lvl = sl[g_set[S_SCAN]], inter = g_set[S_RENDER] == RM_INTERLACE ? 9 : 0;
    scan_active = lvl || inter;
    for (int f = 0; f < 2; f++)
        for (int y = 0; y < 162; y++) {
            int v = (y & 1) ? lvl : 0;
            if (inter && ((y + f) & 1) && v < inter) v = inter;
            scan_tbl[f][y] = v;
        }
    ghost = g_set[S_GHOST];
    int sc = g_set[S_SCALE];            // 0 native .. 3 = 4x
    mos_bg = sc | (sc << 4); mos_obj = sc | (sc << 4);
    if (g_set[S_RENDER] == RM_LINEDBL) {
        if ((mos_bg >> 4) < 1) mos_bg = (mos_bg & 15) | (1 << 4);
        if ((mos_obj >> 4) < 1) mos_obj = (mos_obj & 15) | (1 << 4);
    }
    dirty = 0xFFFFFFFF;
}

// ---------------------------------------------------------------- shake / flash
void vid_shake(int strength)
{
    static const u8 amp[3] = { 0, 1, 3 };
    int a = amp[g_set[S_SHAKE]];
    if (!a) return;
    if (strength > shake_t) shake_t = strength;
    shake_amp = a;
}
void vid_flash(int on, u16 base)
{
    u16 c = base;
    if (on) {
        int f = g_set[S_FLASH];
        if (f == 0) c = CLR_WHITE;
        else if (f == 1) {   // soft: 35% toward white
            int r = base & 31, g = (base >> 5) & 31, b = (base >> 10) & 31;
            r += (31 - r) * 35 / 100; g += (31 - g) * 35 / 100; b += (31 - b) * 35 / 100;
            c = r | g << 5 | b << 10;
        }
    }
    pal_bg_set(0, c);
}

// ---------------------------------------------------------------- BG1 solid fill (menu backing / letterbox)
void vid_bg1_fill(int tile)
{
    u16 se = tile | (13 << 12);
    for (int i = 0; i < 1024; i++) se_mem[27][i] = se;
}

// ---------------------------------------------------------------- init
void vid_init(void)
{
    pal_master_init();
    // solid tiles 320 (colour 1) and 321 (colour 2) in charblock 0
    memset32(&tile_mem[0][320], 0x11111111, 8);
    memset32(&tile_mem[0][321], 0x22222222, 8);
    for (int y = 0; y < 8; y++) ((u32 *)&tile_mem[0][322])[y] = y == 7 ? 0 : 0x01111110;   // VU meter cell (text colour 1)
    // perf meter glyphs in OBJ tile memory
    const u8 *g = (const u8 *)sys8Glyphs;
    for (int k = 0; meter_chars[k]; k++) {
        int c = meter_chars[k] - 32;
        u32 *t = (u32 *)&tile_mem[4][METER_TILE + k];
        for (int y = 0; y < 8; y++) {
            u32 row = 0;
            for (int x = 0; x < 8; x++) {
                u32 ci = 0;
                if ((g[c * 8 + y] >> x) & 1) ci = 1;
                else if (x > 0 && y > 0 && ((g[c * 8 + y - 1] >> (x - 1)) & 1)) ci = 2;
                row |= ci << (x * 4);
            }
            t[y] = row;
        }
    }
    vid_settings();
}

// ---------------------------------------------------------------- per-frame (before vblank)
static int meter_tile(char ch)
{
    for (int k = 0; meter_chars[k]; k++) if (meter_chars[k] == ch) return METER_TILE + k;
    return METER_TILE + 16;
}

void vid_prepare(void)
{
    pal_prepare();
    // shake offset
    if (shake_t > 0) {
        int a = shake_amp * (shake_t > 6 ? 2 : 1);
        g_shx = frnd(a * 2 + 1) - a; g_shy = frnd(a * 2 + 1) - a;
        shake_t--;
    } else g_shx = g_shy = 0;
    // OAM post pass: copy, shake, mosaic, ghost trails
    memcpy32(obj_out, obj_buffer, 256);
    int used = g_oam > 128 ? 128 : g_oam;
    u16 mos = mos_obj ? ATTR0_MOSAIC : 0;
    for (int i = 0; i < used; i++) {
        OBJ_ATTR *o = &obj_out[i];
        if ((o->attr0 & 0x0300) == ATTR0_HIDE) continue;
        o->attr0 = (o->attr0 & ~0xFF) | ((o->attr0 + g_shy) & 0xFF) | mos;
        o->attr1 = (o->attr1 & ~0x1FF) | ((o->attr1 + g_shx) & 0x1FF);
    }
    int slot = used;
    if (ghost) {
        int trails = ghost == 1 ? 1 : 2;
        for (int h = 0; h < trails; h++)
            for (int i = 0; i < ghn[h] && slot < 120; i++, slot++) {
                obj_out[slot].attr0 = (ghist[h][i][0] & ~0x0C00) | ATTR0_BLEND | mos;
                obj_out[slot].attr1 = ghist[h][i][1];
                obj_out[slot].attr2 = (ghist[h][i][2] & ~ATTR2_PRIO_MASK) | ATTR2_PRIO(2);
            }
        // shift history (only from displayed frames)
        if (g_render_this) {
            memcpy(ghist[1], ghist[0], sizeof(ghist[0])); ghn[1] = ghn[0];
            int n = 0;
            for (int i = 0; i < used; i++) {
                OBJ_ATTR *o = &obj_out[i];
                if ((o->attr0 & 0x0300) == ATTR0_HIDE) continue;
                if (o->attr0 & 0x0100) continue;          // skip affine (menu zoom) sprites
                ghist[0][n][0] = o->attr0 & ~ATTR0_MOSAIC; ghist[0][n][1] = o->attr1; ghist[0][n][2] = o->attr2; n++;
            }
            ghn[0] = n;
        }
    } else ghn[0] = ghn[1] = 0;
    // perf meter (last 9 slots)
    int m = g_set[S_METER];
    if (m) {
        char buf[12]; int n = 0;
        if (m & 1) { buf[n++] = '0' + fps_val / 10; buf[n++] = '0' + fps_val % 10; buf[n++] = 'F'; buf[n++] = 'P'; buf[n++] = 'S'; }
        if (m == 3) buf[n++] = ' ';
        if (m & 2) {
            int c = cpu_val > 99 ? 99 : cpu_val;
            buf[n++] = 'C'; buf[n++] = '0' + c / 10; buf[n++] = '0' + c % 10; buf[n++] = '%';
        }
        int x0 = 238 - n * 6, y0 = 17;
        if (g_preview) { x0 = g_px1 - 2 - n * 6; y0 = g_py1 - 10; }   // inside the live preview box
        for (int i = 0; i < n && i < 10; i++) {
            OBJ_ATTR *o = &obj_out[118 + i];
            o->attr0 = ATTR0_SQUARE | ATTR0_4BPP | ATTR0_Y(y0);
            o->attr1 = ATTR1_SIZE_8 | ATTR1_X(x0 + i * 6);
            o->attr2 = ATTR2_ID(meter_tile(buf[i])) | ATTR2_PALBANK(14) | ATTR2_PRIO(0);
        }
    }
}

// called at end of logic: VCOUNT based CPU estimate
void vid_measure(u32 frame_vbl)
{
    int vc = REG_VCOUNT;
    int lines = vc >= 160 ? vc - 160 : vc + 68;
    int pct = lines * 100 / 228;
    if (g_vbl != frame_vbl) pct = 100 + pct;        // ran past a vblank
    if (pct > (int)cpu_peak) cpu_peak = pct;
    if (++cpu_frames >= 30) { cpu_val = cpu_peak; cpu_peak = 0; cpu_frames = 0; }
}

// ---------------------------------------------------------------- vblank (main thread, right after VBlankIntrWait)
void vid_upload(void)
{
    static int dpar;
    dpar ^= 1;
    if (dither) { memcpy32(pal_bg_mem, pal_out[dpar], 256); }
    else if (upload) { memcpy32(pal_bg_mem, pal_out[0], 256); }
    upload = 0;
    oam_copy(oam_mem, obj_out, 128);
    fps_cnt++;
    if (g_vbl - vbl_mark >= 60) { fps_val = fps_cnt * 60 / (g_vbl - vbl_mark); if (fps_val > 60) fps_val = 60; fps_cnt = 0; vbl_mark = g_vbl; }
    // mosaic on BG1-3 (text layer BG0 always crisp)
    vu16 *cnt[3] = { &REG_BG1CNT, &REG_BG2CNT, &REG_BG3CNT };
    for (int i = 0; i < 3; i++) { if (mos_bg) *cnt[i] |= BG_MOSAIC; else *cnt[i] &= ~BG_MOSAIC; }
    REG_MOSAIC = mos_bg | (mos_obj << 8);
    // blending: darken for scanlines/interlace; alpha for semi-transparent ghost OBJs
    REG_BLDCNT = (scan_active ? (0x3F | BLD_BLACK) : 0) | (0x2F << 8);
    if (!scan_active) REG_BLDY = 0;
    REG_BLDALPHA = ghost == 2 ? (7 | (9 << 8)) : (5 | (11 << 8));
    // window: preview box (settings) or aspect mask (gameplay)
    int x0 = 0, y0 = 0, x1 = 240, y1 = 160, on = 0;
    if (g_preview) { x0 = g_px0; y0 = g_py0; x1 = g_px1; y1 = g_py1; on = 1; }
    int asp = g_set[S_ASPECT];
    if (asp && (g_preview || g_aspect_on)) {
        int w = x1 - x0, h = y1 - y0;
        if (asp == AS_PILLAR) { int nw = w * 213 / 240; x0 += (w - nw) / 2; x1 = x0 + nw; }
        else if (asp == AS_CINEMA) { int nh = h * 135 / 160; y0 += (h - nh) / 2; y1 = y0 + nh; }
        else if (asp == AS_FRAMED) { x0 += w / 30; x1 -= w / 30; y0 += h / 20; y1 -= h / 20; }
        on = 1;
    }
    if (on) {
        REG_WIN0H = (x0 << 8) | x1; REG_WIN0V = (y0 << 8) | y1;
        if (g_preview) { REG_WININ = 0x3C; REG_WINOUT = 0x03; }
        else { REG_WININ = 0x3D; REG_WINOUT = 0x01 | 0x02 | 0x20; }
        REG_DISPCNT |= DCNT_WIN0 | (g_preview ? 0 : DCNT_BG1);
    } else {
        REG_DISPCNT &= ~(DCNT_WIN0 | (g_aspect_on ? DCNT_BG1 : 0));
    }
}

// vblank ISR part: re-arm HBlank DMA for scanlines
void vid_isr(void)
{
    if (scan_active) {
        const u16 *t = scan_tbl[g_vbl & 1];
        REG_DMA0CNT = 0;
        REG_BLDY = t[0];
        REG_DMA0SAD = (u32)&t[1];
        REG_DMA0DAD = (u32)&REG_BLDY;
        REG_DMA0CNT = 1 | DMA_DST_FIXED | DMA_SRC_INC | DMA_REPEAT | DMA_16 | DMA_AT_HBLANK | DMA_ENABLE;
    } else REG_DMA0CNT = 0;
}
