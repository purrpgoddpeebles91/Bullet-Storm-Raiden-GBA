// Battery-backed SRAM save (32KB SRAM, byte access only)
#include "common.h"

#define SRAM ((volatile u8 *)0x0E000000)
#define SAVE_MAGIC 0x52534231  // "1BSR"
// Save-type tag so emulators / flashcarts detect battery SRAM
__attribute__((used, aligned(4))) const char save_tag[] = "SRAM_V113";

SaveData g_save;

static u8 checksum(const u8 *p, int n)
{
    u8 c = 0x5A;
    for (int i = 0; i < n; i++) c = (u8)((c << 1 | c >> 7) ^ p[i]);
    return c;
}

void save_load(void)
{
    volatile const char *tag = save_tag; (void)tag[0];
    u8 *d = (u8 *)&g_save;
    for (unsigned i = 0; i < sizeof(SaveData); i++) d[i] = SRAM[i];
    u8 ck = SRAM[sizeof(SaveData)];
    if (g_save.magic != SAVE_MAGIC || ck != checksum(d, sizeof(SaveData))) {
        memset(&g_save, 0, sizeof(g_save));
        g_save.magic = SAVE_MAGIC;
        save_write();
    }
}

void save_write(void)
{
    const u8 *d = (const u8 *)&g_save;
    for (unsigned i = 0; i < sizeof(SaveData); i++) SRAM[i] = d[i];
    SRAM[sizeof(SaveData)] = checksum(d, sizeof(SaveData));
}
