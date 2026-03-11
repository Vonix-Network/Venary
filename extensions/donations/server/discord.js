/**
 * Donations Extension - Discord Integration
 */
module.exports = (discordBot, extDb) => {
    
    // Command to list available donation ranks
    discordBot.registerCommand({
        name: 'donations-list-ranks',
        description: 'List all available donation ranks and their prices'
    }, async (interaction) => {
        try {
            const ranks = await extDb.all('SELECT name, price, description, icon FROM donation_ranks WHERE active = 1 ORDER BY sort_order ASC');
            
            if (ranks.length === 0) {
                return interaction.reply({ content: 'No donation ranks are currently available.', ephemeral: true });
            }

            const embed = {
                color: 0x22c55e,
                title: 'Available Donation Ranks',
                description: 'Support the platform and unlock exclusive perks!',
                fields: ranks.map(r => ({
                    name: `${r.icon} ${r.name} - $${r.price.toFixed(2)}`,
                    value: r.description || 'No description available.',
                    inline: false
                })),
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('[Donations-Discord] List ranks error:', err);
            await interaction.reply({ content: 'Failed to fetch donation ranks.', ephemeral: true });
        }
    });
};
