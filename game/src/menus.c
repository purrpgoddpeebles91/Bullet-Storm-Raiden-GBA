// Bullet Storm Raiden - title, selects, dialogue, fork, shop/events, results, workshop
#include "common.h"

static int sel, tmr;
static OBJ_AFFINE *const aff = (OBJ_AFFINE *)obj_buffer;

static int ship_tile(int s)
{
    static const u16 t[NUM_SHIPS] = { SPR_SHIP_JET, SPR_SHIP_PAPER, SPR_SHIP_PENGUIN, SPR_SHIP_TOASTER };
    return t[s];
}
static void menu_scroll(void) { g_far_x += 0x30; }
static int menu_move(int n)
{
    if (key_hit(KEY_UP)) { sel = (sel + n - 1) % n; sfx(SFX_MENU); return 1; }
    if (key_hit(KEY_DOWN)) { sel = (sel + 1) % n; sfx(SFX_MENU); return 1; }
    return 0;
}
// 2x zoomed sprite via affine matrix 0
static void spr_big(int x, int y, int tile, int pal)
{
    if (g_oam >= 127) return;
    aff[0].pa = 0x80; aff[0].pb = 0; aff[0].pc = 0; aff[0].pd = 0x80;
    OBJ_ATTR *o = &obj_buffer[g_oam++];
    o->attr0 = ATTR0_SQUARE | ATTR0_4BPP | ATTR0_AFF_DBL | ATTR0_Y(y & 255);
    o->attr1 = ATTR1_SIZE_16 | ATTR1_AFF_ID(0) | ATTR1_X(x & 511);
    o->attr2 = ATTR2_ID(tile) | ATTR2_PALBANK(pal) | ATTR2_PRIO(1);
}

// ---------------------------------------------------------------- title
static int title_menu;
static int title_return_menu;    // came back from GAME SETTINGS: reopen the menu on that entry
static const char *const tribute[2] = { "A TRIBUTE TO GRADIUS RAIDEN", "DODONPACHI R-TYPE PARODIUS" };
static void title_menu_draw(void)
{
    static const char *items[3] = { "START RUN", "DREAM WORKSHOP", "GAME SETTINGS" };
    for (int i = 0; i < 3; i++) {
        txt_print(7, 12 + i, sel == i ? ">" : " ", P_YELLOW);
        txt_print(9, 12 + i, items[i], sel == i ? P_YELLOW : P_WHITE);
    }
}
void title_enter(void)
{
    video_menu_mode(1);
    sel = 0; tmr = 0; title_menu = 0;
    txt_center(8, "~ A DREAM WAR ~", P_PINK);
    txt_center(9, tribute[0], P_GREY);
    // credits: opaque text on a dark panel, above every sprite, always visible
    txt_fill(0, 16, 30, 3, FONT_O);
    txt_printo(0, 16, "MADE FOR GITHUB GAME OFF 2026", P_CYAN);
    txt_printo(1, 17, "A GAME DEVELOPED AND CREATED", P_WHITE);
    txt_printo(6, 18, "BY ZACHARY PEEBLES", P_YELLOW);
    txt_print(1, 19, "HI", P_YELLOW); txt_num(4, 19, g_save.hiscore, 7, P_WHITE, 0);
    txt_print(13, 19, "DC", P_PINK); txt_num(16, 19, g_save.dreamcoins, 5, P_WHITE, 0);
    if (g_debug) txt_print(25, 19, "DEBUG", P_RED);
    if (title_return_menu) { title_return_menu = 0; title_menu = 1; sel = 2; title_menu_draw(); }
    music_play(MUS_W1);
}
void title_update(void)
{
    menu_scroll();
    tmr++;
    if ((tmr & 127) == 0) { txt_clear_rows(9, 9); txt_center(9, tribute[(tmr >> 7) & 1], P_GREY); }
    if (key_is_down(KEY_L) && key_is_down(KEY_R) && key_hit(KEY_SELECT)) {
        g_debug ^= 1; sfx(SFX_SELECT);
        txt_print(25, 19, g_debug ? "DEBUG" : "     ", P_RED);
    }
    if (!title_menu) {
        txt_center(12, (tmr & 32) ? "PRESS START" : "           ", P_YELLOW);
        txt_center(14, "DPAD:MOVE A:FIRE B:BOMB L:CASH", P_WHITE);
        if (key_hit(KEY_START) || key_hit(KEY_A)) {
            title_menu = 1; sel = 0; sfx(SFX_SELECT);
            R.seed = (g_frame * 2654435761u) ^ (REG_VCOUNT << 16) ^ 0xD2EA3;
            txt_clear_rows(12, 14);
            title_menu_draw();
        }
    } else {
        if (menu_move(3)) title_menu_draw();
        if (key_hit(KEY_A) || key_hit(KEY_START)) {
            sfx(SFX_SELECT);
            R.earned = 0;
            if (sel == 2) title_return_menu = 1;
            set_state(sel == 0 ? ST_DIFF : sel == 1 ? ST_WORKSHOP : ST_SETTINGS);
        }
        if (key_hit(KEY_B)) { title_menu = 0; txt_clear_rows(12, 14); }
    }
    // a little jet flies across the title, in its own band (rows 10-11) so it never covers text
    oam_begin();
    int x = (tmr * 2) % 400 - 40;
    spr(x, 81 + (lu_sin(tmr * 400) >> 11), SPR_SHIP_JET + ((tmr >> 2) & 1) * 4, 16, 0, 0);
    spr(x - 50, 80, SPR_EN_RING + ((tmr >> 3) & 1) * 4, 16, 2, 0);
    spr(x - 80, 82, SPR_EN_FIGHTER + ((tmr >> 3) & 1) * 4, 16, 2, 0);
    oam_end();
}

