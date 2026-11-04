// Bullet Storm Raiden - gameplay: player, weapons, enemies, waves, bosses, HUD
#include "common.h"

#define MAX_EN 20
#define MAX_EB 64
#define MAX_PS 22
#define MAX_IT 10
#define MAX_FX 14

typedef struct { s32 x, y, vx, vy, by; s16 hp; u16 t; s16 a, b; u8 kind, mv, alive, flash, drop, pal; s16 ft; } Enemy;
typedef struct { s32 x, y, vx, vy; u8 type, alive; } EBullet;
typedef struct { s32 x, y, vx, vy; u16 t; u8 spr, size, dmg, pierce, alive, kind; } PShot;
typedef struct { s32 x, y; u16 t; u8 type, alive; } Item;
typedef struct { s16 x, y; u8 t, kind, alive; } Fx;

static Enemy en[MAX_EN];
static EBullet eb[MAX_EB];
static PShot ps[MAX_PS];
static Item it[MAX_IT];
static Fx fx[MAX_FX];

// enemy kinds
enum { EK_RING, EK_FIGHTER, EK_SCOUT, EK_HEAVY, EK_MINE, EK_EYE, EK_CLOUD, EK_DUCK, EK_PLANE, EK_GUMMY, NUM_EK };
enum { F_NONE, F_AIM, F_AIM3, F_RING, F_STAR };
enum { MV_STRAIGHT, MV_SINE, MV_DIVE, MV_STOP, MV_POP, MV_BOUNCE };
typedef struct { u16 spr; u8 pal, hp, hw, hh; u16 score; u8 fire, fint; } EDef;
static const EDef edefs[NUM_EK] = {
    { SPR_EN_RING,    2, 2, 6, 6, 100, F_AIM, 120 },
    { SPR_EN_FIGHTER, 2, 2, 7, 4, 150, F_AIM, 95 },
    { SPR_EN_SCOUT,   2, 1, 7, 3, 120, F_NONE, 0 },
    { SPR_EN_HEAVY,   2, 16, 7, 6, 1000, F_AIM3, 55 },
    { SPR_EN_MINE,    2, 3, 5, 5, 150, F_RING, 150 },
    { SPR_EN_EYEPOD,     2, 4, 6, 5, 200, F_AIM3, 90 },
    { SPR_EN_CLOUD,   4, 3, 6, 5, 150, F_STAR, 110 },
    { SPR_EN_DUCK,    4, 1, 6, 6, 100, F_NONE, 0 },
    { SPR_EN_TOYPLANE,4, 2, 7, 5, 150, F_AIM, 95 },
    { SPR_EN_GUMMY,   4, 16, 7, 7, 1000, F_STAR, 50 },
};
static const u8 theme_kinds[3][4] = {
    { EK_RING, EK_FIGHTER, EK_SCOUT, EK_HEAVY },
    { EK_MINE, EK_FIGHTER, EK_EYE, EK_HEAVY },
    { EK_DUCK, EK_CLOUD, EK_PLANE, EK_GUMMY },
};

// eb types -> sprite
static const u16 eb_spr[5] = { SPR_EB_PELLET, SPR_EB_ORB, SPR_EB_STAR, SPR_EB_NEEDLE, SPR_EB_BLUE };
enum { EB_PELLET, EB_ORB, EB_STAR, EB_NEEDLE, EB_BLUEB };

// player
static s32 px, py;
static int p_inv, p_shot_t, p_msl_t, p_dead, bomb_cd, flash_t, nohit_t;
static s32 hist_x[32], hist_y[32];
static int hist_i;
static int paused;

// level
enum { P_INTRO, P_WAVES, P_WARN, P_BOSS, P_BOSSDIE, P_CLEAR, P_DEAD };
static int phase, phase_t, lvl_t, lvl_len, wave_t;
static const char *ban1, *ban2; static int ban_t, ban_pal;
static const char *pop; static int pop_t;
static int bmul, firemul, hpmul;

// boss
enum { BK_WARDEN, BK_MOTH, BK_TEDDY, BK_MAIN };
static struct { s32 x, y, vy; int hp, maxhp, t, kind, phase, flash, alive, inv, size, spr, pal, hw, hh, btype; u16 ang, ang2; } B;

const char *sub_names[3][3] = {
    { "TWILIGHT ORBIT", "TWILIGHT ORBIT", "TWILIGHT ORBIT" },
    { "", "IRON HIVE", "PILLOW CLOUDS" },
    { "", "BLACK FOUNDRY", "CANDY MOON" },
};
static const char *boss_names[5] = { "GATE WARDEN", "IRON MOTH", "BIG TEDDY", "NIGHT ENGINE", "MOON SANDMAN" };

int game_paused(void) { return paused; }

// ---------------------------------------------------------------- spawning helpers
static Fx *fx_add(int x, int y, int kind)
{
    for (int i = 0; i < MAX_FX; i++) if (!fx[i].alive) {
        fx[i] = (Fx){ (s16)x, (s16)y, 0, (u8)kind, 1 }; return &fx[i];
    }
    return 0;
}

static void eb_fire(s32 x, s32 y, u16 ang, int spd, int type)
{
    for (int i = 0; i < MAX_EB; i++) if (!eb[i].alive) {
        int s = (spd * bmul) >> 8;
        if (R.bslow) s = s * 225 >> 8;
        eb[i].x = x; eb[i].y = y;
        eb[i].vx = (lu_cos(ang) * s) >> 12;
        eb[i].vy = (lu_sin(ang) * s) >> 12;
        eb[i].type = type; eb[i].alive = 1;
        return;
    }
}
static u16 aim(s32 x, s32 y) { return iatan2((py - y) >> 8, (px - x) >> 8); }
static void fan(s32 x, s32 y, int n, int step, int spd, int type)
{
    u16 a = aim(x, y);
    for (int i = 0; i < n; i++) eb_fire(x, y, a + (i * 2 - (n - 1)) * step / 2, spd, type);
}
static void ring(s32 x, s32 y, int n, u16 off, int spd, int type)
{
    for (int i = 0; i < n; i++) eb_fire(x, y, off + i * (65536 / n), spd, type);
}

