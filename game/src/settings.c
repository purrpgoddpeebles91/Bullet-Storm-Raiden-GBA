// Bullet Storm Raiden - GAME SETTINGS: option tables, SRAM persistence, menu with live preview
#include "common.h"

u8 g_set[NUM_SET];

typedef struct { const char *name; u8 n, def; const char *const *vals; const char *desc; u8 cls; } OptDef;
enum { C_VID, C_AUD, C_GAME };

static const char *const v_render[] = { "HARDWARE", "SOFT DITHER", "LINE DOUBLE", "INTERLACE" };
static const char *const v_shader[] = { "NONE", "LCD COLOR", "CRT WARM", "GAME BOY", "POCKET", "SEPIA", "VIRTUAL BOY",
                                        "NIGHT VISION", "INVERTED", "HI CONTRAST", "DREAM PASTEL", "NIGHTMARE" };
static const char *const v_scan[] = { "OFF", "LIGHT", "MEDIUM", "HEAVY" };
static const char *const v_scale[] = { "NATIVE 1X", "MOSAIC 2X", "MOSAIC 3X", "MOSAIC 4X" };
static const char *const v_bright[] = { "-3", "-2", "-1", "0", "+1", "+2", "+3" };
static const char *const v_sat[] = { "0% GRAY", "50%", "75%", "100%", "125%", "150%" };
static const char *const v_ghost[] = { "OFF", "LOW", "HIGH" };
static const char *const v_shake[] = { "OFF", "LOW", "FULL" };
static const char *const v_flash[] = { "ON", "SOFT", "OFF" };
static const char *const v_fps[] = { "60 VSYNC", "30 FPS", "ADAPTIVE" };
static const char *const v_aspect[] = { "FULL 3:2", "4:3 PILLAR", "16:9 CINEMA", "FRAMED" };
static const char *const v_bullet[] = { "NORMAL", "HI-VIS RED", "HI-VIS PINK" };
static const char *const v_meter[] = { "OFF", "FPS", "CPU", "FPS + CPU" };
static const char *const a_drv[] = { "DS + PSG", "PSG ONLY", "DS ONLY" };
static const char *const a_rate[] = { "6689 HZ", "10512 HZ", "13379 HZ", "18157 HZ", "21024 HZ", "31536 HZ" };
static const char *const a_crush[] = { "8-BIT", "6-BIT", "4-BIT", "2-BIT" };
static const char *const a_lat[] = { "LOW 1F", "NORMAL 2F", "HIGH 3F" };
static const char *const a_sync[] = { "VSYNC", "TIMER IRQ", "FREE RUN" };
static const char *const a_stereo[] = { "STEREO", "MONO", "SWAP L/R", "WIDE" };
static const char *const a_tone[] = { "BRIGHT", "NORMAL", "WARM", "MUFFLED" };
static const char *const a_vol[] = { "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10" };
static const char *const a_style[] = { "AUTO ROUTE", "ALWAYS DREAM", "NIGHTMARE" };
static const char *const g_auto[] = { "OFF (HOLD)", "TOGGLE", "ALWAYS ON" };
static const char *const g_swap[] = { "A FIRE B BMB", "B FIRE A BMB" };
static const char *const g_hud[] = { "FULL", "MINIMAL" };
static const char *const v_cart[] = { "OFF", "1X", "2X", "3X" };

