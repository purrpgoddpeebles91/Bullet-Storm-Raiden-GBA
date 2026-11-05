// Bullet Storm Raiden - v0.3 route-driven story (jam theme: SHIFT)
// Every fork pick moves a dream (+) / nightmare (-) alignment. Stage intros, boss talk and the
// World 1 ending branch on the route: nightmare routes are grim and militaristic, dream routes are
// goofy, mixed routes are uneasy and surreal. Memory fragments persist in SRAM (save.c, 0x200).
#include "common.h"

// ---------------------------------------------------------------- speakers
typedef struct { u16 tile; u8 pal, namepal; } Portrait;
static const Portrait portraits[NUM_PT] = {
    { SPR_PORT_MILO, 7, P_CYAN },
    { SPR_PORT_SHADOW, 7, P_RED },
    { SPR_PORT_TEDDY, 7, P_PINK },
    { SPR_PORT_VOX, 10, P_RED },
    { SPR_PORT_WADDLES, 10, P_YELLOW },
    { SPR_PORT_SANDMAN, 10, P_PURPLE },
    { SPR_MB_WARDEN, 2, P_GREY },
    { SPR_MB_MOTH, 3, P_RED },
    { SPR_MB_TEDDY, 4, P_PINK },
    { SPR_PORT_SHADOW, 7, P_RED },
};
const char *const pt_name[NUM_PT] = { "MILO", "THE NIGHTMARE", "DREAM MERCHANT", "CMDR. VOX", "SGT. WADDLES",
    "MOON SANDMAN", "GATE WARDEN", "IRON MOTH", "BIG TEDDY", "NIGHT ENGINE" };

