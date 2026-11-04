// Bullet Storm Raiden - shared declarations
#pragma once
#include <tonc.h>
#include <string.h>
#include "assets.h"
#include "music_data.h"

#define FX(v) ((s32)(v) << 8)
#define UNFX(v) ((v) >> 8)
#define SCREEN_W 240
#define PLAY_TOP 16
#define PLAY_BOT 152

// ---------------------------------------------------------------- states
enum {
    ST_TITLE, ST_DIFF, ST_SHIP, ST_SLOT, ST_DIALOG, ST_PLAY, ST_FORK, ST_NODE,
    ST_GAMEOVER, ST_CLEAR, ST_WORKSHOP, ST_SETTINGS
};
extern int g_state, g_next_state;
extern u32 g_frame;
extern int g_debug;
void set_state(int s);

// ---------------------------------------------------------------- text / bg (text.c)
#define FONT_T 0      // transparent font tiles 0..95
#define FONT_O 96     // opaque font tiles 96..191
#define UI_BASE 192
#define TXT_W 30
enum { P_WHITE = 0, P_YELLOW = 1, P_HI = 2, P_GREY = 3, P_CYAN = 4, P_RED = 5, P_PINK = 6, P_UI = 10, P_GREEN = 11, P_PURPLE = 12 };
void txt_init(void);
void txt_clear(void);
void txt_clear_rows(int y0, int y1);
void txt_print(int x, int y, const char *s, int pal);
void txt_printo(int x, int y, const char *s, int pal);
void txt_center(int y, const char *s, int pal);
void txt_num(int x, int y, u32 n, int digits, int pal, int opaque);
void txt_box(int x, int y, int w, int h);
void txt_fill(int x, int y, int w, int h, u16 se);
void txt_put(int x, int y, u16 se);
int  txt_wrap(int x, int y, int w, const char *s, int pal, int maxchars);

void video_menu_mode(int with_logo);
void video_game_mode(void);
void load_theme(int th);
void bg_scroll(void);
extern s32 g_far_x, g_near_x;

// ---------------------------------------------------------------- sprites (main.c)
extern OBJ_ATTR obj_buffer[128];
extern int g_oam;
void oam_begin(void);
void oam_end(void);
void spr(int x, int y, int tile, int size, int pal, int flags);
#define SPR_HFLIP 1
#define SPR_PRIO0 2

// ---------------------------------------------------------------- sound (sound.c)
void snd_init(void);
void snd_update(void);
void music_play(int id);
void music_stop(void);
int  music_current(void);
void sfx(int id);

// ---------------------------------------------------------------- rng / math
u32 rng(void);           // run rng (seeded)
u32 frng(void);          // fx rng
void rng_seed(u32 s);
int rnd(int n);
int frnd(int n);
u16 iatan2(int dy, int dx);

// ---------------------------------------------------------------- save (save.c)
typedef struct {
    u32 magic;
    u32 hiscore;
    u32 dreamcoins;
    u16 runs, clears;
    u8 up_bomb, up_shield, up_luck, up_coin;
    u8 unlocked;      // bit0: ship 4 (toaster)
    u8 best_sub;
    u8 pad[2];
} SaveData;
extern SaveData g_save;
void save_load(void);
void save_write(void);

// ---------------------------------------------------------------- run / game data
enum { D_EASY, D_NORMAL, D_HARD, D_EXTREME };
enum { SHIP_JET, SHIP_PAPER, SHIP_PENGUIN, SHIP_TOASTER, NUM_SHIPS };
enum { W_NORMAL, W_DOUBLE, W_LASER, W_RIPPLE, W_SPREAD };
enum { PU_SPEED, PU_MISSILE, PU_DOUBLE, PU_LASER, PU_OPTION, PU_SHIELD,
       PU_RIPPLE, PU_SPREAD, PU_HOMING, PU_BOMB, PU_SLOWMO, PU_X2, PU_MAGNET, PU_HAMMER, PU_RAPID, NUM_PU };
enum { ROUTE_NONE, ROUTE_NIGHT, ROUTE_DREAM };
#define NUM_RELICS 8

