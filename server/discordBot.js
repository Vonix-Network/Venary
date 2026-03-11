const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const Config = require('./config');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

let isReady = false;
const commands = new Map();

client.once('ready', () => {
    isReady = true;
    console.log(`[Discord] Central Bot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.handler(interaction);
    } catch (error) {
        console.error(`[Discord] Error executing command ${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

async function init() {
    const cfg = Config.load() || {};
    const token = cfg.discord?.botToken;

    if (!token || token === '••••••••') {
        console.log('[Discord] No valid bot token found in settings. Bot inactive.');
        return;
    }

    try {
        await client.login(token);
    } catch (err) {
        console.error('[Discord] Failed to start bot:', err.message);
    }
}

/**
 * Register a slash command.
 * @param {Object} commandData - The command data (Name, Description, Options, etc.)
 * @param {Function} handler - The function to handle the interaction
 */
function registerCommand(commandData, handler) {
    commands.set(commandData.name, { data: commandData, handler });
    console.log(`[Discord] Registered command: /${commandData.name}`);
}

/**
 * Register a generic event listener.
 * @param {string} event - Discord.js event name
 * @param {Function} handler - Event handler function
 */
function registerListener(event, handler) {
    client.on(event, handler);
    console.log(`[Discord] Registered listener for event: ${event}`);
}

/**
 * Deploy registered commands to Discord.
 * Should be called after all extensions are loaded.
 */
async function deployCommands() {
    const cfg = Config.load() || {};
    const token = cfg.discord?.botToken;
    const clientId = client.user?.id;
    const guildId = cfg.discord?.guildId;

    if (!token || !clientId || !guildId) {
        console.warn('[Discord] Skipping command deployment: Missing token, clientId, or guildId.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const body = Array.from(commands.values()).map(c => c.data);

    try {
        console.log(`[Discord] Started refreshing ${body.length} application (/) commands.`);
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body }
        );
        console.log('[Discord] Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('[Discord] Failed to deploy commands:', error);
    }
}

// Helper to reliably ping someone by role dynamically using the cached/active discord client
async function dmMembersByRole(guildId, roleId, messageContent) {
    if (!isReady || !guildId || !roleId) return false;

    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return false;

        // Force fetch all members to ensure cache is populated
        await guild.members.fetch();

        const cleanRoleId = roleId.replace(/[^0-9]/g, '');
        const targetMembers = guild.members.cache.filter(m => m.roles.cache.has(cleanRoleId));

        let sentCount = 0;
        for (const [id, member] of targetMembers) {
            try {
                await member.send(messageContent);
                sentCount++;
            } catch (dmErr) {
                console.error(`[Discord] Could not DM user ${id}:`, dmErr.message);
            }
        }
        return sentCount > 0;
    } catch (err) {
        console.error('[Discord] dmMembersByRole error:', err);
        return false;
    }
}

module.exports = {
    client,
    init,
    get isReady() { return isReady; },
    dmMembersByRole,
    registerCommand,
    registerListener,
    deployCommands
};