static const OptDef opts[NUM_SET] = {
    { "RENDER MODE", 4, 0, v_render, "HARDWARE, TEMPORAL DITHER, LINE DOUBLE OR INTERLACE.", C_VID },
    { "SHADER", NUM_SH, 0, v_shader, "REAL-TIME PALETTE SHADER ON EVERY BG AND SPRITE COLOR.", C_VID },
    { "SCANLINES", 4, 0, v_scan, "DARKENS EVERY OTHER LINE VIA HBLANK DMA. NO CPU COST.", C_VID },
    { "RESOLUTION", 4, 0, v_scale, "HARDWARE MOSAIC LOWERS PIXEL RESOLUTION. HUD STAYS SHARP.", C_VID },
    { "BRIGHTNESS", 7, 3, v_bright, "GAMMA CURVE ON ALL PALETTES. 0 IS THE ORIGINAL LOOK.", C_VID },
    { "SATURATION", 6, 3, v_sat, "COLOR SATURATION. 0% IS GRAYSCALE, 100% IS ORIGINAL.", C_VID },
    { "FRAME BLEND", 3, 0, v_ghost, "LCD GHOSTING: ALPHA-BLENDED TRAILS BEHIND MOVING SPRITES.", C_VID },
    { "SCREEN SHAKE", 3, 1, v_shake, "SHAKES THE PLAYFIELD ON BOMBS, HITS AND BIG EXPLOSIONS.", C_VID },
    { "SCREEN FLASH", 3, 0, v_flash, "WHITE FLASH ON BOMBS AND BOSS KILLS. SOFT/OFF FOR COMFORT.", C_VID },
    { "FRAME RATE", 3, 0, v_fps, "60 EVERY FRAME, 30 HALF RATE, ADAPTIVE SKIPS IF BUSY.", C_VID },
    { "ASPECT", 4, 0, v_aspect, "MASKS THE PLAYFIELD EDGES IN GAMEPLAY. HUD STAYS VISIBLE.", C_VID },
    { "BULLETS", 3, 0, v_bullet, "RECOLORS ENEMY BULLETS (SHADER-PROOF) SO THEY POP.", C_VID },
    { "PERF METER", 4, 0, v_meter, "SHOWS FRAMES PER SECOND AND/OR CPU LOAD IN THE CORNER.", C_VID },
    { "AUDIO DRIVER", 3, 0, a_drv, "DS+PSG: CHIP MUSIC + SAMPLED SFX. DS ONLY: SOFTWARE SYNTH.", C_AUD },
    { "SAMPLE RATE", 6, 2, a_rate, "DS MIXER RATE (SFX; MUSIC TOO IN DS ONLY). HIGH = CLEANER.", C_AUD },
    { "BIT DEPTH", 4, 0, a_crush, "BIT-CRUSHES DIRECTSOUND (SFX; MUSIC TOO IN DS ONLY).", C_AUD },
    { "LATENCY", 3, 1, a_lat, "MIX-AHEAD BUFFER: 1, 2 OR 3 FRAMES (17 / 33 / 50 MS).", C_AUD },
    { "AUDIO SYNC", 3, 0, a_sync, "WHAT SWAPS MIX BUFFERS: VBLANK IRQ, TIMER1 IRQ, FREE RING.", C_AUD },
    { "STEREO", 4, 0, a_stereo, "PANS MUSIC VOICES + SFX. WIDE ADDS A SIDE-CHANNEL BOOST.", C_AUD },
    { "TONE", 4, 1, a_tone, "MIXER FILTER BRIGHT..MUFFLED (MUSIC TOO IN DS ONLY).", C_AUD },
    { "MUSIC VOLUME", 11, 10, a_vol, "MUSIC LEVEL, 0 TO 10.", C_AUD },
    { "SFX VOLUME", 11, 10, a_vol, "SOUND EFFECT LEVEL, 0 TO 10.", C_AUD },
    { "MUSIC STYLE", 3, 0, a_style, "AUTO FOLLOWS YOUR ROUTE, OR LOCK DREAM / NIGHTMARE.", C_AUD },
    { "AUTO-FIRE", 3, 0, g_auto, "OFF: HOLD TO FIRE. TOGGLE: TAP ON/OFF. ALWAYS: NONSTOP.", C_GAME },
    { "BUTTONS", 2, 0, g_swap, "SWAP THE FIRE AND BOMB BUTTONS IN STAGES.", C_GAME },
    { "HUD LAYOUT", 2, 0, g_hud, "FULL TWO-LINE HUD OR A MINIMAL ONE-LINE HUD.", C_GAME },
    { "CARTOON", 4, 3, v_cart, "BAKED INK OUTLINES + CEL BANDING. 1X THIN, 3X BOLD.", C_VID },
};

