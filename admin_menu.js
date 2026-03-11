const readline = require('readline');
const Config = require('./server/config');
const db = require('./server/db');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function prompt(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function menu() {
    console.log('\n================================');
    console.log('   VENARY ADMIN DATABASE MENU   ');
    console.log('================================');
    console.log('1. List recent users (limit 10)');
    console.log('2. Promote User to Admin');
    console.log('3. Ban User');
    console.log('4. Unban User');
    console.log('5. Execute raw SQL query');
    console.log('6. Exit');
    
    const choice = await prompt('\nSelect an option (1-6): ');
    
    try {
        switch(choice.trim()) {
            case '1':
                const users = await db.all('SELECT id, username, email, role, banned FROM users ORDER BY created_at DESC LIMIT 10');
                console.table(users);
                break;
            case '2':
                const promoteUser = await prompt('Enter username to promote: ');
                const u1 = await db.get('SELECT id FROM users WHERE username = ?', [promoteUser]);
                if (u1) {
                    await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [u1.id]);
                    console.log(`\n[SUCCESS] Promoted ${promoteUser} to admin.`);
                } else {
                    console.log('\n[ERROR] User not found.');
                }
                break;
            case '3':
                const banUser = await prompt('Enter username to ban: ');
                const u2 = await db.get('SELECT id FROM users WHERE username = ?', [banUser]);
                if (u2) {
                    const reason = await prompt('Enter ban reason: ');
                    await db.run("UPDATE users SET banned = 1, ban_reason = ?, status = 'offline' WHERE id = ?", [reason, u2.id]);
                    console.log(`\n[SUCCESS] Banned ${banUser}.`);
                } else {
                    console.log('\n[ERROR] User not found.');
                }
                break;
            case '4':
                const unbanUser = await prompt('Enter username to unban: ');
                const u3 = await db.get('SELECT id FROM users WHERE username = ?', [unbanUser]);
                if (u3) {
                    await db.run("UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?", [u3.id]);
                    console.log(`\n[SUCCESS] Unbanned ${unbanUser}.`);
                } else {
                    console.log('\n[ERROR] User not found.');
                }
                break;
            case '5':
                const query = await prompt('Enter SQL query: ');
                if (query.trim().toLowerCase().startsWith('select') || query.trim().toLowerCase().startsWith('pragma')) {
                    const result = await db.all(query);
                    console.table(result);
                } else {
                    const result = await db.run(query);
                    console.log('\n[SUCCESS] Query executed successfully. Changes:', result.changes || 0);
                }
                break;
            case '6':
                console.log('Exiting...');
                process.exit(0);
                break;
            default:
                console.log('\n[ERROR] Invalid option.');
        }
    } catch (e) {
        console.error('\n[ERROR]', e.message);
    }
    
    // Slight delay before next prompt
    setTimeout(menu, 1000);
}

async function init() {
    console.log('Connecting to database...');
    try {
        if (!Config.isSetupComplete()) {
            console.error('Setup not complete. Please run the web setup first.');
            process.exit(1);
        }
        const dbConfig = Config.getDatabaseConfig();
        await db.init(dbConfig);
        menu();
    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

init();
