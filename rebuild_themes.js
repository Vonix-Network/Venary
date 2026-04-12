const fs = require('fs');
const path = require('path');

const themesDir = path.join(__dirname, 'public', 'themes');
const appJsPath = path.join(__dirname, 'public', 'js', 'app.js');

const themes = [
    { id: 'obsidian', name: 'Obsidian', description: 'Dark greys with crimson neon.', c1: '#FF0033', c2: '#99001F', bg: '#0F0F11', bg2: '#141417', bg3: '#1A1A1D', text: '#E0E6ED' },
    { id: 'nebula', name: 'Nebula', description: 'Deep space purple with cyan.', c1: '#00FFFF', c2: '#FF00FF', bg: '#0D0814', bg2: '#120B1C', bg3: '#170E24', text: '#E0E6ED' },
    { id: 'synthwave', name: 'Synthwave', description: 'Retrowave vibes.', c1: '#FF007F', c2: '#00F0FF', bg: '#0B0C10', bg2: '#13151C', bg3: '#1A1D26', text: '#E0E6ED' },
    { id: 'toxic', name: 'Toxic', description: 'Charcoal with neon lime.', c1: '#39FF14', c2: '#00B800', bg: '#101210', bg2: '#151815', bg3: '#1A1E1A', text: '#E0E6ED' },
    { id: 'magma', name: 'Magma', description: 'Deep dark red with blazing orange.', c1: '#FF4500', c2: '#FFD700', bg: '#140600', bg2: '#1C0800', bg3: '#240B00', text: '#E0E6ED' },
    { id: 'solarflare', name: 'Solarflare', description: 'Black with solar yellow and orange.', c1: '#FFCC00', c2: '#FF6600', bg: '#050505', bg2: '#0A0A0A', bg3: '#0F0F0F', text: '#E0E6ED' },
    { id: 'glacier', name: 'Glacier', description: 'Deep sea blue with ice blue.', c1: '#00FFFF', c2: '#88FFFF', bg: '#000A14', bg2: '#001122', bg3: '#001830', text: '#E0E6ED' },
    { id: 'bubblegum', name: 'Bubblegum', description: 'Dark magenta with soft pink.', c1: '#FF70A6', c2: '#FF9770', bg: '#120A10', bg2: '#1A0F18', bg3: '#20131D', text: '#FFF0F5' },
    { id: 'hologram', name: 'Hologram', description: 'Dark violet with prismatic cyan.', c1: '#00FFFF', c2: '#BF00FF', bg: '#080114', bg2: '#0D0221', bg3: '#12032E', text: '#E0E6ED' },
    { id: 'stealth', name: 'Stealth', description: 'Pitch black with silver and blue.', c1: '#AAAAAA', c2: '#445588', bg: '#000000', bg2: '#050505', bg3: '#0A0A0A', text: '#CCCCCC' },
    { id: 'cyberpunk', name: 'Cyberpunk', description: 'Dark cyan with electric yellow.', c1: '#FCE205', c2: '#FF0055', bg: '#010A0B', bg2: '#011516', bg3: '#022021', text: '#E0E6ED' }
];

