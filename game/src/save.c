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

// ---------------------------------------------------------------- v0.3 story block (memory fragments, endings) at 0x200
#define MEM_OFS 0x200
#define MEM_MAGIC 0x4D525342   // "BSRM"
#define MEM_VER 1
MemSave g_mem;

void mem_load(void)
{
    u8 *d = (u8 *)&g_mem;
    for (unsigned i = 0; i < sizeof(MemSave); i++) d[i] = SRAM[MEM_OFS + i];
    u8 ck = SRAM[MEM_OFS + sizeof(MemSave)];
    if (g_mem.magic != MEM_MAGIC || g_mem.ver == 0 || g_mem.ver > MEM_VER || ck != checksum(d, sizeof(MemSave))) {
        memset(&g_mem, 0, sizeof(g_mem));     // first boot on v0.3 (or a v0.1/v0.2 save): start the story block empty
        g_mem.magic = MEM_MAGIC; g_mem.ver = MEM_VER;
        mem_save();
    }
    // future versions: if (g_mem.ver < N) migrate new fields here, then bump ver
}

void mem_save(void)
{
    const u8 *d = (const u8 *)&g_mem;
    for (unsigned i = 0; i < sizeof(MemSave); i++) SRAM[MEM_OFS + i] = d[i];
    SRAM[MEM_OFS + sizeof(MemSave)] = checksum(d, sizeof(MemSave));
}

int mem_unlock(int id)
{
    if (id < 0 || id >= NUM_MEM || (g_mem.mem & (1u << id))) return 0;
    g_mem.mem |= 1u << id;
    mem_save();
    return 1;
}
