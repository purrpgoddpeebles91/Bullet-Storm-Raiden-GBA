// Text layer (BG0), backgrounds and video setup
#include "common.h"

extern const unsigned int sys8Glyphs[192];
#define MAP0 (se_mem[31])
s32 g_far_x, g_near_x;
int g_cur_theme = -1;

void txt_init(void)
{
    // build font: 96 glyphs, transparent + opaque variants, with drop shadow
    const u8 *g = (const u8 *)sys8Glyphs;
    for (int c = 0; c < 96; c++) {
        u8 px[8][8];
        for (int y = 0; y < 8; y++)
            for (int x = 0; x < 8; x++)
                px[y][x] = (g[c * 8 + y] >> x) & 1;
        for (int v = 0; v < 2; v++) {
            u32 *t = (u32 *)&tile_mem[0][(v ? FONT_O : FONT_T) + c];
            for (int y = 0; y < 8; y++) {
                u32 row = 0;
                for (int x = 0; x < 8; x++) {
                    u32 ci = v ? 3 : 0;
                    if (px[y][x]) ci = 1;
                    else if (x > 0 && y > 0 && px[y - 1][x - 1]) ci = 2;
                    row |= ci << (x * 4);
                }
                t[y] = row;
            }
        }
    }
    memcpy32(&tile_mem[0][UI_BASE], ui_tiles, UI_COUNT * 8);
}

void txt_clear(void) { memset32(MAP0, 0, 32 * 32 / 2); }
void txt_clear_rows(int y0, int y1)
{
    for (int y = y0; y <= y1; y++) memset32(&MAP0[y * 32], 0, 16);
}
void txt_put(int x, int y, u16 se)
{
    if ((unsigned)x < 32 && (unsigned)y < 32) MAP0[y * 32 + x] = se;
}
static void prn(int x, int y, const char *s, int pal, int base)
{
    for (; *s; s++, x++) {
        if (*s == '\n') { y++; continue; }
        int c = (u8)*s - 32;
        if (c < 0 || c >= 96) c = 0;
        txt_put(x, y, (base + c) | (pal << 12));
    }
}
void txt_print(int x, int y, const char *s, int pal) { prn(x, y, s, pal, FONT_T); }
void txt_printo(int x, int y, const char *s, int pal) { prn(x, y, s, pal, FONT_O); }
void txt_center(int y, const char *s, int pal) { txt_print((30 - (int)strlen(s)) / 2, y, s, pal); }
void txt_num(int x, int y, u32 n, int digits, int pal, int opaque)
{
    char b[12];
    for (int i = digits - 1; i >= 0; i--) { b[i] = '0' + n % 10; n /= 10; }
    b[digits] = 0;
    prn(x, y, b, pal, opaque ? FONT_O : FONT_T);
}
void txt_fill(int x, int y, int w, int h, u16 se)
{
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++) txt_put(x + i, y + j, se);
}
void txt_box(int x, int y, int w, int h)
{
    u16 p = P_UI << 12;
    txt_fill(x + 1, y + 1, w - 2, h - 2, (UI_BASE + UI_FILL) | p);
    for (int i = 1; i < w - 1; i++) { txt_put(x + i, y, (UI_BASE + UI_T) | p); txt_put(x + i, y + h - 1, (UI_BASE + UI_B) | p); }
    for (int j = 1; j < h - 1; j++) { txt_put(x, y + j, (UI_BASE + UI_L) | p); txt_put(x + w - 1, y + j, (UI_BASE + UI_R) | p); }
    txt_put(x, y, (UI_BASE + UI_TL) | p); txt_put(x + w - 1, y, (UI_BASE + UI_TR) | p);
    txt_put(x, y + h - 1, (UI_BASE + UI_BL) | p); txt_put(x + w - 1, y + h - 1, (UI_BASE + UI_BR) | p);
}
// word-wrapped opaque text, returns rows used. maxchars limits typewriter output
int txt_wrap(int x, int y, int w, const char *s, int pal, int maxchars)
{
    int cx = 0, cy = 0, n = 0;
    while (*s) {
        const char *e = s; int len = 0;
        while (*e && *e != ' ' && *e != '\n') { e++; len++; }
        if (cx + len > w) { cx = 0; cy++; }
        for (int i = 0; i < len; i++) {
            if (maxchars >= 0 && n >= maxchars) return cy + 1;
            int c = (u8)s[i] - 32;
            txt_put(x + cx, y + cy, (FONT_O + c) | (pal << 12));
            cx++; n++;
        }
        s = e;
        if (*s == ' ') { if (cx < w) cx++; s++; n++; }
        else if (*s == '\n') { cx = 0; cy++; s++; n++; }
    }
    return cy + 1;
}