// ---------------------------------------------------------------- scenes
#define SC(a) a, sizeof(a) / sizeof(a[0])
static const Line l_intro[] = {
    { PT_MILO, "LIGHTS OUT WAS AT NINE. BUT EVERY NIGHT THE WAR IN MY HEAD STARTS RIGHT ON TIME." },
    { PT_MILO, "I DREAMED UP A SQUADRON TO GUARD MY SLEEP. JETS, PAPER PLANES... EVEN A PENGUIN." },
    { PT_SHADOW, "LITTLE PILOT. YOUR DREAMS BELONG TO THE NIGHT NOW. EVERY TOY. EVERY STAR." },
    { PT_MILO, "NOT TONIGHT, NIGHTMARE. DREAM SQUADRON... LAUNCH!" },
};
// ---- before 1-2
static const Line l_pre12_n[] = {
    { PT_VOX, "SQUADRON, THIS IS COMMAND. CALLSIGN VOX. YOU CHOSE THE HARD ROAD. GOOD." },
    { PT_VOX, "THE IRON HIVE BUILDS MACHINES OUT OF BAD NIGHTS. YOU WILL NOT BLINK. YOU WILL NOT CRY." },
    { PT_MILO, "...YES SIR. WHERE'S WADDLES?" },
    { PT_VOX, "PENGUINS ARE NOT CLEARED FOR THIS SECTOR. EYES FORWARD, PILOT." },
};
static const Line l_pre12_d[] = {
    { PT_WADDLES, "SERGEANT WADDLES REPORTING! I HAVE BROUGHT SNACKS FOR THE MISSION." },
    { PT_MILO, "WHAT KIND OF SNACKS?" },
    { PT_WADDLES, "FISH. THE SNACKS ARE FISH. THE MISSION IS ALSO FISH. I MAY HAVE MISREAD THE BRIEFING." },
    { PT_MILO, "PILLOW CLOUDS AHEAD! WATCH OUT FOR THE RUBBER DUCKS, THEY BITE!" },
};
// ---- before 1-3 (route combos)
static const Line l_pre13_nn[] = {
    { PT_VOX, "BLACK FOUNDRY. IT FORGES THE NIGHT ENGINE. NO TOYS. NO JOKES. ONLY THE MISSION." },
    { PT_MILO, "I DON'T REMEMBER WHEN I STOPPED BEING SCARED. I THINK I JUST GOT QUIET." },
    { PT_SHADOW, "GOOD SOLDIER. QUIET IS WHERE I LIVE." },
};
static const Line l_pre13_nd[] = {
    { PT_MILO, "THE HIVE WAS SO LOUD. NOW EVERYTHING IS PINK AND SOFT... AND TOO QUIET." },
    { PT_VOX, "...SQUAD...RON... THE SUGAR IS... A TRAP... DO NOT... FALL... ASLEEP..." },
    { PT_WADDLES, "HE SOUNDS TIRED, MILO. MAYBE COMMAND NEEDS A NAP TOO." },
    { PT_MILO, "THE MOON IS SMILING AT ME. WHY DOES THAT MAKE MY HANDS SHAKE?" },
};
static const Line l_pre13_dn[] = {
    { PT_MILO, "THE CLOUDS TURNED TO SMOKE BEHIND US. THE DUCKS STOPPED SQUEAKING." },
    { PT_WADDLES, "I DID NOT PACK A SCARF FOR THIS. I DID NOT PACK A SCARF FOR ANYTHING." },
    { PT_VOX, "PLAYTIME IS OVER, PENGUIN. THE FOUNDRY DOES NOT DO HUGS." },
    { PT_MILO, "THEN WE'LL BRING OUR OWN." },
};
static const Line l_pre13_dd[] = {
    { PT_WADDLES, "INTELLIGENCE REPORT: THE MOON IS MADE OF CANDY. IT IS ALSO VERY MAD AT US." },
    { PT_SANDMAN, "SHHH. EVERYBODY NAPS ON MY MOON. EVEN LOUD LITTLE BIRDS." },
    { PT_WADDLES, "I AM NOT A LITTLE BIRD. I AM A SERGEANT BIRD." },
    { PT_MILO, "WADDLES, WHATEVER HAPPENS... DON'T LICK THE MOON." },
};
// ---- boss talk
static const Line l_warden_pre[] = {
    { PT_WARDEN, "HALT. NO CHILD PASSES THE GATE OF SLEEP WITH HIS EYES OPEN." },
    { PT_MILO, "THEN I'LL DREAM MY WAY THROUGH!" },
};
static const Line l_warden_post[] = {
    { PT_WARDEN, "THE GATE... IS OPEN. CHOOSE YOUR ROADS WELL, PILOT. EVERY ROAD CHANGES WHO YOU ARE." },
    { PT_MILO, "THE PATH SPLITS AHEAD. UP FEELS COLD. DOWN SMELLS LIKE COTTON CANDY." },
};
static const Line l_moth_pre[] = {
    { PT_MOTH, "YOUR LITTLE NIGHT LIGHT. I CAN SEE IT FROM HERE. I WILL EAT IT." },
    { PT_VOX, "TARGET ACQUIRED. ENGAGE. THAT IS AN ORDER, PILOT." },
};
static const Line l_moth_post[] = {
    { PT_MOTH, "...SO... BRIGHT..." },
    { PT_MILO, "THE NIGHT LIGHT IS STILL ON. I CAN STILL SEE MY ROOM." },
    { PT_VOX, "DO NOT LOOK BACK. LOOKING BACK IS HOW THEY GET YOU." },
};
static const Line l_teddy_pre[] = {
    { PT_BIGTEDDY, "HUGS! EVERYBODY GETS HUGS! FOREVER AND EVER AND EVER!" },
    { PT_WADDLES, "THAT IS TOO MANY HUGS. EVASIVE ACTION! FLAP, MILO, FLAP!" },
};
static const Line l_teddy_post[] = {
    { PT_BIGTEDDY, "...I JUST DIDN'T WANT YOU TO WAKE UP SCARED." },
    { PT_MILO, "I KNOW, BUDDY. BUT SOMETIMES I HAVE TO WAKE UP ANYWAY." },
};
static const Line l_engine_pre_nn[] = {
    { PT_ENGINE, "YOU MARCHED ALL THE WAY HERE WITHOUT A SINGLE TOY. YOU ARE ALREADY MINE." },
    { PT_MILO, "I'M NOT YOURS. I'M JUST... TIRED." },
    { PT_VOX, "TIRED IS NOT A STATUS. WEAPONS FREE." },
};
static const Line l_engine_pre_dn[] = {
    { PT_ENGINE, "YOU BROUGHT A PENGUIN. TO MY FOUNDRY. HOW SWEET. HOW BREAKABLE." },
    { PT_WADDLES, "I AM A VERY BRAVE PENGUIN. I AM ALSO HIDING BEHIND MILO." },
    { PT_MILO, "STAY CLOSE. WE GO THROUGH IT TOGETHER." },
};
static const Line l_engine_post_nn[] = {
    { PT_VOX, "TARGET DOWN. SECTOR SECURE. MISSION... COMPLETE." },
    { PT_MILO, "THEN WHY DOESN'T IT FEEL LIKE WINNING?" },
};
static const Line l_engine_post_dn[] = {
    { PT_WADDLES, "WE DID IT! I AM ONLY A LITTLE BIT ON FIRE!" },
    { PT_MILO, "THE SMOKE IS CLEARING... BUT THE ENGINE IS STILL TICKING SOMEWHERE." },
};
static const Line l_sand_pre_dd[] = {
    { PT_SANDMAN, "SLEEPY, SLEEPY... YOU HAD SO MUCH FUN. WHY NOT STAY? STAY FOREVER." },
    { PT_WADDLES, "I CANNOT STAY. I HAVE A MEETING. A VERY IMPORTANT PENGUIN MEETING." },
    { PT_MILO, "SORRY, MR. MOON. SCHOOL'S AT EIGHT!" },
};
static const Line l_sand_pre_nd[] = {
    { PT_SANDMAN, "POOR LITTLE SOLDIER. THE HIVE WORE YOU OUT. LET ME TAKE THE WAR AWAY." },
    { PT_MILO, "...THAT SOUNDS NICE. THAT SOUNDS TOO NICE." },
};
static const Line l_sand_post_dd[] = {
    { PT_SANDMAN, "OKAY, OKAY. FIVE MORE MINUTES. THEN BED." },
    { PT_MILO, "DEAL!" },
    { PT_WADDLES, "I NEGOTIATED THAT. PUT IT IN MY FILE." },
};
static const Line l_sand_post_nd[] = {
    { PT_SANDMAN, "YOU TOOK THE HARD WAY BACK TO SOFT THINGS, LITTLE ONE." },
    { PT_MILO, "I'M STILL SHAKING. BUT I THINK I'M SMILING TOO." },
};
// ---- endings
static const Line l_end_nn[] = {
    { PT_VOX, "WORLD ONE SECURED. REPORT FOR THE NEXT NIGHT AT TWENTY-ONE HUNDRED. DISMISSED." },
    { PT_MILO, "THE NIGHT LIGHT WENT OUT. I DIDN'T EVEN NOTICE WHEN." },
    { PT_SHADOW, "YOU DON'T NEED IT ANYMORE, SOLDIER. YOU HAVE ME NOW." },
};
static const Line l_end_nd[] = {
    { PT_MILO, "I FELL THROUGH THE IRON AND LANDED IN SUGAR. EVERYTHING IS UPSIDE DOWN AND STILL." },
    { PT_VOX, "...SQUADRON... STAND DOWN. GO TO SLEEP, KID. I'VE GOT THE NIGHT WATCH." },
    { PT_MILO, "VOX? ...YOU SOUND LIKE DAD. ON THE RADIO. FROM THE AIRPORT." },
};
static const Line l_end_dn[] = {
    { PT_WADDLES, "MILO? WHY IS THE SKY THE COLOR OF A BRUISE?" },
    { PT_SHADOW, "BECAUSE HE LET ME IN THROUGH THE CANDY DOOR. I LIKE PASTEL. IT SUITS ME." },
    { PT_MILO, "WE BEAT THE ENGINE. SO WHY CAN I STILL HEAR IT TICKING?" },
};
static const Line l_end_dd[] = {
    { PT_WADDLES, "VICTORY! I HEREBY DECLARE TODAY NATIONAL FISH DAY. ATTENDANCE IS MANDATORY." },
    { PT_SANDMAN, "ZZZ... ZZZ... FIVE MORE... ZZZ..." },
    { PT_MILO, "THE NIGHTMARE RAN AWAY! IT TRIPPED ON A RUBBER DUCK ON THE WAY OUT!" },
};

