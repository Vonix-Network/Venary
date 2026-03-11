/**
 * Minecraft Extension - Discord Integration
 * This file is automatically loaded by Venary's extension loader.
 */
module.exports = (discordBot, extDb) => {
    
    // Register a status command for the Minecraft extension
    discordBot.registerCommand({
        name: 'mc-status',
        description: 'Check the status of configured Minecraft servers'
    }, async (interaction) => {
        try {
            const servers = await extDb.all('SELECT name, address, port, is_online, players_online, players_max FROM servers');
            
            if (servers.length === 0) {
                return interaction.reply({ content: 'No Minecraft servers are currently configured.', ephemeral: true });
            }

            const embed = {
                color: 0x00ff00,
                title: 'Minecraft Server Status',
                fields: servers.map(s => ({
                    name: s.name,
                    value: `${s.is_online ? '✅ Online' : '❌ Offline'} | \`${s.address}:${s.port}\`\nPlayers: ${s.players_online}/${s.players_max}`,
                    inline: false
                })),
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('[MC-Discord] Status command error:', err);
            await interaction.reply({ content: 'Failed to fetch server status.', ephemeral: true });
        }
    });

    // Example of registering a listener
    discordBot.registerListener('messageCreate', (message) => {
        if (message.author.bot) return;
        if (message.content.toLowerCase() === '!mc') {
            message.reply('Use `/mc-status` to check the Minecraft servers!');
        }
    });
};