// ---------------------------------------------------------------- difficulty
static const char *diff_desc[4] = {
    "EASY, BUT A LITTLE CHALLENGING. SLOWER BULLETS, 3 SHIELDS.",
    "PERFECTLY NORMAL. THE WAY THE DREAM WAS MEANT TO BE. 2 SHIELDS.",
    "A NOTCH ABOVE NORMAL. FASTER, DENSER FIRE. 1 SHIELD.",
    "ADAPTIVE AND ROUGH. PLAY WELL AND THE STORM GROWS WILDER.",
};
void diff_enter(void)
{
    video_menu_mode(0);
    sel = R.diff;
    txt_center(2, "SELECT DIFFICULTY", P_YELLOW);
    txt_box(3, 4, 24, 8);
    txt_box(1, 13, 28, 6);
    txt_center(19, "A:OK  B:BACK", P_GREY);
}
void diff_update(void)
{
    menu_scroll();
    menu_move(4);
    static const u8 pc[4] = { P_GREEN, P_CYAN, P_YELLOW, P_RED };
    for (int i = 0; i < 4; i++) {
        txt_printo(7, 5 + i + (i > 0) * 0, sel == i ? ">" : " ", P_YELLOW);
        txt_printo(9, 5 + i, diff_name[i], sel == i ? pc[i] : P_GREY);
        txt_printo(18, 5 + i, "        ", P_WHITE);
    }
    txt_fill(2, 14, 26, 4, FONT_O);
    txt_wrap(3, 14, 24, diff_desc[sel], P_WHITE, -1);
    if (key_hit(KEY_A)) { R.diff = sel; sfx(SFX_SELECT); set_state(ST_SHIP); }
    if (key_hit(KEY_B)) { set_state(ST_TITLE); }
    oam_begin(); oam_end();
}