const Scene scenes[NUM_SC] = {
    { SC(l_intro), VIBE_NEUTRAL, "WORLD 1  -  THE DREAM WAR" },
    { SC(l_pre12_n), VIBE_NIGHT, "1-2  BRIEFING: IRON HIVE" },
    { SC(l_pre12_d), VIBE_DREAM, "1-2  BRIEFING: PILLOW CLOUDS" },
    { SC(l_pre13_nn), VIBE_NIGHT, "1-3  BRIEFING: BLACK FOUNDRY" },
    { SC(l_pre13_nd), VIBE_MIXED, "1-3  ...CANDY MOON?" },
    { SC(l_pre13_dn), VIBE_MIXED, "1-3  ...BLACK FOUNDRY?" },
    { SC(l_pre13_dd), VIBE_DREAM, "1-3  BRIEFING: CANDY MOON" },
    { SC(l_warden_pre), VIBE_NEUTRAL, 0 }, { SC(l_warden_post), VIBE_NEUTRAL, 0 },
    { SC(l_moth_pre), VIBE_NIGHT, 0 }, { SC(l_moth_post), VIBE_NIGHT, 0 },
    { SC(l_teddy_pre), VIBE_DREAM, 0 }, { SC(l_teddy_post), VIBE_DREAM, 0 },
    { SC(l_engine_pre_nn), VIBE_NIGHT, 0 }, { SC(l_engine_pre_dn), VIBE_MIXED, 0 },
    { SC(l_engine_post_nn), VIBE_NIGHT, 0 }, { SC(l_engine_post_dn), VIBE_MIXED, 0 },
    { SC(l_sand_pre_dd), VIBE_DREAM, 0 }, { SC(l_sand_pre_nd), VIBE_MIXED, 0 },
    { SC(l_sand_post_dd), VIBE_DREAM, 0 }, { SC(l_sand_post_nd), VIBE_MIXED, 0 },
    { SC(l_end_nn), VIBE_NIGHT, "ENDING A  -  IRON DAWN" },
    { SC(l_end_nd), VIBE_MIXED, "ENDING B  -  THE SOFT LANDING" },
    { SC(l_end_dn), VIBE_MIXED, "ENDING C  -  SOUR MILK MOON" },
    { SC(l_end_dd), VIBE_DREAM, "ENDING D  -  PILLOW FORT" },
};