// ---------------------------------------------------------------- persistence (SRAM 0x100, separate from v0.1 save)
#define SRAM ((volatile u8 *)0x0E000000)
#define SET_OFS 0x100
#define V02_NUM_SET 26          // v0.2 stored 26 settings; v0.3 appends new ones (versioned by the count byte)
static u8 set_ck(int n)
{
    u8 c = 0xA5;
    for (int i = 0; i < n; i++) c = (u8)((c << 1 | c >> 7) ^ g_set[i]);
    return c;
}
static void settings_defaults(int cls)
{
    for (int i = 0; i < NUM_SET; i++) if (cls < 0 || opts[i].cls == cls) g_set[i] = opts[i].def;
}
void settings_save(void)
{
    SRAM[SET_OFS] = 'B'; SRAM[SET_OFS + 1] = 'S'; SRAM[SET_OFS + 2] = 'R'; SRAM[SET_OFS + 3] = 'S';
    SRAM[SET_OFS + 4] = NUM_SET;
    for (int i = 0; i < NUM_SET; i++) SRAM[SET_OFS + 5 + i] = g_set[i];
    SRAM[SET_OFS + 5 + NUM_SET] = set_ck(NUM_SET);
}
void settings_load(void)
{
    settings_defaults(-1);
    int n = SRAM[SET_OFS + 4];
    if (SRAM[SET_OFS] != 'B' || SRAM[SET_OFS + 1] != 'S' || SRAM[SET_OFS + 2] != 'R' || SRAM[SET_OFS + 3] != 'S' ||
        n < V02_NUM_SET || n > NUM_SET) {
        settings_save(); return;
    }
    for (int i = 0; i < n; i++) g_set[i] = SRAM[SET_OFS + 5 + i];
    if (SRAM[SET_OFS + 5 + n] != set_ck(n)) { settings_defaults(-1); settings_save(); return; }
    for (int i = 0; i < NUM_SET; i++) if (g_set[i] >= opts[i].n) g_set[i] = opts[i].def;
    if (n < NUM_SET) settings_save();   // older block (v0.2): keep its values, new fields take their defaults
}
static void apply_all(void) { vid_settings(); snd_settings(); music_restyle(); }

int fire_key(void) { return g_set[S_SWAP] ? KEY_B : KEY_A; }
int bomb_key(void) { return g_set[S_SWAP] ? KEY_A : KEY_B; }

// ---------------------------------------------------------------- menu
enum { E_RESET_PAGE = -1, E_BACK = -2, E_VIDEO = -3, E_AUDIO = -4, E_GAME = -5, E_RESET_ALL = -6, E_HOST = -7 };
static const s8 page_main[] = { E_VIDEO, E_AUDIO, E_GAME, E_RESET_ALL, E_BACK };
static const s8 page_vid[] = { S_RENDER, S_SHADER, S_SCAN, S_SCALE, S_BRIGHT, S_SAT, S_GHOST, S_SHAKE, S_FLASH, S_FPS, S_ASPECT, S_BULLET, S_METER, S_CARTOON, E_HOST, E_RESET_PAGE, E_BACK };   // v0.3 entries appended so v0.2 menu paths stay valid
static const s8 page_aud[] = { S_ADRV, S_ARATE, S_CRUSH, S_LAT, S_ASYNC, S_STEREO, S_TONE, S_MVOL, S_SVOL, S_MSTYLE, E_RESET_PAGE, E_BACK };
static const s8 page_game[] = { S_AUTOFIRE, S_SWAP, S_HUD, E_RESET_PAGE, E_BACK };
static const s8 *const pages[4] = { page_main, page_vid, page_aud, page_game };
static const u8 page_len[4] = { sizeof(page_main), sizeof(page_vid), sizeof(page_aud), sizeof(page_game) };
static const u8 page_cls[4] = { 255, C_VID, C_AUD, C_GAME };
static int page, cur, top, confirm, stmr;
#define LIST_Y 12
#define LIST_N 6