static void item_add(s32 x, s32 y, int type)
{
    for (int i = 0; i < MAX_IT; i++) if (!it[i].alive) {
        it[i] = (Item){ x, y, 0, (u8)type, 1 }; return;
    }
}

static Enemy *en_add(int kind, int x, int y, int mv)
{
    for (int i = 0; i < MAX_EN; i++) if (!en[i].alive) {
        Enemy *e = &en[i];
        memset(e, 0, sizeof(*e));
        const EDef *d = &edefs[kind];
        e->kind = kind; e->mv = mv; e->alive = 1;
        e->x = FX(x); e->y = FX(y); e->by = e->y;
        e->hp = (d->hp * hpmul + 255) >> 8; if (e->hp < 1) e->hp = 1;
        e->pal = (d->pal == 2 && R.route == ROUTE_NIGHT) ? 3 : d->pal;
        e->ft = d->fint ? (d->fint / 2 + rnd(d->fint)) : 0;
        return e;
    }
    return 0;
}

static void banner(const char *a, const char *b, int t, int pal)
{
    txt_clear_rows(8, 10);
    ban1 = a; ban2 = b; ban_t = t; ban_pal = pal;
}

// ---------------------------------------------------------------- waves (seeded remix)
static void spawn_wave(void)
{
    static const u8 dd[4] = { 0, 1, 2, 2 };
    int dens = dd[R.diff] + R.sub + lvl_t / 900;
    if (R.diff == D_EXTREME) dens += R.rank / 35;
    int tk = R.sub == 0 ? 0 : (R.route == ROUTE_NIGHT ? 1 : 2);
    const u8 *K = theme_kinds[tk];
    int w = rnd(8);
    if (w == 4 && lvl_t < 400) w = 0;
    Enemy *e = 0;
    int n, y;
    switch (w) {
    case 0: // sine line (Gradius fan)
        n = 4 + dens / 2; if (n > 8) n = 8;
        y = 40 + rnd(80);
        for (int i = 0; i < n; i++) {
            e = en_add(K[0], 250 + i * 18, y, MV_SINE);
            if (!e) break;
            e->vx = -0x150; e->a = 500 + rnd(200); e->b = 18 + rnd(10); e->t = i * 8;
        }
        if (e) e->drop = 1;
        break;
    case 1: // V formation
        y = 40 + rnd(80);
        for (int i = 0; i < 5; i++) {
            int k = i - 2;
            e = en_add(K[1], 250 + (k < 0 ? -k : k) * 14, y + k * 14, MV_STRAIGHT);
            if (!e) break;
            e->vx = -0x120 - dens * 0x10;
        }
        if (e) e->drop = 1;
        break;
    case 2: { // divers
        n = 3 + dens / 2; if (n > 6) n = 6;
        int top = rnd(2);
        for (int i = 0; i < n; i++) {
            e = en_add(K[1 + rnd(2)], 250 + i * 22, top ? 28 : 140, MV_DIVE);
            if (!e) break;
            e->vx = -0x180; e->a = 20 + rnd(30);
        }
        if (e && rnd(2)) e->drop = 1;
        break; }
    case 3: // pop-ups from the edges
        n = 2 + dens / 3; if (n > 4) n = 4;
        for (int i = 0; i < n; i++) {
            int top = rnd(2);
            e = en_add(K[2], 110 + rnd(110), top ? 6 : 162, MV_POP);
            if (!e) break;
            e->vy = top ? 0x120 : -0x120; e->a = 35 + rnd(20); e->b = 70; e->vx = -0x60;
        }
        break;
    case 4: // heavy gunship
        e = en_add(K[3], 256, 40 + rnd(80), MV_STOP);
        if (e) { e->vx = -0x100; e->a = 70; e->b = 200 + dens * 20; e->drop = 3; }
        break;
    case 5: // bouncing swarm
        n = 5 + dens; if (n > 9) n = 9;
        for (int i = 0; i < n; i++) {
            e = en_add(K[0], 250 + i * 14, 30 + rnd(110), MV_BOUNCE);
            if (!e) break;
            e->vx = -0xC0 - rnd(0x80); e->vy = rnd(2) ? 0x90 : -0x90;
        }
        break;
    case 6: // fast stream
        n = 5 + dens / 2; if (n > 8) n = 8;
        y = 30 + rnd(110);
        for (int i = 0; i < n; i++) {
            e = en_add(K[2], 250 + i * 16, y, MV_STRAIGHT);
            if (!e) break;
            e->vx = -0x220;
        }
        if (e) e->drop = 1;
        break;
    case 7: // pincer sine lines top+bottom
        n = 3 + dens / 3; if (n > 5) n = 5;
        for (int s = 0; s < 2; s++)
            for (int i = 0; i < n; i++) {
                e = en_add(K[0], 250 + i * 18, s ? 120 : 48, MV_SINE);
                if (!e) break;
                e->vx = -0x130; e->a = 700; e->b = 14; e->t = i * 10 + s * 40;
            }
        if (e) e->drop = 1;
        break;
    }
    int gap = 130 - dens * 12 - lvl_t / 60;
    if (gap < 50) gap = 50;
    wave_t = gap + rnd(30);
}

// ---------------------------------------------------------------- boss
static void boss_spawn(void)
{
    memset(&B, 0, sizeof(B));
    B.alive = 1; B.x = FX(280); B.y = FX(84);
    int hp;
    if (R.sub == 0) { B.kind = BK_WARDEN; B.size = 32; B.spr = SPR_MB_WARDEN; B.pal = 2; hp = 100; B.hw = 13; B.hh = 13; B.btype = EB_PELLET; }
    else if (R.sub == 1 && R.route == ROUTE_NIGHT) { B.kind = BK_MOTH; B.size = 32; B.spr = SPR_MB_MOTH; B.pal = 3; hp = 150; B.hw = 12; B.hh = 12; B.btype = EB_ORB; }
    else if (R.sub == 1) { B.kind = BK_TEDDY; B.size = 32; B.spr = SPR_MB_TEDDY; B.pal = 4; hp = 150; B.hw = 13; B.hh = 13; B.btype = EB_STAR; }
    else { B.kind = BK_MAIN; B.size = 64; B.spr = SPR_BOSS_MAIN; B.pal = R.route == ROUTE_DREAM ? 6 : 5; hp = 480; B.hw = 24; B.hh = 28;
           B.btype = R.route == ROUTE_DREAM ? EB_STAR : EB_ORB; }
    B.maxhp = B.hp = (hp * hpmul) >> 8;
}