typedef struct {
    const char *name;
    const char *desc;
    u16 speed;      // .8 px per frame
    u8 shotint;     // frames between shots
    u8 dmg;
    u8 shot_spr;
    const char *shotname;
} ShipDef;
extern const ShipDef ship_defs[NUM_SHIPS];
extern const char *pu_label[NUM_PU];
extern const char *pu_name[NUM_PU];
extern const char *pu_desc[NUM_PU];
extern const char *relic_name[NUM_RELICS];
extern const char *relic_desc[NUM_RELICS];
extern const char *diff_name[4];

typedef struct {
    u32 seed;
    u8 diff, ship, sub, route;      // route of current sub-level
    u8 routes[3];
    u8 theme;
    u32 score;
    u16 coins;
    u8 bombs, shields;
    u8 slots[7];
    s8 hi;                          // highlighted meter slot (-1 none)
    u8 speed_lv, missile_lv, weapon, weapon_lv, options, rapid, homing, magnet;
    u16 slowmo, x2;
    u8 relics[NUM_RELICS];
    u8 nrelics;
    u8 bosses;
    u8 rank;                        // extreme adaptive rank 0..100
    u8 dmg_bonus, fire_bonus, luck, coin_mul, bslow, speed_bonus;
    u8 subs_cleared;
    u8 slot1;
    u32 earned;
} Run;
extern Run R;

void run_new(void);
void run_grant_relic(int r);
int  pu_maxed(int pu);
void pu_apply(int pu);
void roll_meter(void);

// game.c
void game_start_sublevel(void);
void game_update(void);
int  game_paused(void);
void game_draw_hud(void);
void game_draw_sprites(void);

// menus.c
void title_enter(void);   void title_update(void);
void diff_enter(void);    void diff_update(void);
void ship_enter(void);    void ship_update(void);
void slot_enter(void);    void slot_update(void);
void dialog_enter(void);  void dialog_update(void);
void fork_enter(void);    void fork_update(void);
void node_enter(void);    void node_update(void);
void gameover_enter(void);void gameover_update(void);
void clear_enter(void);   void clear_update(void);
void shop_enter(void);    void workshop_enter(void); void workshop_update(void);
void run_finish(int cleared);
extern const char *sub_names[3][3];

// ---------------------------------------------------------------- settings (settings.c)
enum {
    S_RENDER, S_SHADER, S_SCAN, S_SCALE, S_BRIGHT, S_SAT, S_GHOST, S_SHAKE, S_FLASH, S_FPS, S_ASPECT, S_BULLET, S_METER,
    S_ADRV, S_ARATE, S_CRUSH, S_LAT, S_ASYNC, S_STEREO, S_TONE, S_MVOL, S_SVOL, S_MSTYLE,
    S_AUTOFIRE, S_SWAP, S_HUD,
    NUM_SET
};
enum { RM_HW, RM_DITHER, RM_LINEDBL, RM_INTERLACE };
enum { SH_NONE, SH_LCD, SH_CRT, SH_DMG, SH_POCKET, SH_SEPIA, SH_VBOY, SH_NIGHT, SH_INVERT, SH_CONTRAST, SH_PASTEL, SH_GRIT, NUM_SH };
enum { AS_FULL, AS_PILLAR, AS_CINEMA, AS_FRAMED };
enum { FR_60, FR_30, FR_ADAPT };
enum { DRV_HYBRID, DRV_PSG, DRV_DS };
enum { SY_VSYNC, SY_TIMER, SY_FREE };
enum { ST_STEREO, ST_MONO, ST_SWAP, ST_WIDE };
extern u8 g_set[NUM_SET];
void settings_load(void);
void settings_save(void);
void settings_enter(void);
void settings_update(void);
int  fire_key(void);
int  bomb_key(void);

// ---------------------------------------------------------------- video fx (video.c)
extern u16 g_mpal[512];
extern u32 g_pal_skip;
extern int g_preview, g_px0, g_py0, g_px1, g_py1, g_aspect_on, g_shx, g_shy, g_render_this;
extern volatile u32 g_vbl;
void vid_init(void);
void vid_settings(void);
void pal_bg_set(int i, u16 c);
void pal_mark_all(void);
void vid_shake(int strength);
void vid_flash(int on, u16 base);
void vid_bg1_fill(int tile);
void vid_prepare(void);
void vid_measure(u32 frame_vbl);
void vid_upload(void);
void vid_isr(void);

// sound extras
extern const u16 snd_rate_hz[6];
extern int g_vu[2];
void snd_settings(void);
void snd_isr(void);
void music_restyle(void);