static const char *entry_name(int e)
{
    switch (e) {
    case E_RESET_PAGE: return "RESET PAGE";
    case E_BACK: return page ? "BACK" : "BACK TO TITLE";
    case E_VIDEO: return "VIDEO";
    case E_AUDIO: return "AUDIO";
    case E_GAME: return "GAMEPLAY";
    case E_RESET_ALL: return "RESET ALL";
    case E_HOST: return "HOST VIDEO";
    }
    return opts[e].name;
}
static const char *entry_desc(int e)
{
    if (confirm) return "PRESS A AGAIN TO CONFIRM THE RESET. ANY OTHER KEY CANCELS.";
    switch (e) {
    case E_RESET_PAGE: return "RESTORE THIS PAGE TO ITS DEFAULTS (PRESS A TWICE).";
    case E_BACK: return "SETTINGS APPLY INSTANTLY AND SAVE TO THE CARTRIDGE.";
    case E_VIDEO: return "CARTOON INK, SHADERS, SCANLINES, MOSAIC, BLEND, ASPECT.";
    case E_HOST: return "HOST VIDEO: SET IN EMULATOR / WEB PLAYER. NOT IN THE ROM.";
    case E_AUDIO: return "AUDIO DRIVER, SAMPLE RATE, BIT DEPTH, LATENCY, STEREO, TONE.";
    case E_GAME: return "AUTO-FIRE, BUTTON LAYOUT AND HUD LAYOUT.";
    case E_RESET_ALL: return "RESTORE EVERY SETTING TO DEFAULTS (PRESS A TWICE).";
    }
    return opts[e].desc;
}
static const char *entry_value(int e)
{
    if (e == E_HOST) return "EMULATOR";
    if (e >= 0) return opts[e].vals[g_set[e]];
    return "";
}

static void draw_tabs(void)
{
    static const char *tn[4] = { "MAIN", "VIDEO", "AUDIO", "GAMEPLAY" };
    static const u8 tx[4] = { 2, 7, 13, 19 };
    txt_fill(0, 0, 30, 1, FONT_O);
    txt_printo(0, 0, "L", P_GREY); txt_printo(29, 0, "R", P_GREY);
    for (int i = 0; i < 4; i++) txt_printo(tx[i], 0, tn[i], i == page ? P_YELLOW : P_GREY);
}

static void draw_list(void)
{
    const s8 *p = pages[page]; int n = page_len[page];
    if (cur < top) top = cur;
    if (cur >= top + LIST_N) top = cur - LIST_N + 1;
    txt_fill(0, LIST_Y, 30, LIST_N, FONT_O);
    for (int r = 0; r < LIST_N && top + r < n; r++) {
        int i = top + r, e = p[i], y = LIST_Y + r, s = i == cur;
        txt_printo(0, y, s ? ">" : " ", P_YELLOW);
        txt_printo(1, y, entry_name(e), s ? P_YELLOW : (e < 0 ? P_CYAN : P_WHITE));
        const char *v = entry_value(e);
        if (*v) {
            int len = strlen(v), x = 16 + (13 - len) / 2;
            if (e >= 0) { txt_printo(15, y, "<", s ? P_YELLOW : P_GREY); txt_printo(29, y, ">", s ? P_YELLOW : P_GREY); }
            txt_printo(x, y, v, e < 0 ? P_GREY : s ? P_HI : P_GREEN);
        }
    }
    // scroll hints
    txt_printo(14, LIST_Y, top > 0 ? "^" : " ", P_GREY);
    txt_printo(14, LIST_Y + LIST_N - 1, top + LIST_N < n ? "v" : " ", P_GREY);
    txt_fill(0, 18, 30, 2, (UI_BASE + UI_FILL) | (P_UI << 12));
    txt_wrap(0, 18, 30, entry_desc(p[cur]), P_WHITE, -1);
}