// ---------------------------------------------------------------- ship select
static int ship_unlocked(int s) { return s != SHIP_TOASTER || (g_save.unlocked & 1); }
static void ship_info(void)
{
    txt_fill(1, 11, 28, 7, (UI_BASE + UI_FILL) | (P_UI << 12));
    const ShipDef *d = &ship_defs[sel];
    if (!ship_unlocked(sel)) {
        txt_printo(3, 12, "??? LOCKED ???", P_RED);
        txt_wrap(3, 13, 24, "UNLOCK IN THE DREAM WORKSHOP FOR 120 DREAM COINS.", P_GREY, -1);
        return;
    }
    txt_printo(3, 12, d->name, P_CYAN);
    txt_wrap(3, 13, 24, d->desc, P_WHITE, -1);
    static const char *bars[] = { "*    ", "**   ", "***  ", "**** ", "*****" };
    int sp = (d->speed - 0x140) / 0x40; if (sp < 0) sp = 0; if (sp > 4) sp = 4;
    int pw = d->dmg * (sel == SHIP_PAPER || sel == SHIP_TOASTER ? 2 : 1) + 1; if (pw > 4) pw = 4;
    int rt = (14 - d->shotint) / 2; if (rt > 4) rt = 4; if (rt < 0) rt = 0;
    txt_printo(3, 15, "SPEED", P_GREY); txt_printo(9, 15, bars[sp], P_YELLOW);
    txt_printo(16, 15, "SHOT", P_GREY); txt_printo(21, 15, d->shotname, P_YELLOW);
    txt_printo(3, 16, "POWER", P_GREY); txt_printo(9, 16, bars[pw], P_YELLOW);
    txt_printo(16, 16, "RATE", P_GREY); txt_printo(21, 16, bars[rt], P_YELLOW);
}
void ship_enter(void)
{
    video_menu_mode(0);
    sel = R.ship < NUM_SHIPS ? R.ship : 0;
    if (!ship_unlocked(sel)) sel = 0;
    txt_center(1, "SELECT YOUR SHIP", P_YELLOW);
    txt_box(0, 10, 30, 9);
    txt_center(19, "<> CHOOSE   A:OK   B:BACK", P_GREY);
    ship_info();
}
void ship_update(void)
{
    menu_scroll();
    tmr++;
    if (key_hit(KEY_LEFT)) { sel = (sel + NUM_SHIPS - 1) % NUM_SHIPS; sfx(SFX_MENU); ship_info(); }
    if (key_hit(KEY_RIGHT)) { sel = (sel + 1) % NUM_SHIPS; sfx(SFX_MENU); ship_info(); }
    if (key_hit(KEY_A)) {
        if (ship_unlocked(sel)) { R.ship = sel; sfx(SFX_SELECT); set_state(ST_SLOT); }
        else sfx(SFX_HIT);
    }
    if (key_hit(KEY_B)) set_state(ST_DIFF);
    oam_begin();
    for (int i = 0; i < NUM_SHIPS; i++) {
        int x = 30 + i * 52, y = 28;
        if (i == sel) {
            spr_big(x - 8, y - 8 + (lu_sin(tmr * 500) >> 11), ship_tile(i) + ((tmr >> 2) & 1) * 4, ship_unlocked(i) ? 0 : 8);
        } else spr(x, y, ship_tile(i), 16, ship_unlocked(i) ? 0 : 8, 0);
    }
    oam_end();
    // dim lock indicator
    for (int i = 0; i < NUM_SHIPS; i++) txt_print(3 + i * 7 - 1, 7, ship_unlocked(i) ? "      " : "LOCKED", P_RED);
}

// ---------------------------------------------------------------- slot 1 choice
static const u8 slot_choices[6] = { PU_SPEED, PU_MISSILE, PU_DOUBLE, PU_LASER, PU_OPTION, PU_SHIELD };
void slot_enter(void)
{
    video_menu_mode(0);
    sel = 0;
    for (int i = 0; i < 6; i++) if (slot_choices[i] == R.slot1) sel = i;
    txt_center(1, "POWER METER: PICK SLOT 1", P_YELLOW);
    txt_wrap(1, 3, 28, "SLOT 1 IS YOURS. THE OTHER 6 SLOTS ARE ROLLED FRESH EVERY RUN. CAPSULES MOVE THE LIGHT, L CASHES IN.", P_GREY, -1);
    txt_box(2, 7, 26, 10);
    txt_center(19, "A:OK  B:BACK", P_GREY);
}
void slot_update(void)
{
    menu_scroll();
    menu_move(6);
    for (int i = 0; i < 6; i++) {
        int p = slot_choices[i];
        txt_printo(4, 8 + i, sel == i ? ">" : " ", P_YELLOW);
        txt_printo(6, 8 + i, pu_name[p], sel == i ? P_YELLOW : P_WHITE);
        txt_printo(17, 8 + i, "         ", P_WHITE);
        txt_printo(17, 8 + i, pu_label[p], sel == i ? P_HI : P_CYAN);
    }
    txt_fill(3, 15, 24, 1, FONT_O);
    txt_printo(4, 15, pu_desc[slot_choices[sel]], P_GREEN);
    // meter preview
    txt_fill(0, 17, 30, 1, FONT_O);
    txt_printo(1, 17, pu_label[slot_choices[sel]], P_YELLOW);
    for (int s = 1; s < 7; s++) txt_printo(1 + s * 4, 17, " ? ", P_GREY);
    if (key_hit(KEY_A)) {
        R.slot1 = slot_choices[sel]; sfx(SFX_SELECT);
        run_new();
        set_state(ST_DIALOG);
    }
    if (key_hit(KEY_B)) set_state(ST_SHIP);
    oam_begin(); oam_end();
}