function hexToRgba(hex, alpha) {
    if(!hex) return 'rgba(0,0,0,1)';
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

// 1. Delete all old non-webgl css files
if (fs.existsSync(themesDir)) {
    const files = fs.readdirSync(themesDir);
    for (const f of files) {
        if (f.endsWith('.css') && !f.startsWith('webgl-')) {
            fs.unlinkSync(path.join(themesDir, f));
        }
    }
}

// 2. Write new themes
for (const t of themes) {
    const css = `/*
 * Name: ${t.name}
 * Description: ${t.description}
 * Author: Venary
 * Version: 2.0.0
 */

:root {
  --bg-primary: ${t.bg};
  --bg-secondary: ${t.bg2};
  --bg-tertiary: ${t.bg3};
  
  --bg-card: ${hexToRgba(t.bg2, 0.85)};
  --bg-card-hover: ${hexToRgba(t.bg3, 0.95)};
  --bg-input: ${hexToRgba(t.bg3, 0.9)};

  --neon-cyan: ${t.c1}; 
  --neon-magenta: ${t.c2};
  --neon-pink: ${t.c1};
  --neon-green: ${t.c2};
  --neon-blue: ${t.c1};
  
  --text-primary: ${t.text};
  --text-secondary: ${hexToRgba(t.text, 0.7)};
  --text-highlight: ${t.c1};

  --border-subtle: ${hexToRgba(t.c1, 0.1)};
  --border-light: ${hexToRgba(t.c1, 0.2)};
  --border-accent: ${hexToRgba(t.c1, 0.5)};

  --gradient-primary: linear-gradient(135deg, ${t.c1} 0%, ${t.c2} 100%);
  --gradient-secondary: linear-gradient(135deg, ${t.c2} 0%, ${t.c1} 100%);
  --gradient-accent: linear-gradient(135deg, ${t.c1} 0%, ${t.c2} 100%);
  --gradient-warm: linear-gradient(135deg, ${t.c1} 0%, ${t.c1} 100%);
  --gradient-dark: linear-gradient(135deg, ${t.bg} 0%, ${t.bg3} 100%);

  --shadow-neon: 0 0 20px ${hexToRgba(t.c1, 0.2)};
  --shadow-neon-strong: 0 0 32px ${hexToRgba(t.c1, 0.4)};
}
`;
    fs.writeFileSync(path.join(themesDir, t.id + '.css'), css);
}

// 3. Update app.js
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Replace color swatch switch cases
appJs = appJs.replace(/let bgStyle = 'background: #555';[\s\S]*?colorsHtml \+=/g, `let bgStyle = 'background: #555';
                ${themes.map(t => `if(t.id === '${t.id}') bgStyle = 'background: linear-gradient(135deg, ${t.c1}, ${t.c2})';`).join('\\n                else ')}
                
                colorsHtml +=`);

// Replace Preset HTML
appJs = appJs.replace(/<div class="appearance-card" onclick="App\.applyPreset\('bame'\)">[\s\S]*?<\/div>[\s]*?<\/div>/, `<div class="appearance-card" onclick="App.applyPreset('obsidian')">
                            <div class="card-preview" style="background:#0F0F11; border-left:15px solid #FF0033;"></div>
                            <span>Obsidian (Esports)</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('synthwave')">
                            <div class="card-preview" style="background:#0B0C10; overflow:hidden;"><div style="width:100%;height:100%;margin:5px;background:#FF007F"></div></div>
                            <span>Synthwave (Broadcast)</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('toxic')">
                            <div class="card-preview" style="background:#101210; border-left:15px solid #39FF14;"></div>
                            <span>Toxic (Zombie)</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('cyberpunk')">
                            <div class="card-preview" style="background:#010A0B; border-top:15px solid #FCE205; border-radius:0;"></div>
                            <span>Cyberpunk (NFT)</span>
                        </div>
                    </div>
                </div>`);

// Replace applyPreset function body
appJs = appJs.replace(/} else if \(presetId === 'bame'\) {[\s\S]*?} else if \(presetId === 'mykd'\) {[\s\S]*?}/, `} else if (presetId === 'obsidian') {
            layout = 'default'; color = 'obsidian'; bg = 'default'; radius = 'medium';
        } else if (presetId === 'synthwave') {
            layout = 'wide'; color = 'synthwave'; bg = 'none'; radius = 'round';
        } else if (presetId === 'toxic') {
            layout = 'compact'; color = 'toxic'; bg = 'none'; radius = 'sharp';
        } else if (presetId === 'cyberpunk') {
            layout = 'top-nav'; color = 'cyberpunk'; bg = 'webgl-matrix'; radius = 'sharp';
        }`);

fs.writeFileSync(appJsPath, appJs);
console.log('Rebuild completed successfully.');