// ---------------------------------------------------------------- video
void load_theme(int th)
{
    g_cur_theme = th;
    const ThemeGfx *t = &themes_cartoon[g_set[S_CARTOON] & 3][th];   // CARTOON: foreground with baked ink outlines
    memcpy32(&tile_mem[2][0], t->tiles, t->ntiles * 8);
    memcpy32(&se_mem[28][0], t->near, 2048 / 2);
    memcpy32(&se_mem[26][0], t->far, 1024 / 2);
    pal_bg_set(0, t->pal[0]);
    for (int i = 1; i < 16; i++) { pal_bg_set(8 * 16 + i, t->pal[i]); pal_bg_set(9 * 16 + i, t->pal[16 + i]); }
}

void video_menu_mode(int with_logo)
{
    REG_DISPCNT = DCNT_MODE0 | DCNT_BG0 | DCNT_BG3 | DCNT_OBJ | DCNT_OBJ_1D | (with_logo ? DCNT_BG1 : 0);
    REG_BG0CNT = BG_CBB(0) | BG_SBB(31) | BG_PRIO(0) | BG_4BPP | BG_REG_32x32;
    REG_BG1CNT = BG_CBB(1) | BG_SBB(30) | BG_PRIO(1) | BG_4BPP | BG_REG_32x32;
    REG_BG3CNT = BG_CBB(2) | BG_SBB(26) | BG_PRIO(3) | BG_4BPP | BG_REG_32x32;
    REG_BG0HOFS = 0; REG_BG0VOFS = 0;
    g_aspect_on = 0;
    if (with_logo) {
        memcpy32(&tile_mem[1][0], logo_tiles, LOGO_TILES * 8);
        memset32(&se_mem[30][0], 0, 512);
        for (int y = 0; y < LOGO_H; y++)
            for (int x = 0; x < LOGO_W; x++) se_mem[30][y * 32 + x] = logo_map[y * LOGO_W + x];
    }
    load_theme(TH_TWILIGHT);
    txt_clear();
}

void video_game_mode(void)
{
    REG_DISPCNT = DCNT_MODE0 | DCNT_BG0 | DCNT_BG2 | DCNT_BG3 | DCNT_OBJ | DCNT_OBJ_1D;
    REG_BG0CNT = BG_CBB(0) | BG_SBB(31) | BG_PRIO(0) | BG_4BPP | BG_REG_32x32;
    REG_BG2CNT = BG_CBB(2) | BG_SBB(28) | BG_PRIO(2) | BG_4BPP | BG_REG_64x32;
    REG_BG3CNT = BG_CBB(2) | BG_SBB(26) | BG_PRIO(3) | BG_4BPP | BG_REG_32x32;
    REG_BG1CNT = BG_CBB(0) | BG_SBB(27) | BG_PRIO(3) | BG_4BPP | BG_REG_32x32;   // black letterbox (aspect setting)
    vid_bg1_fill(321);
    g_aspect_on = 1;
    txt_clear();
}

void bg_scroll(void)
{
    REG_BG3HOFS = (g_far_x >> 8) - g_shx;
    REG_BG2HOFS = (g_near_x >> 8) - g_shx;
    REG_BG3VOFS = -g_shy; REG_BG2VOFS = -g_shy;
    REG_BG1HOFS = 0; REG_BG1VOFS = 0;
}