static void boss_clear_bullets(void)
{
    for (int i = 0; i < MAX_EB; i++) if (eb[i].alive) {
        eb[i].alive = 0; R.score += 10;
        if (frnd(4) == 0) fx_add(eb[i].x >> 8, eb[i].y >> 8, 1);
    }
}

static void boss_update(void)
{
    int t = ++B.t;
    s32 cx = B.x, cy = B.y;
    if (B.flash) B.flash--;
    if (B.inv) B.inv--;
    int fm = firemul;  // >256 = slower fire
    #define EVERY(n) (t % (((n) * fm) >> 8 ? ((n) * fm) >> 8 : 1) == 0)
    int bt = B.btype;
    if (B.x > FX(B.kind == BK_MAIN ? 184 : 196)) { B.x -= 0x100; return; }   // entering
    switch (B.kind) {
    case BK_WARDEN:
        B.y = FX(84) + lu_sin(t * 220) * 40 / 16;
        if ((t / 240) % 2 == 0) { if (EVERY(36)) fan(cx - FX(10), cy, 5, 0x0A00, 0x1A0, bt); }
        else if (EVERY(48)) { ring(cx, cy, 14, B.ang, 0x130, EB_BLUEB); B.ang += 0x0700; }
        if (B.hp < B.maxhp / 2 && EVERY(22)) eb_fire(cx - FX(12), cy, aim(cx, cy), 0x220, EB_NEEDLE);
        break;
    case BK_MOTH:
        B.x = FX(190) + lu_sin(t * 150) * 20 / 16;
        B.y = FX(84) + lu_sin(t * 300) * 44 / 16;
        if (t % 300 < 180) {
            if (EVERY(7)) {
                int arms = B.hp < B.maxhp / 2 ? 4 : 3;
                for (int k = 0; k < arms; k++) eb_fire(cx, cy, B.ang + k * (65536 / arms), 0x150, bt);
                B.ang += 0x0480;
            }
        } else if (t % 12 == 0 && t % 60 < 36) fan(cx - FX(8), cy, 3, 0x0600, 0x200, EB_PELLET);
        break;
    case BK_TEDDY:
        B.y += B.vy;
        if (B.vy == 0) B.vy = 0x100;
        if (B.y < FX(36) || B.y > FX(132)) B.vy = -B.vy;
        if (t % 420 > 330) B.x += (t % 420 < 375) ? -0x200 : 0x200;   // "hug" dash
        if (EVERY(46)) { ring(cx, cy, 10, B.ang, 0x140, EB_STAR); B.ang += 0x0C00; }
        if (EVERY(90)) fan(cx, cy, 5, 0x0900, 0x1C0, EB_BLUEB);
        break;
    case BK_MAIN: {
        int pct = B.hp * 100 / B.maxhp;
        int np = pct > 66 ? 0 : pct > 33 ? 1 : 2;
        if (np != B.phase) {
            B.phase = np; B.inv = 70; B.flash = 20;
            boss_clear_bullets(); sfx(SFX_BIGEXPLODE); flash_t = 6; vid_shake(10);
            banner(np == 1 ? "PHASE 2" : "FINAL PHASE", 0, 90, P_RED);
        }
        int spd = B.phase == 2 ? 300 : 160;
        B.y = FX(84) + lu_sin(t * spd) * (B.phase == 2 ? 40 : 30) / 16;
        if (B.inv) break;
        s32 c1y = cy - FX(20), c2y = cy + FX(18);
        if (B.phase == 0) {
            if (EVERY(44)) fan(cx - FX(6), cy, 7, 0x0800, 0x170, bt);
            if (EVERY(26)) { eb_fire(cx - FX(20), c1y, aim(cx - FX(20), c1y), 0x200, EB_PELLET); eb_fire(cx - FX(20), c2y, aim(cx - FX(20), c2y), 0x200, EB_PELLET); }
        } else if (B.phase == 1) {
            if (EVERY(6)) {
                for (int k = 0; k < 2; k++) {
                    eb_fire(cx, cy, B.ang + k * 32768, 0x150, bt);
                    eb_fire(cx, cy, B.ang2 + k * 32768, 0x130, EB_BLUEB);
                }
                B.ang += 0x0600; B.ang2 -= 0x0500;
            }
            if (EVERY(90)) fan(cx - FX(6), cy, 5, 0x0A00, 0x1A0, EB_PELLET);
        } else {
            if (EVERY(20)) { ring(cx, cy, 18, B.ang, (t / 20) % 2 ? 0x110 : 0x170, bt); B.ang += 0x0380; }
            if (t % 70 < 30 && EVERY(8)) {
                eb_fire(cx - FX(20), c1y, aim(cx - FX(20), c1y), 0x260, EB_NEEDLE);
                eb_fire(cx - FX(20), c2y, aim(cx - FX(20), c2y), 0x260, EB_NEEDLE);
            }
        }
        break; }
    }
}