// ---------------------------------------------------------------- dialogue
typedef struct { int port; const char *name; const char *text; } Line;
static const Line intro[] = {
    { 0, "MILO", "LIGHTS OUT WAS AT NINE. BUT EVERY NIGHT THE WAR IN MY HEAD STARTS RIGHT ON TIME." },
    { 0, "MILO", "I DREAMED UP A SQUADRON TO GUARD MY SLEEP. JETS, PAPER PLANES... EVEN A PENGUIN." },
    { 1, "???", "LITTLE PILOT. YOUR DREAMS BELONG TO THE NIGHT NOW. EVERY TOY. EVERY STAR." },
    { 0, "MILO", "NOT TONIGHT, NIGHTMARE. DREAM SQUADRON... LAUNCH!" },
};
#define NINTRO 4
static int dlg_line, dlg_chars;
static void dlg_draw(void)
{
    const Line *l = &intro[dlg_line];
    txt_box(0, 12, 30, 8);
    txt_printo(6, 13, l->name, l->port ? P_RED : P_CYAN);
    txt_wrap(6, 14, 23, l->text, P_WHITE, dlg_chars);
}
void dialog_enter(void)
{
    video_menu_mode(0);
    dlg_line = 0; dlg_chars = 0; tmr = 0;
    txt_center(1, "WORLD 1  -  THE DREAM WAR", P_YELLOW);
    txt_center(19, "", P_GREY);
    dlg_draw();
}
void dialog_update(void)
{
    menu_scroll();
    tmr++;
    const Line *l = &intro[dlg_line];
    int len = strlen(l->text);
    if (dlg_chars < len) { dlg_chars += 1 + (tmr & 1); dlg_draw(); }
    if (key_hit(KEY_A)) {
        if (dlg_chars < len) { dlg_chars = len; dlg_draw(); }
        else if (++dlg_line >= NINTRO) { R.sub = 0; R.routes[0] = ROUTE_NONE; set_state(ST_PLAY); return; }
        else { dlg_chars = 0; sfx(SFX_MENU); dlg_draw(); }
    }
    if (key_hit(KEY_START)) { R.sub = 0; R.routes[0] = ROUTE_NONE; set_state(ST_PLAY); return; }
    oam_begin();
    int talking = dlg_chars < len && ((tmr >> 3) & 1);
    spr(8, 112, (l->port ? SPR_PORT_SHADOW : SPR_PORT_MILO) + talking * 16, 32, 7, SPR_PRIO0);
    // the squadron drifting through the starfield
    for (int i = 0; i < 3; i++) {
        int s = i == 0 ? R.ship : (R.ship + i) % 3;
        spr(60 + i * 40 + (lu_sin(tmr * 300 + i * 9000) >> 10), 44 + i * 16 + (lu_sin(tmr * 500 + i * 7000) >> 10), ship_tile(s) + ((tmr >> 2) & 1) * 4, 16, 0, 0);
    }
    if (dlg_line >= 2) spr(190, 52 + (lu_sin(tmr * 200) >> 9), SPR_BOSS_MAIN, 64, 5, 0);
    oam_end();
}

// ---------------------------------------------------------------- fork (Darius-style)
static void fork_draw(void)
{
    int nxt = R.sub + 1;
    txt_clear();
    txt_center(1, "ROUTE FORK", P_YELLOW);
    txt_center(2, "CHOOSE YOUR PATH", P_GREY);
    u16 p = P_UI << 12;
    txt_put(3, 10, (UI_BASE + UI_NODE) | p);
    txt_print(1, 12, "1-", P_WHITE); txt_num(3, 12, R.sub + 1, 1, P_WHITE, 0);
    for (int i = 0; i < 4; i++) { txt_put(4 + i, 9 - i, (UI_BASE + UI_LINE_UP) | p); txt_put(4 + i, 11 + i, (UI_BASE + UI_LINE_DN) | p); }
    for (int i = 8; i < 11; i++) { txt_put(i, 5, (UI_BASE + UI_LINE_H) | p); txt_put(i, 15, (UI_BASE + UI_LINE_H) | p); }
    txt_put(11, 5, (UI_BASE + (sel == 0 ? UI_NODE : UI_NODE_G)) | p);
    txt_put(11, 15, (UI_BASE + (sel == 1 ? UI_NODE : UI_NODE_G)) | p);
    // upper = nightmare, lower = dream
    txt_print(13, 4, "1-", P_WHITE); txt_num(15, 4, nxt + 1, 1, P_WHITE, 0);
    txt_print(17, 4, sub_names[nxt][ROUTE_NIGHT], sel == 0 ? P_RED : P_GREY);
    txt_print(13, 5, "NIGHTMARE ROUTE", sel == 0 ? P_WHITE : P_GREY);
    txt_print(13, 6, nxt == 1 ? "BOSS: IRON MOTH" : "BOSS: NIGHT ENGINE", P_GREY);
    txt_print(13, 7, "GRIM. ORB STORMS.", P_GREY);
    txt_print(13, 14, "1-", P_WHITE); txt_num(15, 14, nxt + 1, 1, P_WHITE, 0);
    txt_print(17, 14, sub_names[nxt][ROUTE_DREAM], sel == 1 ? P_PINK : P_GREY);
    txt_print(13, 15, "DREAM ROUTE", sel == 1 ? P_WHITE : P_GREY);
    txt_print(13, 16, nxt == 1 ? "BOSS: BIG TEDDY" : "BOSS: MOON SANDMAN", P_GREY);
    txt_print(13, 17, "SILLY. STARS!", P_GREY);
    txt_center(19, "UP/DOWN CHOOSE   A:FLY", P_GREY);
}
void fork_enter(void)
{
    video_menu_mode(0);
    sel = 0;
    tmr = 0;
    fork_draw();
    music_play(MUS_FORK);
}
void fork_update(void)
{
    menu_scroll();
    tmr++;
    if (menu_move(2)) fork_draw();
    if (key_hit(KEY_A)) {
        sfx(SFX_SELECT);
        R.routes[R.sub + 1] = sel == 0 ? ROUTE_NIGHT : ROUTE_DREAM;
        set_state(ST_NODE);
    }
    oam_begin();
    int tx = 92, ty = sel == 0 ? 40 : 120;
    int x = 24 + ((tmr * 3) % 60) * (tx - 24) / 60;
    int y = 80 + ((tmr * 3) % 60) * (ty - 80) / 60;
    spr(x - 8, y - 8, ship_tile(R.ship) + ((tmr >> 2) & 1) * 4, 16, 0, 0);
    oam_end();
}

