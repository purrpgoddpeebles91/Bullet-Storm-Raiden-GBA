// Bullet Storm Raiden - entry point, state machine, sprite helpers, rng
#include "common.h"

OBJ_ATTR obj_buffer[128];
int g_oam;
int g_state = -1, g_next_state = ST_TITLE;
u32 g_frame;
int g_debug;
int g_autopilot;
int g_story_dbg;
Stats g_stats;

// ---------------------------------------------------------------- rng
static u32 s_rng = 0x1234567, s_frng = 0x9E3779B9;
static u32 xs(u32 *s) { u32 x = *s; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return *s = x; }
u32 rng(void) { return xs(&s_rng); }
u32 frng(void) { return xs(&s_frng); }
void rng_seed(u32 s) { s_rng = s ? s : 0xBADC0DE; }
int rnd(int n) { return n > 0 ? (int)((rng() >> 8) % (u32)n) : 0; }
int frnd(int n) { return n > 0 ? (int)((frng() >> 8) % (u32)n) : 0; }

// integer atan2, returns 0..0xFFFF (full circle), screen coordinates (y down)
u16 iatan2(int dy, int dx)
{
    if (dx == 0 && dy == 0) return 0;
    int ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
    int mn = ax < ay ? ax : ay, mx = ax < ay ? ay : ax;
    // t in .12
    int t = (mn << 12) / mx;
    // atan(t) ~ 8192*t + 2847*t*(1-t)  (in 1/65536 turns)
    int a = (8192 * t + ((2847 * t >> 12) * (4096 - t))) >> 12;
    if (ay > ax) a = 16384 - a;
    if (dx < 0) a = 32768 - a;
    if (dy < 0) a = 65536 - a;
    return (u16)a;
}

// ---------------------------------------------------------------- sprites
void oam_begin(void) { g_oam = 0; }
void oam_end(void)
{
    for (int i = g_oam; i < 128; i++) obj_buffer[i].attr0 = ATTR0_HIDE;
}
void spr(int x, int y, int tile, int size, int pal, int flags)
{
    if (g_oam >= 128) return;
    if (x <= -size || x >= 240 || y <= -size || y >= 160) return;
    u16 sz = size == 8 ? ATTR1_SIZE_8 : size == 16 ? ATTR1_SIZE_16 : size == 32 ? ATTR1_SIZE_32 : ATTR1_SIZE_64;
    OBJ_ATTR *o = &obj_buffer[g_oam++];
    o->attr0 = ATTR0_SQUARE | ATTR0_4BPP | ATTR0_Y(y & 255);
    o->attr1 = sz | ATTR1_X(x & 511) | ((flags & SPR_HFLIP) ? ATTR1_HFLIP : 0);
    o->attr2 = ATTR2_ID(tile) | ATTR2_PALBANK(pal) | ATTR2_PRIO((flags & SPR_PRIO0) ? 0 : 1);
}

static void vbl_isr(void) { g_vbl++; snd_isr(); vid_isr(); }

// ---------------------------------------------------------------- state machine
void set_state(int s) { g_next_state = s; }

static void enter_state(int s)
{
    g_state = s;
    oam_begin(); oam_end();
    switch (s) {
    case ST_TITLE: title_enter(); break;
    case ST_DIFF: diff_enter(); break;
    case ST_SHIP: ship_enter(); break;
    case ST_SLOT: slot_enter(); break;
    case ST_DIALOG: dialog_enter(); break;
    case ST_PLAY: game_start_sublevel(); break;
    case ST_FORK: fork_enter(); break;
    case ST_NODE: node_enter(); break;
    case ST_GAMEOVER: gameover_enter(); break;
    case ST_CLEAR: clear_enter(); break;
    case ST_WORKSHOP: workshop_enter(); break;
    case ST_SETTINGS: settings_enter(); break;
    case ST_MEMORIES: memories_enter(); break;
    }
}

int main(void)
{
    REG_WAITCNT = 0x4317;
    irq_init(NULL);
    REG_DISPCNT = DCNT_BLANK;
    txt_init();
    save_load();
    mem_load();
    settings_load();
    vid_init();
    irq_add(II_VBLANK, vbl_isr);
    snd_init();
    oam_init(obj_buffer, 128);

    int skipped = 0;
    while (1) {
        u32 fv = g_vbl;
        if (g_next_state != g_state) enter_state(g_next_state);
        key_poll();
        switch (g_state) {
        case ST_TITLE: title_update(); break;
        case ST_DIFF: diff_update(); break;
        case ST_SHIP: ship_update(); break;
        case ST_SLOT: slot_update(); break;
        case ST_DIALOG: dialog_update(); break;
        case ST_PLAY: game_update(); break;
        case ST_FORK: fork_update(); break;
        case ST_NODE: node_update(); break;
        case ST_GAMEOVER: gameover_update(); break;
        case ST_CLEAR: clear_update(); break;
        case ST_WORKSHOP: workshop_update(); break;
        case ST_SETTINGS: settings_update(); break;
        case ST_MEMORIES: memories_update(); break;
        }
        int fr = g_set[S_FPS];
        g_render_this = fr == FR_30 ? !(g_frame & 1) : 1;
        if (fr == FR_ADAPT && g_vbl != fv && !skipped) {
            // adaptive frame skip: logic overran a frame, so drop this render and catch up
            g_render_this = 0;
            vid_measure(fv);
            skipped = 1; snd_update(); g_frame++;
            continue;
        }
        skipped = 0;
        vid_prepare();
        vid_measure(fv);
        VBlankIntrWait();
        if (g_render_this) { vid_upload(); bg_scroll(); }
        snd_update();
        g_frame++;
    }
}
