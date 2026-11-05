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
    ST_GAMEOVER, ST_CLEAR, ST_WORKSHOP, ST_SETTINGS, ST_MEMORIES
};
extern int g_state, g_next_state;
extern u32 g_frame;
extern int g_debug;
extern int g_autopilot;     // test pilot (title: hold L+R, press DOWN) - used by the balance scripts
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
// v0.3 story progress: separate SRAM block at 0x200 (own magic + version + checksum), so v0.1/v0.2 saves load untouched
#define NUM_MEM 12
typedef struct {
    u32 magic;
    u8 ver;
    u8 endings;       // bit per World 1 ending seen (0 NN, 1 ND, 2 DN, 3 DD)
    u16 shifts;       // SHIFTs triggered, all time
    u32 mem;          // bit per memory fragment unlocked
    u16 route_runs[4];// World 1 clears per route combo
} MemSave;
extern MemSave g_mem;
void mem_load(void);
void mem_save(void);
int  mem_unlock(int id);     // 1 if newly unlocked (and saved)

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
    s8 align;                       // v0.3: dream (+) / nightmare (-) alignment from fork picks
    u8 shift_mask;                  // bit0 dream SHIFT used, bit1 nightmare SHIFT used (this run)
    u8 new_mem;                     // memory fragment unlocked this run (for the results screen), 255 none
    u8 mem_runs;                    // memory fragments unlocked during this run
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
void memories_enter(void); void memories_update(void);
void dialog_goto(int scene, int next_state);
extern const char *sub_names[3][3];

// ---------------------------------------------------------------- settings (settings.c)
enum {
    S_RENDER, S_SHADER, S_SCAN, S_SCALE, S_BRIGHT, S_SAT, S_GHOST, S_SHAKE, S_FLASH, S_FPS, S_ASPECT, S_BULLET, S_METER,
    S_ADRV, S_ARATE, S_CRUSH, S_LAT, S_ASYNC, S_STEREO, S_TONE, S_MVOL, S_SVOL, S_MSTYLE,
    S_AUTOFIRE, S_SWAP, S_HUD,
    S_CARTOON,            // v0.3 (appended: v0.2 settings blocks keep their indices)
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
extern int g_shift_tint;          // 0 none, 1 dream pastel, 2 nightmare dark (SHIFT)
extern int g_cur_theme;
void vid_cartoon_tiles(void);     // copy the OBJ tile variant for the CARTOON setting
void vid_set_tint(int t);

// sound extras
extern const u16 snd_rate_hz[6];
extern int g_vu[2];
void snd_settings(void);
void snd_isr(void);
void music_restyle(void);
void music_swap(int id);          // switch to another variant of the same leitmotif, keeping the bar position

// ---------------------------------------------------------------- story (story.c)
enum { VIBE_NEUTRAL, VIBE_NIGHT, VIBE_DREAM, VIBE_MIXED };
enum { PT_MILO, PT_SHADOW, PT_MERCHANT, PT_VOX, PT_WADDLES, PT_SANDMAN, PT_WARDEN, PT_MOTH, PT_BIGTEDDY, PT_ENGINE, NUM_PT };
typedef struct { u8 port; const char *text; } Line;
typedef struct { const Line *l; u8 n; u8 vibe; const char *title; } Scene;
enum {
    SC_INTRO, SC_PRE12_N, SC_PRE12_D, SC_PRE13_NN, SC_PRE13_ND, SC_PRE13_DN, SC_PRE13_DD,
    SC_WARDEN_PRE, SC_WARDEN_POST, SC_MOTH_PRE, SC_MOTH_POST, SC_TEDDY_PRE, SC_TEDDY_POST,
    SC_ENGINE_PRE_NN, SC_ENGINE_PRE_DN, SC_ENGINE_POST_NN, SC_ENGINE_POST_DN,
    SC_SAND_PRE_DD, SC_SAND_PRE_ND, SC_SAND_POST_DD, SC_SAND_POST_ND,
    SC_END_NN, SC_END_ND, SC_END_DN, SC_END_DD, NUM_SC
};
extern const Scene scenes[NUM_SC];
typedef struct { const char *title; const char *epilogue; u8 mem; } Ending;
extern const Ending endings[4];
extern const char *const mem_name[NUM_MEM];
extern const char *const mem_text[NUM_MEM];
extern const char *const mem_hint[NUM_MEM];
enum { MEM_GATE, MEM_MOTH, MEM_TEDDY, MEM_FOUNDRY, MEM_CANDY, MEM_END_NN, MEM_END_DD, MEM_END_ND, MEM_END_DN, MEM_SHIFT1, MEM_BOTH, MEM_TRUTH };
int  story_combo(void);           // 0 NN, 1 ND, 2 DN, 3 DD (forks 1 and 2)
int  story_vibe(void);            // vibe of the route so far
int  story_pre_stage(int sub);    // scene shown before sub-level `sub`
int  story_boss_pre(void);
int  story_boss_post(void);
int  story_ending_scene(void);
const char *story_tagline(void);
void story_mem_event(int id);     // unlock + remember for the results screen
// shared dialogue box (between stages and in-stage boss talk)
void talk_start(int scene);
int  talk_update(void);           // 1 when the scene is over
void talk_draw_portrait(void);
int  talk_scene(void);
int  talk_line(void);
extern int g_story_dbg;           // debug runs skip story scenes unless this is on (title: hold L+R, press UP)
static inline int story_on(void) { return !g_debug || g_story_dbg; }
extern const char *const pt_name[NUM_PT];

// ---------------------------------------------------------------- test statistics (read by tools/runrom peek)
typedef struct { u32 magic, frames, hits, bombs, shifts, score, sub, bosses, died, diff, boss_frames[3], stage_frames[3], shields_end; } Stats;
extern Stats g_stats;