// ---------------------------------------------------------------- shop / event node
enum { NODE_SHOP, NODE_MERCHANT, NODE_GAMBLE, NODE_TOYBOX };
static int node_type, node_done;
static const char *node_msg;
static char node_buf[48];
typedef struct { const char *name; u8 cost; } ShopItem;
static const ShopItem shop_pool[6] = { { "SHIELD +1", 30 }, { "BOMB +1", 25 }, { "CAPSULE X2", 15 }, { "MYSTERY RELIC", 70 }, { "REROLL METER", 12 }, { "OPTION ORB", 40 } };
static u8 offers[3], sold[3];

static void node_draw(void)
{
    txt_clear();
    txt_box(0, 0, 30, 20);
    txt_printo(2, 18, "COINS", P_YELLOW); txt_printo(8, 18, "$", P_YELLOW); txt_num(9, 18, R.coins, 3, P_WHITE, 1);
    txt_printo(14, 18, "SH", P_YELLOW); txt_num(16, 18, R.shields, 1, P_WHITE, 1);
    txt_printo(19, 18, "B", P_YELLOW); txt_num(20, 18, R.bombs, 1, P_WHITE, 1);
    txt_printo(23, 18, "REL", P_GREEN); txt_num(26, 18, R.nrelics, 1, P_WHITE, 1);
    if (node_type == NODE_SHOP) {
        txt_printo(7, 2, "THE PILLOW MARKET", P_YELLOW);
        txt_wrap(7, 4, 21, "'COINS FOR COMFORT, LITTLE PILOT. EVERYTHING HERE WAS ONCE SOMEBODY'S DREAM.'", P_WHITE, -1);
        for (int i = 0; i < 4; i++) {
            int y = 9 + i * 2;
            txt_printo(3, y, sel == i ? ">" : " ", P_YELLOW);
            if (i == 3) { txt_printo(5, y, "LEAVE  (TO NEXT STAGE)", sel == 3 ? P_YELLOW : P_WHITE); continue; }
            const ShopItem *s = &shop_pool[offers[i]];
            txt_printo(5, y, s->name, sold[i] ? P_GREY : (sel == i ? P_YELLOW : P_WHITE));
            if (sold[i]) txt_printo(21, y, "SOLD", P_GREY);
            else { txt_printo(21, y, "$", P_YELLOW); txt_num(22, y, s->cost, 3, s->cost <= R.coins ? P_WHITE : P_RED, 1); }
        }
        if (node_msg) txt_printo(3, 16, node_msg, P_GREEN);
        return;
    }
    static const char *titles[4] = { "", "THE DREAM MERCHANT", "THE NIGHTMARE GAMBLE", "A LOST TOY BOX" };
    static const char *texts[4] = { "",
        "A TEDDY IN A TOP HAT BOWS. 'TRADE ONE SHIELD FOR A RELIC, LITTLE PILOT?'",
        "A SHADOW SHUFFLES THREE CARDS. 'BET HALF YOUR COINS. FIND THE MOON CARD AND I TRIPLE THEM.'",
        "A LOST TOY BOX DRIFTS OUT OF THE CLOUDS. SOMETHING INSIDE IS RATTLING." };
    txt_printo(7, 2, titles[node_type], node_type == NODE_GAMBLE ? P_RED : P_PINK);
    txt_wrap(7, 4, 21, texts[node_type], P_WHITE, -1);
    if (!node_done) {
        if (node_type == NODE_TOYBOX) txt_printo(5, 12, "> OPEN IT", P_YELLOW);
        else {
            txt_printo(5, 12, sel == 0 ? "> YES" : "  YES", sel == 0 ? P_YELLOW : P_WHITE);
            txt_printo(5, 13, sel == 1 ? "> NO" : "  NO", sel == 1 ? P_YELLOW : P_WHITE);
        }
    } else {
        txt_wrap(3, 12, 25, node_msg, P_GREEN, -1);
        txt_printo(3, 16, "A: ONWARD", P_GREY);
    }
}
void node_enter(void)
{
    video_menu_mode(0);
    load_theme(R.routes[R.sub + 1] == ROUTE_DREAM ? TH_CLOUDS : TH_HIVE);
    sel = 0; node_done = 0; node_msg = 0; tmr = 0;
    if (rnd(100) < 55) node_type = NODE_SHOP;
    else if (R.routes[R.sub + 1] == ROUTE_NIGHT) node_type = NODE_GAMBLE;
    else node_type = rnd(2) ? NODE_MERCHANT : NODE_TOYBOX;
    if (g_debug) node_type = R.sub == 1 ? NODE_SHOP : (R.routes[R.sub + 1] == ROUTE_NIGHT ? NODE_GAMBLE : NODE_MERCHANT);   // deterministic for testing
    // pick 3 distinct offers
    u8 pool[6] = { 0, 1, 2, 3, 4, 5 }; int n = 6;
    for (int i = 0; i < 3; i++) { int k = rnd(n); offers[i] = pool[k]; pool[k] = pool[--n]; sold[i] = 0; }
    node_draw();
}
static void node_finish(void)
{
    R.sub++;
    set_state(ST_PLAY);
}
void node_update(void)
{
    tmr++;
    g_far_x += 0x30;
    if (node_type == NODE_SHOP) {
        if (menu_move(4)) { node_msg = 0; node_draw(); }
        if (key_hit(KEY_A)) {
            if (sel == 3) { sfx(SFX_SELECT); node_finish(); return; }
            const ShopItem *s = &shop_pool[offers[sel]];
            if (sold[sel]) { node_msg = "ALREADY SOLD.          "; sfx(SFX_MENU); }
            else if (R.coins < s->cost) { node_msg = "NOT ENOUGH COINS.       "; sfx(SFX_HIT); }
            else {
                R.coins -= s->cost; sold[sel] = 1; sfx(SFX_COIN);
                switch (offers[sel]) {
                case 0: if (R.shields < 6) R.shields++; node_msg = "SHIELD UP!"; break;
                case 1: if (R.bombs < 6) R.bombs++; node_msg = "BOMB STOCKED!"; break;
                case 2: R.hi = (R.hi + 2) % 7; node_msg = "METER +2!"; break;
                case 3: { int r = rnd(NUM_RELICS); run_grant_relic(r); strcpy(node_buf, "RELIC: "); strcat(node_buf, relic_name[r]); node_msg = node_buf; break; }
                case 4: { s8 h = R.hi; roll_meter(); R.hi = h; node_msg = "METER REROLLED!"; break; }
                case 5: if (R.options < 2) R.options++; node_msg = "OPTION ORB JOINS YOU!"; break;
                }
            }
            node_draw();
        }
        if (key_hit(KEY_B)) { sel = 3; node_draw(); }
    } else if (!node_done) {
        if (node_type != NODE_TOYBOX && menu_move(2)) node_draw();
        if (key_hit(KEY_A)) {
            node_done = 1; sfx(SFX_SELECT);
            if (node_type == NODE_TOYBOX) {
                R.hi = (R.hi + 3) % 7; R.coins += 10;
                node_msg = "THREE CAPSULES AND A HANDFUL OF COINS!";
            } else if (sel == 1) node_msg = "YOU FLY ON WITHOUT A WORD.";
            else if (node_type == NODE_MERCHANT) {
                if (!R.shields) node_msg = "'NO SHIELD TO TRADE? PITY.' THE TEDDY TIPS HIS HAT.";
                else { R.shields--; int r = rnd(NUM_RELICS); run_grant_relic(r); strcpy(node_buf, "DEAL! RELIC: "); strcat(node_buf, relic_name[r]); node_msg = node_buf; sfx(SFX_POWERUP); }
            } else {
                int bet = R.coins / 2;
                if (bet < 1) node_msg = "THE SHADOW LAUGHS AT YOUR EMPTY POCKETS.";
                else if (rnd(2)) { R.coins += bet * 2; if (R.coins > 999) R.coins = 999; node_msg = "THE MOON CARD! YOUR BET IS TRIPLED."; sfx(SFX_POWERUP); }
                else { R.coins -= bet; node_msg = "A SKULL CARD. THE SHADOW TAKES YOUR BET."; sfx(SFX_HIT); }
            }
            node_draw();
        }
    } else if (key_hit(KEY_A)) { node_finish(); return; }
    oam_begin();
    int port = node_type == NODE_GAMBLE ? SPR_PORT_SHADOW : node_type == NODE_TOYBOX ? SPR_PORT_MILO : SPR_PORT_TEDDY;
    spr(16, 24, port + ((tmr >> 4) & 1) * 16, 32, 7, SPR_PRIO0);
    oam_end();
}

