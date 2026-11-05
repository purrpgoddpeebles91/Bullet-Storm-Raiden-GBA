// Run state, ship / power-up / relic tables
#include "common.h"

Run R;

const ShipDef ship_defs[NUM_SHIPS] = {
    { "NX-7 NIGHTJET", "BALANCED WAR JET. FAST DASH SHOTS.", 0x200, 7, 1, SPR_SHOT_DASH, "DASH" },
    { "PAPER DREAM",   "A FOLDED SCHOOL PLANE. QUICK, 3-WAY.", 0x280, 11, 1, SPR_SHOT_PAPER, "3-WAY" },
    { "SGT. WADDLES",  "BATTLE PENGUIN. SLOW. HEAVY FISH.", 0x180, 13, 3, SPR_SHOT_FISH, "FISH" },
    { "TOAST-R",       "A BRAVE TOASTER. TWIN TOAST VOLLEY.", 0x220, 9, 1, SPR_SHOT_TOAST, "TWIN" },
};

const char *pu_label[NUM_PU] = { "SPD", "MSL", "DBL", "LSR", "OPT", "SHD", "RIP", "SPR", "HOM", "BM+", "SLO", "X2 ", "MAG", "HAM", "RAP" };
const char *pu_name[NUM_PU] = { "SPEED UP", "MISSILE", "DOUBLE", "LASER", "OPTION", "SHIELD", "RIPPLE", "SPREAD",
    "HOMING", "BOMB +1", "SLOW-MO", "SCORE X2", "MAGNET", "TOY HAMMER", "RAPID" };
const char *pu_desc[NUM_PU] = {
    "MOVE FASTER (X4)", "GROUND MISSILES (X2)", "EXTRA UP-ANGLE SHOT", "PIERCING BEAM",
    "TRAILING ORB COPIES YOU (X2)", "+2 SHIELD HITS", "WIDE PIERCING RINGS", "5-WAY FAN",
    "MISSILES SEEK FOES", "ONE MORE BOMB", "SLOW BULLETS 10 SEC", "DOUBLE SCORE 15 SEC",
    "PULL IN COINS+CAPSULES", "BONK! BULLETS TO COINS", "FASTER FIRE (X2)" };

const char *relic_name[NUM_RELICS] = { "IRON HEART", "QUICK TRIGGER", "STAR LENS", "LUCKY DIE",
    "FEATHER", "COIN CHARM", "SLOW CLOCK", "BOMB SATCHEL" };
const char *relic_desc[NUM_RELICS] = { "SHIELD +1", "FIRE RATE UP", "SHOT DAMAGE +1", "MORE CAPSULES",
    "SPEED UP", "COINS X2", "ENEMY SHOTS -12%", "BOMBS +2" };
const char *diff_name[4] = { "EASY", "NORMAL", "HARD", "EXTREME" };

void roll_meter(void)
{
    // slot 0 = player's pick; slots 1..6 rolled from the pool without duplicates
    u8 pool[NUM_PU]; int n = 0;
    for (int i = 0; i < NUM_PU; i++) if (i != R.slot1) pool[n++] = i;
    R.slots[0] = R.slot1;
    for (int s = 1; s < 7; s++) {
        int k = rnd(n);
        R.slots[s] = pool[k];
        pool[k] = pool[--n];
    }
    R.hi = -1;
}

void run_new(void)
{
    u32 seed = R.seed; u8 diff = R.diff, ship = R.ship, slot1 = R.slot1;
    memset(&R, 0, sizeof(R));
    R.seed = seed; R.diff = diff; R.ship = ship; R.slot1 = slot1;
    rng_seed(seed);
    R.bombs = 2 + g_save.up_bomb;
    static const u8 sh[4] = { 4, 3, 3, 2 };   // starting shields (hit points) per difficulty
    R.shields = sh[diff] + g_save.up_shield;
    R.luck = g_save.up_luck;
    R.weapon_lv = 1;
    R.coin_mul = 1;
    R.rank = 20;
    if (ship == SHIP_PENGUIN) R.bombs++;
    R.new_mem = 255;
    roll_meter();
    memset(&g_stats, 0, sizeof(g_stats));
    g_stats.magic = 0x53544154; g_stats.diff = diff;
}

int pu_maxed(int pu)
{
    switch (pu) {
    case PU_SPEED: return R.speed_lv >= 4;
    case PU_MISSILE: return R.missile_lv >= 2;
    case PU_DOUBLE: return R.weapon == W_DOUBLE && R.weapon_lv >= 3;
    case PU_LASER: return R.weapon == W_LASER && R.weapon_lv >= 3;
    case PU_RIPPLE: return R.weapon == W_RIPPLE && R.weapon_lv >= 3;
    case PU_SPREAD: return R.weapon == W_SPREAD && R.weapon_lv >= 3;
    case PU_OPTION: return R.options >= 2;
    case PU_SHIELD: return R.shields >= 6;
    case PU_HOMING: return R.homing;
    case PU_BOMB: return R.bombs >= 6;
    case PU_MAGNET: return R.magnet;
    case PU_RAPID: return R.rapid >= 2;
    }
    return 0;
}

static void set_weapon(int w)
{
    if (R.weapon == w) { if (R.weapon_lv < 3) R.weapon_lv++; }
    else { R.weapon = w; R.weapon_lv = 1; }
}

void game_hammer(void);
void pu_apply(int pu)
{
    switch (pu) {
    case PU_SPEED: R.speed_lv++; break;
    case PU_MISSILE: R.missile_lv++; break;
    case PU_DOUBLE: set_weapon(W_DOUBLE); break;
    case PU_LASER: set_weapon(W_LASER); break;
    case PU_RIPPLE: set_weapon(W_RIPPLE); break;
    case PU_SPREAD: set_weapon(W_SPREAD); break;
    case PU_OPTION: R.options++; break;
    case PU_SHIELD: R.shields += 2; if (R.shields > 6) R.shields = 6; break;
    case PU_HOMING: R.homing = 1; if (!R.missile_lv) R.missile_lv = 1; break;
    case PU_BOMB: R.bombs++; break;
    case PU_SLOWMO: R.slowmo = 600; break;
    case PU_X2: R.x2 = 900; break;
    case PU_MAGNET: R.magnet = 1; break;
    case PU_HAMMER: game_hammer(); break;
    case PU_RAPID: R.rapid++; break;
    }
}

void run_grant_relic(int r)
{
    if (R.relics[r]) {        // duplicate: pick another free one
        for (int i = 0; i < NUM_RELICS; i++) if (!R.relics[(r + i) % NUM_RELICS]) { r = (r + i) % NUM_RELICS; break; }
        if (R.relics[r]) { R.score += 5000; return; }
    }
    R.relics[r] = 1; R.nrelics++;
    switch (r) {
    case 0: if (R.shields < 6) R.shields++; break;
    case 1: R.fire_bonus++; break;
    case 2: R.dmg_bonus++; break;
    case 3: R.luck += 2; break;
    case 4: R.speed_bonus++; break;
    case 5: R.coin_mul = 2; break;
    case 6: R.bslow = 1; break;
    case 7: R.bombs += 2; if (R.bombs > 6) R.bombs = 6; break;
    }
}