// ---------------------------------------------------------------- player weapons
static void ps_add(s32 x, s32 y, s32 vx, s32 vy, int sprt, int size, int dmg, int pierce, int kind)
{
    for (int i = 0; i < MAX_PS; i++) if (!ps[i].alive) {
        ps[i] = (PShot){ x, y, vx, vy, 0, (u8)sprt, (u8)size, (u8)dmg, (u8)pierce, 1, (u8)kind };
        return;
    }
}
static void fire_pattern(s32 x, s32 y)
{
    const ShipDef *sd = &ship_defs[R.ship];
    int dmg = sd->dmg + R.dmg_bonus;
    int wl = R.weapon_lv;
    switch (R.weapon) {
    case W_LASER:
        ps_add(x + FX(8), y, FX(8), 0, SPR_SHOT_LASER, 8, 1 + (wl - 1) + R.dmg_bonus, 1, 0);
        if (wl >= 3) { ps_add(x + FX(8), y - FX(5), FX(8), 0, SPR_SHOT_LASER, 8, 1, 1, 0); }
        return;
    case W_RIPPLE:
        ps_add(x + FX(8), y, FX(4), 0, SPR_SHOT_RIPPLE, 16, 1 + wl + R.dmg_bonus, 1, 2);
        return;
    case W_SPREAD:
        for (int k = -2; k <= 2; k++) {
            u16 a = k * (0x0700 - wl * 0x80);
            ps_add(x + FX(6), y, (lu_cos(a) * 0x500) >> 12, (lu_sin(a) * 0x500) >> 12, SPR_SHOT_SPREAD, 8, dmg + (wl - 1) / 2, 0, 0);
        }
        return;
    }
    switch (R.ship) {
    case SHIP_JET: ps_add(x + FX(8), y, FX(6), 0, SPR_SHOT_DASH, 8, dmg, 0, 0); break;
    case SHIP_PAPER:
        for (int k = -1; k <= 1; k++) { u16 a = k * 0x0600; ps_add(x + FX(6), y, (lu_cos(a) * 0x500) >> 12, (lu_sin(a) * 0x500) >> 12, SPR_SHOT_PAPER, 8, dmg, 0, 0); }
        break;
    case SHIP_PENGUIN: ps_add(x + FX(8), y, FX(4), 0, SPR_SHOT_FISH, 8, dmg, 0, 0); break;
    case SHIP_TOASTER:
        ps_add(x + FX(6), y - FX(5), FX(5), 0, SPR_SHOT_TOAST, 8, dmg, 0, 0);
        ps_add(x + FX(6), y + FX(5), FX(5), 0, SPR_SHOT_TOAST, 8, dmg, 0, 0);
        break;
    }
    if (R.weapon == W_DOUBLE) {
        ps_add(x + FX(4), y - FX(3), 0x380, -0x380, sd->shot_spr, 8, dmg, 0, 0);
        if (wl >= 2) ps_add(x + FX(4), y + FX(3), 0x380, 0x380, sd->shot_spr, 8, dmg, 0, 0);
        if (wl >= 3) ps_add(x + FX(4), y - FX(3), 0x480, -0x1C0, sd->shot_spr, 8, dmg, 0, 0);
    }
}
static int shot_interval(void)
{
    int iv;
    switch (R.weapon) {
    case W_LASER: iv = 4; break;
    case W_RIPPLE: iv = 14; break;
    case W_SPREAD: iv = 12; break;
    default: iv = ship_defs[R.ship].shotint; break;
    }
    iv -= R.rapid * 2 + R.fire_bonus;
    return iv < 3 ? 3 : iv;
}

void game_hammer(void)
{
    for (int i = 0; i < MAX_EB; i++) if (eb[i].alive) {
        eb[i].alive = 0;
        if (frnd(5) == 0) item_add(eb[i].x, eb[i].y, 1);
        else fx_add(eb[i].x >> 8, eb[i].y >> 8, 1);
    }
    for (int i = 0; i < MAX_EN; i++) if (en[i].alive) { en[i].hp -= 8; en[i].flash = 6; }
    if (B.alive && !B.inv) { B.hp -= 40; B.flash = 6; }
    banner("BONK!", "TOY HAMMER", 60, P_YELLOW);
    flash_t = 4; vid_shake(8);
}

static void player_hit(void)
{
    if (p_inv || p_dead || g_debug) return;
    if (R.diff == D_EXTREME) R.rank = R.rank > 25 ? R.rank - 25 : 0;
    nohit_t = 0;
    if (R.shields > 0) {
        R.shields--;
        p_inv = 120;
        sfx(SFX_HIT); flash_t = 3; vid_shake(8);
        for (int i = 0; i < MAX_EB; i++) if (eb[i].alive) {
            s32 dx = (eb[i].x - px) >> 8, dy = (eb[i].y - py) >> 8;
            if (dx * dx + dy * dy < 56 * 56) { eb[i].alive = 0; fx_add(eb[i].x >> 8, eb[i].y >> 8, 1); }
        }
    } else {
        p_dead = 1; phase = P_DEAD; phase_t = 0;
        sfx(SFX_BIGEXPLODE); vid_shake(16);
        for (int k = 0; k < 6; k++) fx_add((px >> 8) + frnd(24) - 12, (py >> 8) + frnd(24) - 12, 0);
        music_stop();
    }
}

static void add_score(u32 s)
{
    R.score += R.x2 ? s * 2 : s;
}

static void kill_enemy(Enemy *e)
{
    const EDef *d = &edefs[e->kind];
    e->alive = 0;
    add_score(d->score);
    fx_add(e->x >> 8, e->y >> 8, 0);
    sfx(e->kind == EK_HEAVY || e->kind == EK_GUMMY ? SFX_BIGEXPLODE : SFX_EXPLODE);
    if (e->kind == EK_HEAVY || e->kind == EK_GUMMY) vid_shake(6);
    if (R.diff == D_EXTREME && e->hp <= 0 && (e->kind == EK_HEAVY || e->kind == EK_GUMMY)) R.rank = R.rank < 96 ? R.rank + 4 : 100;
    // revenge bullets from nightmare mines on hard+
    if (e->kind == EK_MINE && R.diff >= D_HARD) ring(e->x, e->y, 6, frng(), 0x100, EB_PELLET);
    if (e->drop == 1) item_add(e->x, e->y, 0);
    else if (e->drop == 3) { item_add(e->x, e->y, 0); item_add(e->x + FX(8), e->y - FX(6), 1); item_add(e->x - FX(6), e->y + FX(8), 1); }
    else {
        int r = rnd(100);
        if (r < 3 + R.luck * 2) item_add(e->x, e->y, 0);
        else if (r < 18 + R.luck) item_add(e->x, e->y, 1);
    }
}