// ---------------------------------------------------------------- end of run
void run_finish(int cleared)
{
    u32 e = R.score / 400 + R.subs_cleared * 15 + R.coins / 2 + (cleared ? 50 : 0);
    R.earned = e;
    g_save.dreamcoins += e;
    if (g_save.dreamcoins > 99999) g_save.dreamcoins = 99999;
    if (R.score > g_save.hiscore) g_save.hiscore = R.score;
    g_save.runs++;
    if (cleared) g_save.clears++;
    if (R.subs_cleared > g_save.best_sub) g_save.best_sub = R.subs_cleared;
    save_write();
}

void gameover_enter(void)
{
    oam_begin(); oam_end();
    txt_clear_rows(2, 18);
    txt_box(5, 5, 20, 9);
    txt_printo(10, 7, "GAME OVER", P_RED);
    txt_printo(8, 9, "SCORE", P_YELLOW); txt_num(14, 9, R.score, 7, P_WHITE, 1);
    run_finish(0);
    txt_printo(8, 10, "DREAM", P_PINK); txt_printo(14, 10, "+", P_WHITE); txt_num(15, 10, R.earned, 4, P_WHITE, 1); txt_printo(20, 10, "DC", P_PINK);
    music_play(MUS_GAMEOVER);
    tmr = 0;
}
void gameover_update(void)
{
    tmr++;
    txt_printo(9, 12, (tmr & 32) ? "PRESS START" : "           ", P_WHITE);
    if (tmr > 30 && (key_hit(KEY_START) || key_hit(KEY_A))) set_state(ST_WORKSHOP);
}