const Ending endings[4] = {
    { "IRON DAWN", "MILO WAKES BEFORE THE ALARM AND MAKES HIS BED PERFECTLY. HE CAN'T REMEMBER THE DREAM. THE PENGUIN PLUSH IS FACE-DOWN ON THE FLOOR.", MEM_END_NN },
    { "THE SOFT LANDING", "THE RADIO ON THE NIGHTSTAND HUMS STATIC ALL NIGHT. MILO SLEEPS HOLDING IT. FAR AWAY, A NIGHT FLIGHT LANDS SAFELY.", MEM_END_ND },
    { "SOUR MILK MOON", "MILO WAKES AT 3:12 AM. THE HALL CLOCK TICKS LOUDER THAN IT SHOULD. HE TAKES THE PENGUIN BACK TO BED, JUST IN CASE.", MEM_END_DN },
    { "PILLOW FORT", "MILO WAKES UPSIDE DOWN IN A FORT MADE OF EVERY PILLOW IN THE HOUSE. THE NIGHTMARE IS STILL OUT THERE. IT IS VERY EMBARRASSED.", MEM_END_DD },
};

// ---------------------------------------------------------------- memory fragments (lore unlocks)
const char *const mem_name[NUM_MEM] = {
    "THE NIGHT LIGHT", "IRON LULLABY", "THE TEDDY OATH", "FOUNDRY ORDERS", "SUGAR TIDES",
    "IRON DAWN", "PILLOW FORT", "THE SOFT LANDING", "SOUR MILK MOON",
    "FIRST SHIFT", "BOTH SIDES", "WHO DREAMS THE WAR?",
};
const char *const mem_text[NUM_MEM] = {
    "MILO'S NIGHT LIGHT IS A PLASTIC ROCKET. DAD BOUGHT IT THE WEEK HE STARTED FLYING NIGHT SHIFTS. IT HUMS WHEN THE HOUSE IS QUIET.",
    "THE HIVE HUMS THE SAME THREE NOTES AS THE CARGO PLANES THAT CROSS THE HOUSE AT NIGHT. MILO COUNTS THEM UNTIL HE SLEEPS.",
    "BIG TEDDY WAS MILO'S FIRST TOY. HE PROMISED MILO WOULD NEVER WAKE UP SCARED. HE TOOK THE PROMISE TOO FAR.",
    "THE FOUNDRY RUNS ON CHECKLISTS. BRUSH TEETH. LIGHTS OUT. DON'T CRY. MILO WROTE THE LAST ONE HIMSELF.",
    "THE CANDY MOON RISES WHENEVER SOMEBODY LAUGHS IN THEIR SLEEP. TONIGHT IT ROSE TWICE.",
    "VOX NEVER SLEEPS. VOX IS WHAT MILO SOUNDS LIKE WHEN HE PRETENDS HE ISN'T SCARED.",
    "SGT. WADDLES OUTRANKS EVERYONE IN THE DREAM. NOBODY REMEMBERS WHO PROMOTED HIM. IT WAS MILO, AGE SIX.",
    "THE RADIO VOICE SANG ONE LINE OF A LULLABY BEFORE THE STATIC TOOK IT. MILO HAS HEARD IT BEFORE, ON THE PHONE.",
    "THE NIGHTMARE LEARNED TO WEAR PASTEL. IT IS THE SCARIEST THING IT HAS LEARNED SO FAR.",
    "SHIFT: FOR A FEW HEARTBEATS THE DREAM AND THE NIGHTMARE TRADE PLACES. MILO FOUND OUT HE CAN DO IT ON PURPOSE.",
    "EVERY TOY HAS A SHADOW. EVERY SHADOW WAS A TOY ONCE. MILO HAS NOW BEEN BOTH.",
    "THE WAR IS NOT IN MILO'S HEAD. IT LIVES IN THE GAP BETWEEN THE FRONT DOOR AND THE SOUND OF DAD'S KEYS. WORLD 2 WAITS.",
};
const char *const mem_hint[NUM_MEM] = {
    "BEAT THE GATE WARDEN (1-1).", "BEAT THE IRON MOTH (NIGHTMARE 1-2).", "BEAT BIG TEDDY (DREAM 1-2).",
    "REACH THE BLACK FOUNDRY.", "REACH THE CANDY MOON.",
    "CLEAR WORLD 1: NIGHTMARE, NIGHTMARE.", "CLEAR WORLD 1: DREAM, DREAM.",
    "CLEAR WORLD 1: NIGHTMARE, THEN DREAM.", "CLEAR WORLD 1: DREAM, THEN NIGHTMARE.",
    "TRIGGER A SHIFT (R WHEN THE GAUGE IS FULL).", "DREAM SHIFT AND NIGHTMARE SHIFT IN ONE RUN.",
    "SEE 3 DIFFERENT WORLD 1 ENDINGS.",
};

