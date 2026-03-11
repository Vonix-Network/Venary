/**
 * Forum Extension - Discord Integration
 */
module.exports = (discordBot, extDb) => {
    
    // Command to list latest forum threads
    discordBot.registerCommand({
        name: 'forum-latest',
        description: 'Check the latest discussions on the forum'
    }, async (interaction) => {
        try {
            const threads = await extDb.all(`
                SELECT t.title, t.id, c.name as category_name, t.created_at
                FROM threads t
                JOIN categories c ON t.category_id = c.id
                ORDER BY t.created_at DESC
                LIMIT 5
            `);
            
            if (threads.length === 0) {
                return interaction.reply({ content: 'No forum threads have been created yet.', ephemeral: true });
            }

            const embed = {
                color: 0x7b2fff,
                title: 'Latest Forum Discussions',
                description: 'Join the conversation on the forum!',
                fields: threads.map(t => ({
                    name: t.title,
                    value: `Category: ${t.category_name} | Created: ${new Date(t.created_at).toLocaleString()}`,
                    inline: false
                })),
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error('[Forum-Discord] Latest command error:', err);
            await interaction.reply({ content: 'Failed to fetch latest forum threads.', ephemeral: true });
        }
    });
};