// ---------------------------------------------------------------- setup
void game_start_sublevel(void)
{
    static const u8 th[3][3] = { { TH_TWILIGHT, TH_TWILIGHT, TH_TWILIGHT }, { TH_TWILIGHT, TH_HIVE, TH_CLOUDS }, { TH_TWILIGHT, TH_FOUNDRY, TH_CANDYMOON } };
    R.route = R.routes[R.sub];
    R.theme = th[R.sub][R.route];
    video_game_mode();
    load_theme(R.theme);
    memset(en, 0, sizeof(en)); memset(eb, 0, sizeof(eb)); memset(ps, 0, sizeof(ps));
    memset(it, 0, sizeof(it)); memset(fx, 0, sizeof(fx)); memset(&B, 0, sizeof(B));
    px = FX(40); py = FX(84);
    for (int i = 0; i < 32; i++) { hist_x[i] = px; hist_y[i] = py; }
    p_inv = 90; p_shot_t = 0; p_msl_t = 0; p_dead = 0; bomb_cd = 0; flash_t = 0; paused = 0; nohit_t = 0;
    phase = P_INTRO; phase_t = 0; lvl_t = 0; wave_t = 90;
    lvl_len = 2700 + R.sub * 300;
    static const u16 bm[4] = { 205, 256, 290, 300 }, fm[4] = { 330, 256, 228, 228 }, hm[4] = { 210, 256, 280, 300 };
    bmul = bm[R.diff]; firemul = fm[R.diff]; hpmul = hm[R.diff];
    static char stg[24];
    strcpy(stg, "STAGE 1-1");
    stg[8] = '1' + R.sub;
    banner(stg, sub_names[R.sub][R.route], 150, R.route == ROUTE_NIGHT ? P_RED : R.route == ROUTE_DREAM ? P_PINK : P_CYAN);
    music_play(R.route == ROUTE_NIGHT ? MUS_W1_NIGHT : R.route == ROUTE_DREAM ? MUS_W1_DREAM : MUS_W1);
    g_near_x = 0;
}

// ---------------------------------------------------------------- HUD
static void hud_label(int x, int y, const char *s) { txt_printo(x, y, s, P_YELLOW); }
void game_draw_hud(void)
{
    txt_fill(0, 0, 30, 2, FONT_O);
    if (g_set[S_HUD]) {   // minimal one-line HUD
        txt_fill(0, 1, 30, 1, 0);
        hud_label(0, 0, "SC"); txt_num(3, 0, R.score, 7, P_WHITE, 1);
        hud_label(12, 0, "B"); txt_num(13, 0, R.bombs, 1, P_WHITE, 1);
        hud_label(15, 0, "SH"); txt_num(17, 0, R.shields, 1, R.shields ? P_WHITE : P_RED, 1);
        if (R.x2) txt_printo(19, 0, "X2", P_PINK);
        if (R.diff == D_EXTREME) { txt_printo(22, 0, "R", P_RED); txt_num(23, 0, R.rank > 99 ? 99 : R.rank, 2, P_RED, 1); }
        txt_num(27, 0, 1, 1, P_WHITE, 1); txt_printo(28, 0, "-", P_WHITE); txt_num(29, 0, R.sub + 1, 1, P_WHITE, 1);
        goto meter;
    }
    hud_label(0, 0, "SC"); txt_num(3, 0, R.score, 7, P_WHITE, 1);
    hud_label(11, 0, "HI"); txt_num(14, 0, R.score > g_save.hiscore ? R.score : g_save.hiscore, 7, P_WHITE, 1);
    hud_label(22, 0, "ST"); txt_num(25, 0, 1, 1, P_WHITE, 1); txt_printo(26, 0, "-", P_WHITE); txt_num(27, 0, R.sub + 1, 1, P_WHITE, 1);
    hud_label(0, 1, "PWR"); txt_num(3, 1, R.hi + 1, 1, P_WHITE, 1);
    hud_label(5, 1, "B"); txt_num(6, 1, R.bombs, 1, P_WHITE, 1);
    hud_label(8, 1, "SH"); txt_num(10, 1, R.shields, 1, R.shields ? P_WHITE : P_RED, 1);
    hud_label(12, 1, "LV"); txt_num(14, 1, R.weapon_lv, 1, P_WHITE, 1);
    hud_label(16, 1, "$"); txt_num(17, 1, R.coins, 3, P_WHITE, 1);
    if (R.x2) txt_printo(21, 1, "X2", P_PINK);
    if (R.slowmo) txt_printo(24, 1, "SL", P_CYAN);
    if (R.diff == D_EXTREME) { txt_printo(27, 1, "R", P_RED); txt_num(28, 1, R.rank > 99 ? 99 : R.rank, 2, P_RED, 1); }
    else if (R.nrelics) { txt_printo(27, 1, "*", P_GREEN); txt_num(28, 1, R.nrelics, 1, P_GREEN, 1); }
meter:
    // power meter (row 19)
    txt_fill(0, 19, 30, 1, FONT_O);
    for (int s = 0; s < 7; s++) {
        int pal = (R.hi == s) ? P_HI : pu_maxed(R.slots[s]) ? P_GREY : (s == 0 ? P_YELLOW : P_CYAN);
        const char *l = pu_label[R.slots[s]];
        for (int k = 0; k < 3; k++) txt_put(1 + s * 4 + k, 19, (FONT_O + l[k] - 32) | (pal << 12));
        if (R.hi == s) txt_put(1 + s * 4 + 3, 19, (FONT_O) | (P_HI << 12));
    }
    // boss bar (row 2)
    if (B.alive && phase == P_BOSS) {
        txt_print(0, 2, "BOSS", P_RED);
        int cells = 20, fill = B.hp * cells * 2 / B.maxhp;
        for (int i = 0; i < cells; i++) {
            int v = fill - i * 2;
            int tl = v >= 2 ? UI_BAR_FULL : v == 1 ? UI_BAR_HALF : UI_BAR_EMPTY;
            txt_put(5 + i, 2, (UI_BASE + tl) | (P_UI << 12));
        }
    } else txt_clear_rows(2, 2);
    // banners
    if (ban_t > 0) {
        if (--ban_t == 0) txt_clear_rows(8, 10);
        else {
            if (ban1) txt_center(8, ban1, ban_pal);
            if (ban2) txt_center(10, ban2, P_WHITE);
        }
    }
    if (pop_t > 0) {
        if (--pop_t == 0) txt_clear_rows(17, 17);
        else txt_center(17, pop, P_YELLOW);
    }
}