// ---------------------------------------------------------------- route logic
int story_combo(void)
{
    return (R.routes[1] == ROUTE_DREAM ? 2 : 0) + (R.routes[2] == ROUTE_DREAM ? 1 : 0);
}
int story_vibe(void)
{
    if (R.sub == 0) return VIBE_NEUTRAL;
    if (R.sub == 1) return R.routes[1] == ROUTE_DREAM ? VIBE_DREAM : VIBE_NIGHT;
    int c = story_combo();
    return c == 0 ? VIBE_NIGHT : c == 3 ? VIBE_DREAM : VIBE_MIXED;
}
int story_pre_stage(int sub)
{
    if (sub == 0) return SC_INTRO;
    if (sub == 1) return R.routes[1] == ROUTE_DREAM ? SC_PRE12_D : SC_PRE12_N;
    return SC_PRE13_NN + story_combo();
}
int story_boss_pre(void)
{
    if (R.sub == 0) return SC_WARDEN_PRE;
    if (R.sub == 1) return R.route == ROUTE_DREAM ? SC_TEDDY_PRE : SC_MOTH_PRE;
    int c = story_combo();
    if (R.route == ROUTE_NIGHT) return c == 0 ? SC_ENGINE_PRE_NN : SC_ENGINE_PRE_DN;
    return c == 3 ? SC_SAND_PRE_DD : SC_SAND_PRE_ND;
}
int story_boss_post(void)
{
    if (R.sub == 0) return SC_WARDEN_POST;
    if (R.sub == 1) return R.route == ROUTE_DREAM ? SC_TEDDY_POST : SC_MOTH_POST;
    int c = story_combo();
    if (R.route == ROUTE_NIGHT) return c == 0 ? SC_ENGINE_POST_NN : SC_ENGINE_POST_DN;
    return c == 3 ? SC_SAND_POST_DD : SC_SAND_POST_ND;
}
int story_ending_scene(void) { return SC_END_NN + story_combo(); }
const char *story_tagline(void)
{
    if (R.sub == 0) return "THE DREAM WAR BEGINS";
    if (R.sub == 1) return R.route == ROUTE_DREAM ? "MIND THE DUCKS" : "IT REMEMBERS EVERY BAD NIGHT";
    static const char *const t[4] = { "NO TOYS PAST THIS LINE", "SWEET... TOO SWEET", "SMOKE WHERE CLOUDS WERE", "THE MOON IS MADE OF CANDY" };
    return t[story_combo()];
}
void story_mem_event(int id)
{
    if (mem_unlock(id)) { R.mem_runs++; if (R.new_mem == 255) R.new_mem = id; }
}