static void draw_side(void)
{
    txt_fill(0, 1, 7, 11, FONT_O); txt_fill(23, 1, 7, 11, FONT_O);
    if (page == 2) {
        txt_printo(1, 2, "L", P_GREY); txt_printo(5, 2, "R", P_GREY);
        txt_printo(23, 2, "MIX", P_GREY);
        { char hz[8]; int v = snd_rate_hz[g_set[S_ARATE]], k = 0; char t[6]; int m = 0;
          while (v) { t[m++] = '0' + v % 10; v /= 10; }
          while (m) hz[k++] = t[--m];
          hz[k++] = 'H'; hz[k++] = 'Z'; hz[k] = 0;
          txt_printo(23, 3, hz, P_CYAN); }
        txt_printo(23, 5, "DRIVER", P_GREY);
        txt_printo(23, 6, g_set[S_ADRV] == DRV_HYBRID ? "DS+PSG" : g_set[S_ADRV] == DRV_PSG ? "PSG" : "DS", P_CYAN);
        txt_printo(23, 8, "DS PATH", P_GREY);
        txt_printo(23, 9, g_set[S_ADRV] == DRV_DS ? "ALL" : g_set[S_ADRV] == DRV_PSG ? "OFF" : "SFX", P_CYAN);
    } else {
        txt_printo(1, 3, "LIVE", P_YELLOW);
        txt_printo(0, 4, "PREVIEW", P_GREY);
        txt_printo(24, 3, "VIDEO", P_GREY);
        txt_printo(23, 4, "RENDER", P_GREY);
    }
}

static void draw_all(void) { draw_tabs(); draw_list(); draw_side(); }

static void go_page(int p)
{
    int from = page;
    page = p; cur = 0; top = 0; confirm = 0;
    if (p == 0 && from >= 1 && from <= 3) cur = from - 1;   // back on the entry we came from
    draw_all();
}

// ---------------------------------------------------------------- live preview scene
typedef struct { s16 x, y, vx, vy; u8 alive, kind, t; } PvObj;
static PvObj pv_en[3], pv_sh[6], pv_eb[8], pv_fx[3];
static int pv_t, pv_kills, pv_flash;
#define PX0 64
#define PY0 16
#define PX1 176
#define PY1 88