// ---------------------------------------------------------------- pause
static void draw_pause(void)
{
    txt_box(2, 3, 26, 15);
    txt_printo(11, 4, "- PAUSED -", P_YELLOW);
    txt_printo(4, 6, ship_defs[R.ship].name, P_CYAN);
    txt_printo(19, 6, diff_name[R.diff], P_WHITE);
    txt_printo(4, 7, "SEED", P_GREY);
    char hx[9]; for (int i = 0; i < 8; i++) { int v = (R.seed >> (28 - i * 4)) & 15; hx[i] = v < 10 ? '0' + v : 'A' + v - 10; } hx[8] = 0;
    txt_printo(9, 7, hx, P_WHITE);
    if (R.diff == D_EXTREME) { txt_printo(19, 7, "RANK", P_RED); txt_num(24, 7, R.rank, 3, P_RED, 1); }
    txt_printo(4, 9, "RELICS", P_GREEN);
    int row = 10;
    if (!R.nrelics) txt_printo(4, row++, "NONE YET - BEAT BOSSES", P_GREY);
    for (int i = 0; i < NUM_RELICS && row < 15; i++) if (R.relics[i]) {
        txt_printo(4, row, relic_name[i], P_WHITE);
        txt_printo(18, row, relic_desc[i], P_GREY);
        row++;
    }
    txt_printo(4, 16, "START:RESUME SELECT:QUIT", P_GREY);
}

// ---------------------------------------------------------------- update
static int fire_toggle;
static int fire_down(void)
{
    switch (g_set[S_AUTOFIRE]) {
    case 1: return fire_toggle;
    case 2: return 1;
    }
    return key_is_down(fire_key());
}
static void update_player(void)
{
    if (key_hit(fire_key())) fire_toggle ^= 1;
    const ShipDef *sd = &ship_defs[R.ship];
    int spd = sd->speed + R.speed_lv * 0x48 + R.speed_bonus * 0x30;
    int dx = key_tri_horz(), dy = key_tri_vert();
    if (dx && dy) spd = spd * 181 >> 8;
    if (dx || dy) {
        px += dx * spd; py += dy * spd;
        if (px < FX(8)) px = FX(8);
        if (px > FX(228)) px = FX(228);
        if (py < FX(22)) py = FX(22);
        if (py > FX(144)) py = FX(144);
        hist_i = (hist_i + 1) & 31;
        hist_x[hist_i] = px; hist_y[hist_i] = py;
    }
    if (p_inv) p_inv--;
    if (p_shot_t > 0) p_shot_t--;
    if (fire_down() && p_shot_t == 0) {
        fire_pattern(px, py);
        for (int o = 0; o < R.options; o++) {
            int hi = (hist_i - 10 * (o + 1)) & 31;
            fire_pattern(hist_x[hi], hist_y[hi]);
        }
        p_shot_t = shot_interval();
        sfx(SFX_SHOT);
    }
    if (R.missile_lv && fire_down() && --p_msl_t <= 0) {
        ps_add(px, py + FX(4), 0x200, 0x140, SPR_SHOT_MISSILE, 8, 2 + R.dmg_bonus, 0, 1);
        if (R.missile_lv >= 2) ps_add(px, py - FX(4), 0x200, -0x140, SPR_SHOT_MISSILE, 8, 2 + R.dmg_bonus, 0, 1);
        p_msl_t = 36;
    }
    if (bomb_cd) bomb_cd--;
    if (key_hit(bomb_key()) && R.bombs && !bomb_cd) {
        R.bombs--; bomb_cd = 50; p_inv = p_inv > 70 ? p_inv : 70;
        if (R.diff == D_EXTREME) R.rank = R.rank > 10 ? R.rank - 10 : 0;
        sfx(SFX_BOMB); flash_t = 8; vid_shake(16);
        for (int i = 0; i < MAX_EB; i++) if (eb[i].alive) { eb[i].alive = 0; R.score += 10; if (frnd(3) == 0) fx_add(eb[i].x >> 8, eb[i].y >> 8, 1); }
        for (int i = 0; i < MAX_EN; i++) if (en[i].alive && en[i].x < FX(244)) { en[i].hp -= 12; en[i].flash = 6; if (en[i].hp <= 0) kill_enemy(&en[i]); }
        if (B.alive && !B.inv && B.x < FX(230)) { B.hp -= B.maxhp / 12; B.flash = 8; }
    }
    if (key_hit(KEY_L) && R.hi >= 0) {
        int pu = R.slots[R.hi];
        if (pu_maxed(pu)) { sfx(SFX_MENU); }
        else {
            pu_apply(pu); R.hi = -1; sfx(SFX_POWERUP);
            pop = pu_name[pu]; pop_t = 70; txt_clear_rows(17, 17);
        }
    }
    if (g_debug && key_hit(KEY_R)) { R.hi = (R.hi + 1) % 7; }
    if (g_debug && key_hit(KEY_SELECT) && phase == P_WAVES) lvl_t = lvl_len;
    else if (g_debug && key_hit(KEY_SELECT) && phase == P_BOSS && !B.inv) { B.hp -= B.maxhp / 3 + 1; B.flash = 8; }
}

static void update_shots(void)
{
    for (int i = 0; i < MAX_PS; i++) {
        PShot *s = &ps[i];
        if (!s->alive) continue;
        s->t++;
        if (s->kind == 1 && R.homing && s->t > 6) {   // homing missile
            s32 best = 0x7fffffff, tx = 0, ty = 0;
            for (int k = 0; k < MAX_EN; k++) if (en[k].alive) {
                s32 d = ((en[k].x - s->x) >> 8) * ((en[k].x - s->x) >> 8) + ((en[k].y - s->y) >> 8) * ((en[k].y - s->y) >> 8);
                if (d < best) { best = d; tx = en[k].x; ty = en[k].y; }
            }
            if (B.alive && phase == P_BOSS) { tx = B.x; ty = B.y; best = 0; }
            if (best != 0x7fffffff) {
                u16 a = iatan2((ty - s->y) >> 8, (tx - s->x) >> 8);
                s->vx = (s->vx * 3 + ((lu_cos(a) * 0x300) >> 12)) / 4;
                s->vy = (s->vy * 3 + ((lu_sin(a) * 0x300) >> 12)) / 4;
            }
        }
        s->x += s->vx; s->y += s->vy;
        if (s->x > FX(248) || s->y < FX(10) || s->y > FX(160) || s->x < -FX(8)) { s->alive = 0; continue; }
        int hw = s->size == 16 ? 6 : 4;
        for (int k = 0; k < MAX_EN && s->alive; k++) {
            Enemy *e = &en[k];
            if (!e->alive || e->x > FX(244)) continue;
            const EDef *d = &edefs[e->kind];
            if (ABS(e->x - s->x) < FX(d->hw + hw) && ABS(e->y - s->y) < FX(d->hh + hw)) {
                e->hp -= s->dmg; e->flash = 3;
                if (e->hp <= 0) kill_enemy(e); else sfx(SFX_ENHIT);
                if (!s->pierce) s->alive = 0;
                else { s->dmg = s->dmg > 1 ? s->dmg : 1; }
            }
        }
        if (s->alive && B.alive && phase == P_BOSS && ABS(B.x - s->x) < FX(B.hw + hw) && ABS(B.y - s->y) < FX(B.hh + hw)) {
            if (!B.inv) { B.hp -= s->dmg; B.flash = 2; add_score(10); }
            s->alive = 0;
            fx_add(s->x >> 8, s->y >> 8, 1);
        }
    }
}