// ---------------------------------------------------------------- dialogue box engine
static int t_scene = -1, t_line, t_chars, t_tmr, t_hold;
int talk_scene(void) { return t_scene; }
int talk_line(void) { return t_line; }
static void talk_draw(void)
{
    const Line *l = &scenes[t_scene].l[t_line];
    txt_box(0, 12, 30, 8);
    txt_printo(6, 13, pt_name[l->port], portraits[l->port].namepal);
    txt_wrap(6, 14, 23, l->text, P_WHITE, t_chars);
    // page dots: which line of the scene this is
    for (int i = 0; i < scenes[t_scene].n && i < 6; i++) txt_put(28 - (scenes[t_scene].n - 1 - i), 13, (FONT_O + (i == t_line ? '*' : '.') - 32) | ((i == t_line ? P_YELLOW : P_GREY) << 12));
}
void talk_start(int scene)
{
    t_scene = scene; t_line = 0; t_chars = 0; t_tmr = 0; t_hold = 0;
    talk_draw();
}
// A: finish the line / next line. START: skip the scene. Lines also advance on their own after a pause.
int talk_update(void)
{
    if (t_scene < 0) return 1;
    const Scene *sc = &scenes[t_scene];
    const Line *l = &sc->l[t_line];
    int len = strlen(l->text);
    t_tmr++;
    if (t_chars < len) { t_chars += 1 + (t_tmr & 1); if (t_chars > len) t_chars = len; talk_draw(); t_hold = 0; }
    else t_hold++;
    int next = key_hit(KEY_A) || t_hold > 150 || (g_autopilot && t_hold > 20);
    if (key_hit(KEY_START)) { t_scene = -1; return 1; }
    if (next) {
        if (t_chars < len) { t_chars = len; talk_draw(); }
        else if (++t_line >= sc->n) { t_scene = -1; return 1; }
        else { t_chars = 0; t_hold = 0; sfx(SFX_MENU); talk_draw(); }
    }
    return 0;
}
void talk_draw_portrait(void)
{
    if (t_scene < 0) return;
    const Line *l = &scenes[t_scene].l[t_line];
    const Portrait *p = &portraits[l->port];
    int talking = t_chars < (int)strlen(l->text) && ((t_tmr >> 3) & 1);
    spr(8, 112, p->tile + talking * 16, 32, p->pal, SPR_PRIO0);
}
