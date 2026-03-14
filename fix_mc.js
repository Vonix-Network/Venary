const Database = require('better-sqlite3');

const extDb = new Database('./data/ext_minecraft.db');

const linkedAccounts = extDb.prepare('SELECT * FROM linked_accounts').all();

console.log(`Found ${linkedAccounts.length} linked accounts.`);

let xpFixed = 0;

for (const lnk of linkedAccounts) {
    if (lnk.minecraft_xp === 0) {
        const mcPlayer = extDb.prepare('SELECT xp FROM mc_players WHERE uuid = ?').get(lnk.minecraft_uuid);
        if (mcPlayer && mcPlayer.xp > 0) {
            console.log(`Fixing XP for ${lnk.minecraft_username}: migrating ${mcPlayer.xp} XP.`);
            extDb.prepare('UPDATE linked_accounts SET minecraft_xp = ? WHERE id = ?').run(mcPlayer.xp, lnk.id);
            xpFixed++;
        }
    }
}

console.log(`Done. Fixed XP for ${xpFixed} accounts.`);