static void update_enemies(void)
{
    for (int i = 0; i < MAX_EN; i++) {
        Enemy *e = &en[i];
        if (!e->alive) continue;
        const EDef *d = &edefs[e->kind];
        e->t++;
        if (e->flash) e->flash--;
        switch (e->mv) {
        case MV_STRAIGHT: e->x += e->vx; e->y += e->vy; break;
        case MV_SINE: e->x += e->vx; e->y = e->by + lu_sin(e->t * e->a) * e->b / 16; break;
        case MV_DIVE:
            e->x += e->vx;
            if (e->t > e->a) {
                if (py > e->y + FX(4)) e->vy += 0x14; else if (py < e->y - FX(4)) e->vy -= 0x14;
                if (e->vy > 0x180) e->vy = 0x180;
                if (e->vy < -0x180) e->vy = -0x180;
            }
            e->y += e->vy;
            break;
        case MV_STOP:
            if (e->t < e->a || e->t > e->a + e->b) e->x += e->vx;
            e->y += (py > e->y ? 0x30 : -0x30);
            break;
        case MV_POP:
            e->x += e->vx;
            if (e->t < e->a) e->y += e->vy;
            else if (e->t > e->a + e->b) e->y -= e->vy;
            break;
        case MV_BOUNCE:
            e->x += e->vx; e->y += e->vy;
            if (e->y < FX(26) || e->y > FX(144)) e->vy = -e->vy;
            break;
        }
        if (e->x < -FX(24) || e->x > FX(300) || e->y < -FX(24) || e->y > FX(186)) { e->alive = 0; continue; }
        // fire
        if (d->fire && e->x < FX(232) && e->x > FX(30) && --e->ft <= 0) {
            e->ft = ((d->fint * firemul) >> 8) + rnd(20);
            switch (d->fire) {
            case F_AIM: eb_fire(e->x, e->y, aim(e->x, e->y), 0x180, EB_PELLET); break;
            case F_AIM3: fan(e->x, e->y, 3, 0x0900, 0x170, EB_PELLET); break;
            case F_RING: ring(e->x, e->y, 6, frng(), 0x100, EB_PELLET); break;
            case F_STAR: fan(e->x, e->y, 3, 0x0B00, 0x150, EB_STAR); break;
            }
        }
        // body collision
        if (!p_dead && ABS(e->x - px) < FX(d->hw + 2) && ABS(e->y - py) < FX(d->hh + 1)) {
            player_hit();
            if (e->kind != EK_HEAVY && e->kind != EK_GUMMY) { e->hp = 0; kill_enemy(e); }
        }
    }
}

static void update_bullets(void)
{
    int slow = R.slowmo > 0;
    for (int i = 0; i < MAX_EB; i++) {
        EBullet *b = &eb[i];
        if (!b->alive) continue;
        if (slow) { b->x += b->vx >> 1; b->y += b->vy >> 1; }
        else { b->x += b->vx; b->y += b->vy; }
        if (b->x < -FX(8) || b->x > FX(248) || b->y < FX(12) || b->y > FX(156)) { b->alive = 0; continue; }
        if (!p_dead && ABS(b->x - px) < FX(3) && ABS(b->y - py) < FX(3)) { b->alive = 0; player_hit(); }
    }
}

static void update_items(void)
{
    for (int i = 0; i < MAX_IT; i++) {
        Item *m = &it[i];
        if (!m->alive) continue;
        m->t++;
        s32 dx = px - m->x, dy = py - m->y;
        int near = ABS(dx) < FX(28) && ABS(dy) < FX(28);
        if ((R.magnet && ABS(dx) < FX(90) && ABS(dy) < FX(90)) || near) {
            m->x += dx > 0 ? 0x180 : -0x180; m->y += dy > 0 ? 0x180 : -0x180;
        } else {
            m->x -= 0x80;
            m->y += lu_sin(m->t * 600) >> 6;
        }
        if (m->x < -FX(8)) { m->alive = 0; continue; }
        if (!p_dead && ABS(dx) < FX(10) && ABS(dy) < FX(10)) {
            m->alive = 0;
            if (m->type == 0) { R.hi = (R.hi + 1) % 7; add_score(500); sfx(SFX_PICKUP); }
            else { R.coins += R.coin_mul; if (R.coins > 999) R.coins = 999; add_score(50); sfx(SFX_COIN); }
        }
    }
    for (int i = 0; i < MAX_FX; i++) if (fx[i].alive) {
        fx[i].t++;
        fx[i].x -= (g_frame & 1);
        if (fx[i].t >= (fx[i].kind == 0 ? 20 : 10)) fx[i].alive = 0;
    }
}