void clear_enter(void)
{
    video_menu_mode(0);
    load_theme(R.route == ROUTE_DREAM ? TH_CANDYMOON : TH_FOUNDRY);
    txt_box(2, 2, 26, 16);
    txt_center(4, "WORLD 1 CLEAR", P_YELLOW);
    txt_center(6, "- TO BE CONTINUED -", P_PINK);
    txt_wrap(4, 8, 22, "THE NIGHTMARE PULLS BACK INTO THE DARK... FOR NOW. MILO TURNS OVER IN HIS SLEEP AND SMILES.", P_WHITE, -1);
    txt_printo(6, 13, "SCORE", P_YELLOW); txt_num(13, 13, R.score, 7, P_WHITE, 1);
    run_finish(1);
    txt_printo(6, 14, "DREAM", P_PINK); txt_printo(13, 14, "+", P_WHITE); txt_num(14, 14, R.earned, 4, P_WHITE, 1); txt_printo(19, 14, "DC", P_PINK);
    music_play(MUS_CLEAR);
    tmr = 0;
}
void clear_update(void)
{
    tmr++; menu_scroll();
    txt_printo(10, 16, (tmr & 32) ? "PRESS START" : "           ", P_WHITE);
    oam_begin();
    spr(100 + (lu_sin(tmr * 300) >> 9), 128, ship_tile(R.ship) + ((tmr >> 2) & 1) * 4, 16, 0, 0);
    oam_end();
    if (tmr > 60 && (key_hit(KEY_START) || key_hit(KEY_A))) set_state(ST_WORKSHOP);
}