static void pv_update(int audio)
{
    pv_t++;
    g_far_x += 0x40; g_near_x += 0x100;
    int jx = PX0 + 10, jy = (PY0 + PY1) / 2 - 8 + (lu_sin(pv_t * 300) >> 10);
    // player shots
    if ((pv_t & 7) == 0) for (int i = 0; i < 6; i++) if (!pv_sh[i].alive) {
        pv_sh[i] = (PvObj){ (s16)(jx + 12), (s16)(jy + 4), 4, 0, 1, 0, 0 };
        if (audio && (pv_t & 15) == 0) sfx(SFX_SHOT);
        break;
    }
    // enemies
    if (pv_t % 45 == 0) for (int i = 0; i < 3; i++) if (!pv_en[i].alive) {
        int by = PY0 + 10 + frnd(PY1 - PY0 - 36);
        pv_en[i] = (PvObj){ PX1 + 4, (s16)by, -1, (s16)by, 1, (u8)(pv_t / 45 & 1), 0 };
        break;
    }
    for (int i = 0; i < 3; i++) if (pv_en[i].alive) {
        PvObj *e = &pv_en[i];
        e->t++; e->x += e->vx;
        e->y = e->vy + (lu_sin(e->t * 600) >> 9);
        if (e->x < PX0 - 20) e->alive = 0;
        if (e->t % 50 == 25) for (int k = 0; k < 8; k++) if (!pv_eb[k].alive) {
            int dx = jx - e->x, dy = jy - e->y;
            int d = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy); if (d < 1) d = 1;
            pv_eb[k] = (PvObj){ (s16)(e->x * 16 + 64), (s16)(e->y * 16 + 64), (s16)(dx * 24 / d), (s16)(dy * 24 / d), 1, 0, 0 };
            break;
        }
    }
    for (int k = 0; k < 8; k++) if (pv_eb[k].alive) {
        PvObj *b = &pv_eb[k];
        b->x += b->vx; b->y += b->vy;
        if (b->x < PX0 * 16 - 64 || b->y < PY0 * 16 - 64 || b->y > PY1 * 16) b->alive = 0;
    }
    for (int i = 0; i < 6; i++) if (pv_sh[i].alive) {
        PvObj *s = &pv_sh[i];
        s->x += s->vx;
        if (s->x > PX1 + 8) { s->alive = 0; continue; }
        for (int k = 0; k < 3; k++) if (pv_en[k].alive && s->x > pv_en[k].x - 2 && s->x < pv_en[k].x + 14 && s->y > pv_en[k].y - 4 && s->y < pv_en[k].y + 14) {
            s->alive = 0; pv_en[k].alive = 0; pv_kills++;
            for (int f = 0; f < 3; f++) if (!pv_fx[f].alive) { pv_fx[f] = (PvObj){ pv_en[k].x, pv_en[k].y, 0, 0, 1, 0, 0 }; break; }
            vid_shake(8);
            if (pv_kills % 3 == 0) { pv_flash = 8; if (audio) sfx(SFX_BIGEXPLODE); }
            else if (audio) sfx(SFX_EXPLODE);
            break;
        }
    }
    for (int f = 0; f < 3; f++) if (pv_fx[f].alive && ++pv_fx[f].t >= 20) pv_fx[f].alive = 0;
    if (audio && pv_t % 240 == 120) sfx(SFX_POWERUP);
    if (pv_flash) { pv_flash--; vid_flash(pv_flash & 2, themes[TH_TWILIGHT].pal[0]); }
    // draw
    oam_begin();
    for (int k = 0; k < 8; k++) if (pv_eb[k].alive) spr(pv_eb[k].x / 16 - 4, pv_eb[k].y / 16 - 4, SPR_EB_PELLET, 8, 15, 0);
    spr(jx, jy, SPR_SHIP_JET + ((pv_t >> 2) & 1) * 4, 16, 0, 0);
    for (int i = 0; i < 6; i++) if (pv_sh[i].alive) spr(pv_sh[i].x, pv_sh[i].y, SPR_SHOT_DASH, 8, 0, 0);
    for (int i = 0; i < 3; i++) if (pv_en[i].alive) spr(pv_en[i].x, pv_en[i].y, (pv_en[i].kind ? SPR_EN_FIGHTER : SPR_EN_RING) + ((pv_en[i].t >> 3) & 1) * 4, 16, 2, 0);
    for (int f = 0; f < 3; f++) if (pv_fx[f].alive) spr(pv_fx[f].x, pv_fx[f].y, SPR_EXPLODE + (pv_fx[f].t / 5) * 4, 16, 1, 0);
    oam_end();
}

static void vu_draw(void)
{
    for (int c = 0; c < 2; c++) {
        int lvl = g_vu[c] * 9 / 80; if (lvl > 8) lvl = 8;
        if (g_set[S_ADRV] == DRV_PSG) lvl = 0;
        for (int r = 0; r < 8; r++) {
            int on = (7 - r) < lvl;
            int pal = r < 2 ? P_RED : r < 4 ? P_YELLOW : P_GREEN;
            txt_put(c ? 5 : 1, 3 + r, on ? (322 | (pal << 12)) : ((FONT_O + ('.' - 32)) | (P_GREY << 12)));
        }
    }
}

