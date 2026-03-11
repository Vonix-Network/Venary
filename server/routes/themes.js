const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Get available themes
router.get('/', (req, res) => {
    try {
        const themesDir = path.join(__dirname, '..', '..', 'public', 'themes');
        const themes = [];

        // Always include the default Venary theme
        themes.push({
            id: 'default',
            name: 'Venary Default',
            description: 'The standard dark glassmorphism theme.',
            author: 'Venary',
            version: '1.0.0'
        });

        if (fs.existsSync(themesDir)) {
            const files = fs.readdirSync(themesDir);
            for (const file of files) {
                if (file.endsWith('.css')) {
                    const id = file.replace('.css', '');
                    const content = fs.readFileSync(path.join(themesDir, file), 'utf-8');

                    // Basic parser to extract CSS comment header blocks
                    // Format: /* Name: X\n * Description: Y\n ... */
                    let name = id;
                    let description = 'Custom imported theme.';
                    let author = 'Unknown';
                    let version = '1.0.0';

                    const headerMatch = content.match(/\/\*([\s\S]*?)\*\//);
                    if (headerMatch) {
                        const lines = headerMatch[1].split('\n');
                        for (const line of lines) {
                            if (line.match(/name:/i)) name = line.split(':')[1].trim();
                            if (line.match(/description:/i)) description = line.split(':')[1].replace(/\*\/?/, '').trim();
                            if (line.match(/author:/i)) author = line.split(':')[1].replace(/\*\/?/, '').trim();
                            if (line.match(/version:/i)) version = line.split(':')[1].replace(/\*\/?/, '').trim();
                        }
                    }

                    themes.push({
                        id,
                        name,
                        description,
                        author,
                        version
                    });
                }
            }
        }

        res.json(themes);
    } catch (err) {
        console.error('Failed to load themes:', err);
        res.status(500).json({ error: 'Failed to load themes' });
    }
});

module.exports = router;