// ---------------------------------------------------------------- dream workshop (meta progression)
typedef struct { const char *name; const char *desc; u8 max; u16 cost[3]; } Upg;
static const Upg upgs[4] = {
    { "START BOMB +1", "BEGIN EVERY RUN WITH AN EXTRA BOMB.", 2, { 40, 80, 0 } },
    { "START SHIELD +1", "BEGIN EVERY RUN WITH AN EXTRA SHIELD.", 2, { 60, 120, 0 } },
    { "CAPSULE LUCK", "ENEMIES DROP CAPSULES MORE OFTEN.", 3, { 30, 60, 90 } },
    { "UNLOCK TOAST-R", "A 4TH SHIP: A BRAVE TOASTER WITH TWIN TOAST.", 1, { 120, 0, 0 } },
};
static int upg_level(int i)
{
    switch (i) {
    case 0: return g_save.up_bomb;
    case 1: return g_save.up_shield;
    case 2: return g_save.up_luck;
    case 3: return g_save.unlocked & 1;
    }
    return 0;
}
static const char *ws_msg;
static void ws_draw(void)
{
    txt_clear();
    txt_center(1, "DREAM WORKSHOP", P_PINK);
    txt_print(2, 3, "DREAM COINS", P_YELLOW); txt_num(14, 3, g_save.dreamcoins, 5, P_WHITE, 0);
    if (R.earned) { txt_print(20, 3, "+", P_GREEN); txt_num(21, 3, R.earned, 4, P_GREEN, 0); }
    txt_box(1, 5, 28, 8);
    for (int i = 0; i < 5; i++) {
        int y = 6 + i + (i == 4);
        txt_printo(2, y, sel == i ? ">" : " ", P_YELLOW);
        if (i == 4) { txt_printo(3, y, "DONE", sel == 4 ? P_YELLOW : P_WHITE); continue; }
        int lv = upg_level(i);
        txt_printo(3, y, upgs[i].name, sel == i ? P_YELLOW : P_WHITE);
        if (upgs[i].max > 1) { txt_printo(19, y, "L", P_GREY); txt_num(20, y, lv, 1, P_CYAN, 1); }
        if (lv >= upgs[i].max) txt_printo(22, y, i == 3 ? "OWNED" : "MAX", P_GREEN);
        else {
            int c = upgs[i].cost[lv];
            txt_printo(22, y, "DC", P_PINK); txt_num(25, y, c, 3, c <= (int)g_save.dreamcoins ? P_WHITE : P_RED, 1);
        }
    }
    txt_box(1, 13, 28, 5);
    if (sel < 4) txt_wrap(2, 14, 26, upgs[sel].desc, P_WHITE, -1);
    else txt_wrap(2, 14, 26, "BACK TO THE TITLE SCREEN.", P_WHITE, -1);
    if (ws_msg) txt_center(19, ws_msg, P_GREEN);
    else { txt_print(1, 19, "RUNS", P_GREY); txt_num(6, 19, g_save.runs, 3, P_GREY, 0); txt_print(11, 19, "CLEARS", P_GREY); txt_num(18, 19, g_save.clears, 3, P_GREY, 0); }
}
void workshop_enter(void)
{
    video_menu_mode(0);
    sel = 0; ws_msg = 0; tmr = 0;
    ws_draw();
    if (music_current() != MUS_CLEAR && music_current() != MUS_GAMEOVER) music_play(MUS_FORK);
}
void workshop_update(void)
{
    tmr++; menu_scroll();
    if (menu_move(5)) { ws_msg = 0; ws_draw(); }
    if (key_hit(KEY_A)) {
        if (sel == 4) { set_state(ST_TITLE); return; }
        int lv = upg_level(sel);
        if (lv >= upgs[sel].max) { ws_msg = "ALREADY MAXED"; sfx(SFX_MENU); }
        else if (g_save.dreamcoins < upgs[sel].cost[lv]) { ws_msg = "NOT ENOUGH DREAM COINS"; sfx(SFX_HIT); }
        else {
            g_save.dreamcoins -= upgs[sel].cost[lv];
            switch (sel) {
            case 0: g_save.up_bomb++; break;
            case 1: g_save.up_shield++; break;
            case 2: g_save.up_luck++; break;
            case 3: g_save.unlocked |= 1; break;
            }
            save_write();
            ws_msg = sel == 3 ? "TOAST-R UNLOCKED! (SAVED)" : "UPGRADE BOUGHT! (SAVED)";
            sfx(SFX_POWERUP);
        }
        ws_draw();
    }
    if (key_hit(KEY_B) || key_hit(KEY_START)) set_state(ST_TITLE);
    oam_begin();
    if (g_save.unlocked & 1) spr(208, 130, SPR_SHIP_TOASTER + ((tmr >> 2) & 1) * 4, 16, 0, 0);
    oam_end();
}
void shop_enter(void) {}