void settings_enter(void)
{
    REG_DISPCNT = DCNT_MODE0 | DCNT_BG0 | DCNT_BG1 | DCNT_BG2 | DCNT_BG3 | DCNT_OBJ | DCNT_OBJ_1D;
    REG_BG0CNT = BG_CBB(0) | BG_SBB(31) | BG_PRIO(0) | BG_4BPP | BG_REG_32x32;
    REG_BG1CNT = BG_CBB(0) | BG_SBB(27) | BG_PRIO(3) | BG_4BPP | BG_REG_32x32;
    REG_BG2CNT = BG_CBB(2) | BG_SBB(28) | BG_PRIO(2) | BG_4BPP | BG_REG_64x32;
    REG_BG3CNT = BG_CBB(2) | BG_SBB(26) | BG_PRIO(3) | BG_4BPP | BG_REG_32x32;
    load_theme(TH_TWILIGHT);
    vid_bg1_fill(320);
    txt_clear();
    g_pal_skip = 0x3CFF;          // menu text banks stay unshaded; preview (banks 8/9, sprites, backdrop) is shaded
    pal_mark_all();
    g_preview = 1; g_px0 = PX0; g_py0 = PY0; g_px1 = PX1; g_py1 = PY1;
    memset(pv_en, 0, sizeof(pv_en)); memset(pv_sh, 0, sizeof(pv_sh)); memset(pv_eb, 0, sizeof(pv_eb)); memset(pv_fx, 0, sizeof(pv_fx));
    pv_t = 0; pv_kills = 0; pv_flash = 0;
    txt_box(7, 1, 16, 11);
    page = 0;
    go_page(0);
    if (music_current() < 0) music_play(MUS_W1);
}

static void leave(void)
{
    g_preview = 0; g_pal_skip = 0; pal_mark_all();
    vid_flash(0, themes[TH_TWILIGHT].pal[0]);
    set_state(ST_TITLE);
}

static void change(int e, int d)
{
    const OptDef *o = &opts[e];
    g_set[e] = (u8)((g_set[e] + o->n + d) % o->n);
    sfx(SFX_MENU);
    settings_save();
    if (o->cls == C_VID) vid_settings();
    else if (o->cls == C_AUD) { snd_settings(); if (e == S_MSTYLE) music_restyle(); }
    draw_list(); draw_side();
}

void settings_update(void)
{
    stmr++;
    const s8 *p = pages[page]; int n = page_len[page];
    int e = p[cur];
    if (confirm && (key_hit(KEY_ANY & ~KEY_A))) { confirm = 0; draw_list(); }
    if (key_hit(KEY_UP)) { cur = (cur + n - 1) % n; confirm = 0; sfx(SFX_MENU); draw_list(); }
    else if (key_hit(KEY_DOWN)) { cur = (cur + 1) % n; confirm = 0; sfx(SFX_MENU); draw_list(); }
    else if (key_hit(KEY_L)) { go_page((page + 3) % 4); sfx(SFX_MENU); }
    else if (key_hit(KEY_R)) { go_page((page + 1) % 4); sfx(SFX_MENU); }
    else if (e >= 0 && key_hit(KEY_LEFT)) change(e, -1);
    else if (e >= 0 && (key_hit(KEY_RIGHT) || key_hit(KEY_A))) change(e, 1);
    else if (key_hit(KEY_A)) {
        switch (e) {
        case E_VIDEO: sfx(SFX_SELECT); go_page(1); break;
        case E_AUDIO: sfx(SFX_SELECT); go_page(2); break;
        case E_GAME: sfx(SFX_SELECT); go_page(3); break;
        case E_BACK: sfx(SFX_SELECT); if (page) go_page(0); else leave(); break;
        case E_RESET_PAGE: case E_RESET_ALL:
            if (!confirm) { confirm = 1; sfx(SFX_MENU); draw_list(); }
            else {
                confirm = 0; settings_defaults(e == E_RESET_ALL ? -1 : page_cls[page]);
                settings_save(); apply_all(); sfx(SFX_SELECT); draw_all();
                txt_fill(0, 18, 30, 2, (UI_BASE + UI_FILL) | (P_UI << 12));
                txt_wrap(0, 18, 30, "DEFAULTS RESTORED AND SAVED.", P_GREEN, -1);
            }
            break;
        }
    }
    else if (key_hit(KEY_B)) { sfx(SFX_MENU); if (page) go_page(0); else leave(); }
    pv_update(page == 2);
    if (page == 2) vu_draw();
}