void game_update(void)
{
    if (paused) {
        if (key_hit(KEY_START)) { paused = 0; txt_clear_rows(3, 18); sfx(SFX_MENU); }
        else if (key_hit(KEY_SELECT)) { paused = 0; txt_clear_rows(3, 18); set_state(ST_GAMEOVER); }
        return;
    }
    if (key_hit(KEY_START) && (phase == P_WAVES || phase == P_BOSS || phase == P_INTRO || phase == P_WARN)) {
        paused = 1; draw_pause(); sfx(SFX_MENU); return;
    }
    g_far_x += 0x40; g_near_x += 0x100;
    phase_t++;
    if (R.slowmo) R.slowmo--;
    if (R.x2) R.x2--;
    if (!p_dead) {
        nohit_t++;
        if (R.diff == D_EXTREME && nohit_t % 120 == 0 && R.rank < 100) R.rank++;
        update_player();
    }
    // level phase machine
    switch (phase) {
    case P_INTRO:
        if (phase_t > 60) { phase = P_WAVES; phase_t = 0; }
        break;
    case P_WAVES:
        lvl_t++;
        if (--wave_t <= 0) spawn_wave();
        if (lvl_t >= lvl_len) { phase = P_WARN; phase_t = 0; }
        break;
    case P_WARN:
        if (phase_t == 90) { banner("WARNING!", boss_names[R.sub == 0 ? 0 : R.sub == 1 ? (R.route == ROUTE_NIGHT ? 1 : 2) : (R.route == ROUTE_NIGHT ? 3 : 4)], 150, P_RED); sfx(SFX_WARNING); music_stop(); }
        if (phase_t == 200) { boss_spawn(); music_play(MUS_BOSS); }
        if (phase_t > 200) { phase = P_BOSS; phase_t = 0; }
        break;
    case P_BOSS:
        boss_update();
        if (B.hp <= 0) {
            phase = P_BOSSDIE; phase_t = 0;
            boss_clear_bullets();
            add_score(R.sub == 2 ? 50000 : 10000);
            music_stop();
        }
        break;
    case P_BOSSDIE:
        B.flash = phase_t & 2;
        if (phase_t % 8 == 0) { fx_add((B.x >> 8) + frnd(B.size) - B.size / 2, (B.y >> 8) + frnd(B.size) - B.size / 2, 0); sfx(SFX_EXPLODE); vid_shake(4); }
        if (phase_t == 100) {
            B.alive = 0; sfx(SFX_BIGEXPLODE); flash_t = 6; vid_shake(20);
            R.bosses++; R.subs_cleared++;
            int r = rnd(NUM_RELICS);
            while (R.relics[r] && R.nrelics < NUM_RELICS) r = (r + 1) % NUM_RELICS;
            run_grant_relic(r);
            add_score(5000 * (R.sub + 1) + R.shields * 2000);
            R.coins += 10 * (R.sub + 1);
            banner("SUB-LEVEL CLEAR!", relic_name[r], 230, P_YELLOW);
            pop = relic_desc[r]; pop_t = 230;
            music_play(MUS_CLEAR);
            phase = P_CLEAR; phase_t = 0;
        }
        break;
    case P_CLEAR:
        for (int i = 0; i < MAX_IT; i++) if (it[i].alive) { it[i].x += (px - it[i].x) / 8; it[i].y += (py - it[i].y) / 8; }
        if (phase_t > 240) {
            if (R.sub < 2) set_state(ST_FORK); else set_state(ST_CLEAR);
        }
        break;
    case P_DEAD:
        if (phase_t > 120) set_state(ST_GAMEOVER);
        break;
    }
    update_shots();
    update_enemies();
    update_bullets();
    update_items();
    // flash effect
    if (flash_t) { flash_t--; vid_flash(flash_t && (flash_t & 2), themes[R.theme].pal[0]); }
    game_draw_hud();
    game_draw_sprites();
}

void game_draw_sprites(void)
{
    oam_begin();
    for (int i = 0; i < MAX_EB; i++) if (eb[i].alive)
        spr((eb[i].x >> 8) - 4, (eb[i].y >> 8) - 4, eb_spr[eb[i].type], 8, 15, 0);
    if (!p_dead && !(p_inv & 2)) {
        int f = (g_frame >> 2) & 1;
        spr((px >> 8) - 8, (py >> 8) - 8, (R.ship == SHIP_JET ? SPR_SHIP_JET : R.ship == SHIP_PAPER ? SPR_SHIP_PAPER : R.ship == SHIP_PENGUIN ? SPR_SHIP_PENGUIN : SPR_SHIP_TOASTER) + f * 4, 16, 0, 0);
    }
    if (!p_dead) for (int o = 0; o < R.options; o++) {
        int hi = (hist_i - 10 * (o + 1)) & 31;
        spr((hist_x[hi] >> 8) - 4, (hist_y[hi] >> 8) - 4, SPR_OPTION + ((g_frame >> 3) & 1), 8, 0, 0);
    }
    for (int i = 0; i < MAX_IT; i++) if (it[i].alive) {
        int f = (it[i].t >> 3) & 1;
        spr((it[i].x >> 8) - 4, (it[i].y >> 8) - 4, (it[i].type == 0 ? SPR_CAPSULE : SPR_COIN) + f, 8, 0, 0);
    }
    for (int i = 0; i < MAX_PS; i++) if (ps[i].alive) {
        int t = ps[i].spr;
        if (t == SPR_SHOT_RIPPLE) t += (ps[i].t > 8) * 4;
        int h = ps[i].size / 2;
        spr((ps[i].x >> 8) - h, (ps[i].y >> 8) - h, t, ps[i].size, 0, 0);
    }
    for (int i = 0; i < MAX_EN; i++) if (en[i].alive) {
        const EDef *d = &edefs[en[i].kind];
        int f = (en[i].t >> 3) & 1;
        spr((en[i].x >> 8) - 8, (en[i].y >> 8) - 8, d->spr + f * 4, 16, (en[i].flash && (g_frame & 1) == 0) ? 8 : en[i].pal, 0);
    }
    for (int i = 0; i < MAX_FX; i++) if (fx[i].alive) {
        if (fx[i].kind == 0) spr(fx[i].x - 8, fx[i].y - 8, SPR_EXPLODE + (fx[i].t / 5) * 4, 16, 1, 0);
        else spr(fx[i].x - 4, fx[i].y - 4, SPR_SPARK + (fx[i].t / 5), 8, 1, 0);
    }
    if (B.alive) {
        int f = (B.t >> 4) & 1;
        int tiles = (B.size / 8) * (B.size / 8);
        spr((B.x >> 8) - B.size / 2, (B.y >> 8) - B.size / 2, B.spr + f * tiles, B.size, (B.flash && (g_frame & 3) == 0) ? 8 : B.pal, 0);
    }
    oam_end();
}
