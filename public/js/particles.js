/* =======================================
   Venary — Interactive Live Wallpapers Engine
   Supports: Default, Vonix, Pink, Purple, Warp, Ocean, Galaxy, Prism
   ======================================= */
const ParticleEngine = {
    canvas: null,
    ctx: null,
    theme: 'default',
    entities: [],
    mouse: { x: -1000, y: -1000, vx: 0, vy: 0 },
    lastMouse: { x: -1000, y: -1000 },
    time: 0,
    paused: false,
    _lastFrameTime: 0,

    init() {
        this.canvas = document.getElementById('particle-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.resize();
        this.bindEvents();

        // Initial setup based on current theme
        this.refreshTheme();
        this.animate();

        // Listen for theme changes from app.js
        const observer = new MutationObserver(() => this.refreshTheme());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    },

    pause() {
        this.paused = true;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.animate();
    },

    refreshTheme(forceBgId) {
        this.theme = document.documentElement.getAttribute('data-theme') || 'default'; // keep for color
        this.bgStyle = forceBgId || localStorage.getItem('venary_bg') || this.theme;
        this.entities = []; // Reset entities
        this.time = 0;
        this.canvas.style.filter = 'none';

        switch (this.bgStyle) {
            case 'vonix':
            case 'default':
            case 'ocean':
            case 'prism':
            case 'purple':
                this.initRibbons();
                break;
            case 'pink': {
                const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { style: 'bubbles' };
                if (cfg.style === 'ribbons') {
                    this.initRibbons();
                } else {
                    this.initBubbles();
                }
                break;
            }
            case 'lavalamp':
                this.canvas.style.filter = 'blur(12px) contrast(20)'; // reduced for performance
                this.initLava();
                break;
            case 'warp':
                this.initWarpFlow();
                break;
            case 'galaxy':
                this.initGalaxy();
                break;
            case 'fireflies':
                this.initFireflies();
                break;
            case 'snow':
                this.initSnow();
                break;
            case 'network':
                this.initNetwork();
                break;
            case 'meteor':
                this.initMeteor();
                break;
            case 'neon-tunnel':
                this.initNeonTunnel();
                break;
            case 'particle-burst':
                this.initParticleBurst();
                break;
            case 'light-streams':
                this.initLightStreams();
                break;
            case 'chromatic-vortex':
                this.initChromaticVortex();
                break;
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.refreshTheme();
    },

    bindEvents() {
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.resize(), 100);
        });

        const updateMouse = (e) => {
            const x = e.clientX || (e.touches && e.touches[0].clientX);
            const y = e.clientY || (e.touches && e.touches[0].clientY);
            if (x === undefined || y === undefined) return;

            if (this.lastMouse.x === -1000) {
                this.lastMouse.x = x;
                this.lastMouse.y = y;
            } else {
                this.lastMouse.x = this.mouse.x;
                this.lastMouse.y = this.mouse.y;
            }

            this.mouse.x = x;
            this.mouse.y = y;
            this.mouse.vx = this.mouse.x - this.lastMouse.x;
            this.mouse.vy = this.mouse.y - this.lastMouse.y;
        };

        document.addEventListener('mousemove', updateMouse);
        document.addEventListener('touchmove', updateMouse);
        document.addEventListener('mouseleave', () => {
            this.mouse.x = -1000;
            this.mouse.y = -1000;
            this.mouse.vx = 0;
            this.mouse.vy = 0;
        });

        // Pause when tab is hidden, resume on return — major CPU saver
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                const bg = localStorage.getItem('venary_bg') || 'default';
                if (bg !== 'none') this.restart(bg);
            }
        });
    },

    // ─── INITIALIZERS ────────────────────────────────────────────────────────────

    initRibbons() {
        const count = this.bgStyle === 'prism' ? 8 : 5;
        let colors = [];
        
        // Color is determined by the color palette (this.theme), not the background
        if (this.theme === 'vonix') {
            colors = [
                { r: 180, g: 220, b: 255 }, { r: 0, g: 150, b: 255 },
                { r: 255, g: 255, b: 255 }, { r: 50, g: 130, b: 200 }, { r: 150, g: 200, b: 255 }
            ];
        } else if (this.theme === 'ocean') {
            colors = [
                { r: 0, g: 229, b: 255 }, { r: 0, g: 102, b: 255 },
                { r: 153, g: 235, b: 255 }, { r: 0, g: 153, b: 204 }, { r: 0, g: 51, b: 204 }
            ];
        } else if (this.theme === 'prism') {
            colors = [
                { r: 255, g: 51, b: 51 }, { r: 255, g: 255, b: 51 },
                { r: 51, g: 255, b: 51 }, { r: 51, g: 255, b: 255 },
                { r: 51, g: 51, b: 255 }, { r: 255, g: 51, b: 255 },
                { r: 255, g: 153, b: 51 }, { r: 51, g: 255, b: 153 }
            ];
        } else if (this.theme === 'purple') {
            colors = [
                { r: 178, g: 141, b: 255 }, { r: 197, g: 163, b: 255 },
                { r: 138, g: 82, b: 255 }, { r: 106, g: 13, b: 173 }, { r: 213, g: 184, b: 255 }
            ];
        } else if (this.theme === 'pink') {
            const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { preset: 'pink' };
            if (cfg.preset === 'purple') {
                colors = [
                    { r: 178, g: 141, b: 255 }, { r: 197, g: 163, b: 255 },
                    { r: 138, g: 82, b: 255 }, { r: 106, g: 13, b: 173 }, { r: 213, g: 184, b: 255 }
                ];
            } else if (cfg.preset === 'custom' && cfg.colors) {
                colors = cfg.colors.map(c => this.hexToRgb(c));
            } else {
                colors = [
                    { r: 255, g: 112, b: 166 }, { r: 255, g: 151, b: 112 },
                    { r: 255, g: 80, b: 150 }, { r: 255, g: 120, b: 90 }, { r: 255, g: 60, b: 140 }
                ];
            }
        } else { // default
            colors = [
                { r: 176, g: 38, b: 255 }, { r: 0, g: 240, b: 255 },
                { r: 57, g: 255, b: 20 }, { r: 255, g: 45, b: 120 }, { r: 77, g: 124, b: 255 }
            ];
        }

        for (let i = 0; i < count; i++) {
            this.entities.push({
                yOffset: this.bgStyle === 'default' ? (this.canvas.height / 2) + (Math.random() - 0.5) * 200 : this.canvas.height / 2,
                amplitude: (this.bgStyle === 'prism' ? 80 : 150) + Math.random() * 80,
                speedMultiplier: (this.bgStyle === 'ocean' ? 0.2 : 0.4) + Math.random() * 0.5,
                phase: Math.random() * Math.PI * 2,
                wavelength: (this.bgStyle === 'prism' ? 0.003 : 0.0015) + Math.random() * 0.001,
                color: colors[i % colors.length],
                mouseInfluence: 0,
                targetMouseInfluence: 0,
                thickness: (this.bgStyle === 'prism' ? 5 : 20) + Math.random() * (this.bgStyle === 'prism' ? 10 : 40),
                opacity: this.bgStyle === 'default' ? 0.15 + i * 0.05 : 0.2 + (Math.random() * 0.3)
            });
        }
    },

    initBubbles() {
        const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { preset: 'pink' };
        for (let i = 0; i < 50; i++) {
            this.entities.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 30 + 10,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5 - 0.5,
                opacity: Math.random() * 0.5 + 0.1,
                phase: Math.random() * Math.PI * 2
            });
        }
    },

    initLava() {
        for (let i = 0; i < 18; i++) {
            this.entities.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: 60 + Math.random() * 100,
                vx: (Math.random() - 0.5) * 0.4, // very slow horizontal drift
                vy: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.5 + 0.3), // slow rise or sink
                mass: Math.random() * 10 + 5
            });
        }
    },

    initWarpFlow() {
        for (let i = 0; i < 200; i++) {
            this.entities.push({
                x: (Math.random() - 0.5) * this.canvas.width * 2,
                y: (Math.random() - 0.5) * this.canvas.height * 2,
                z: Math.random() * 1000,
                speed: Math.random() * 5 + 2,
                color: Math.random() > 0.5 ? '#ff00ff' : '#00ffff'
            });
        }
    },

    initGalaxy() {
        for (let i = 0; i < 300; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * Math.max(this.canvas.width, this.canvas.height);
            this.entities.push({
                angle: angle,
                radius: radius,
                baseRadius: radius,
                speed: (Math.random() * 0.002 + 0.001) * (Math.random() > 0.5 ? 1 : -1),
                size: Math.random() * 2.5 + 0.5,
                color: Math.random() > 0.6 ? '#4dc4ff' : (Math.random() > 0.5 ? '#1a5cff' : '#4d0099')
            });
        }
    },

    // ─── RENDERERS ───────────────────────────────────────────────────────────────

    animate() {
        if (this.paused) return;

        // Throttle to ~30fps to cut CPU/GPU load in half vs 60fps
        const now = performance.now();
        if (now - this._lastFrameTime < 32) {
            this.animationId = requestAnimationFrame(() => this.animate());
            return;
        }
        this._lastFrameTime = now;

        this.ctx.globalCompositeOperation = 'source-over';

        let bgColor = '#000000';
        if      (this.bgStyle === 'default')   bgColor = '#0a0e17';
        else if (this.bgStyle === 'ocean')     bgColor = '#000810';
        else if (this.bgStyle === 'pink') {
            const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { preset: 'pink' };
            bgColor = cfg.preset === 'purple' ? '#0a0512' : '#120a10';
        }
        else if (this.bgStyle === 'lavalamp')  bgColor = '#120302';
        else if (this.bgStyle === 'purple')    bgColor = '#0a0512';
        else if (this.bgStyle === 'warp')      bgColor = '#020005';
        else if (this.bgStyle === 'galaxy')    bgColor = '#050508';
        else if (this.bgStyle === 'vonix')     bgColor = '#05060A';
        else if (this.bgStyle === 'prism')     bgColor = '#080010';
        else if (this.bgStyle === 'fireflies') bgColor = '#010308';
        else if (this.bgStyle === 'snow')      bgColor = '#040810';
        else if (this.bgStyle === 'network')   bgColor = '#020408';
        else if (this.bgStyle === 'meteor')         bgColor = '#010108';
        else if (this.bgStyle === 'neon-tunnel')    bgColor = '#000000';
        else if (this.bgStyle === 'particle-burst') bgColor = '#070008';
        else if (this.bgStyle === 'light-streams')  bgColor = '#020510';
        else if (this.bgStyle === 'chromatic-vortex') bgColor = '#000000';

        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.time += 0.003;
        const mouseObj = { ...this.mouse };
        this.mouse.vx *= 0.9;
        this.mouse.vy *= 0.9;

        this.ctx.globalCompositeOperation = 'screen';

        switch (this.bgStyle) {
            case 'vonix':
            case 'default':
            case 'ocean':
            case 'prism':
            case 'purple':
                this.renderRibbons(mouseObj);
                break;
            case 'pink': {
                const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { style: 'bubbles' };
                if (cfg.style === 'ribbons') this.renderRibbons(mouseObj);
                else this.renderBubbles(mouseObj);
                break;
            }
            case 'lavalamp':  this.renderLava(mouseObj);      break;
            case 'warp':      this.renderWarpFlow(mouseObj);  break;
            case 'galaxy':    this.renderGalaxy(mouseObj);    break;
            case 'fireflies': this.renderFireflies(mouseObj); break;
            case 'snow':      this.renderSnow(mouseObj);      break;
            case 'network':   this.renderNetwork(mouseObj);   break;
            case 'meteor':           this.renderMeteor(mouseObj);         break;
            case 'neon-tunnel':      this.renderNeonTunnel(mouseObj);     break;
            case 'particle-burst':   this.renderParticleBurst(mouseObj);  break;
            case 'light-streams':    this.renderLightStreams(mouseObj);    break;
            case 'chromatic-vortex': this.renderChromaticVortex(mouseObj);break;
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    },

    renderRibbons(mouse) {
        const mouseSpeed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);

        for (let i = 0; i < this.entities.length; i++) {
            const r = this.entities[i];

            if (mouse.y !== -1000) {
                const distY = Math.abs(mouse.y - r.yOffset);
                if (distY < 300) {
                    const force = (300 - distY) / 300;
                    r.targetMouseInfluence += (mouse.y > r.yOffset ? -1 : 1) * force * mouseSpeed * 0.02;
                }
            }

            r.targetMouseInfluence *= 0.95;
            r.mouseInfluence += (r.targetMouseInfluence - r.mouseInfluence) * 0.1;

            this.ctx.beginPath();
            
            if (this.bgStyle !== 'default') {
                const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
                gradient.addColorStop(0, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, 0)`);
                gradient.addColorStop(0.5, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, ${r.opacity * 1.5})`);
                gradient.addColorStop(1, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, 0)`);
                this.ctx.fillStyle = gradient;

                let topPoints = [];
                let bottomPoints = [];

                for (let x = -50; x <= this.canvas.width + 50; x += (this.bgStyle === 'prism' ? 10 : 20)) {
                    const wave1 = Math.sin(x * r.wavelength + this.time * r.speedMultiplier + r.phase);
                    const wave2 = Math.sin(x * (r.wavelength * 1.8) - this.time * (r.speedMultiplier * 0.6));
                    const wave3 = Math.sin(x * (r.wavelength * 0.4) + this.time * (r.speedMultiplier * 1.3));

                    const combinedWave = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
                    const offsetBounce = Math.sin(this.time * 0.8 + i) * (this.bgStyle === 'prism' ? 80 : 40);

                    const centerDist = Math.abs(x - this.canvas.width / 2);
                    const maxDist = this.canvas.width / 1.5;
                    let taper = 1 - Math.pow(centerDist / maxDist, 2);
                    if (taper < 0) taper = 0;

                    const y = r.yOffset + offsetBounce + combinedWave * r.amplitude * taper + r.mouseInfluence * Math.sin(x * 0.01);
                    const currentThickness = r.thickness * taper;

                    topPoints.push({ x, y: y - currentThickness });
                    bottomPoints.unshift({ x, y: y + currentThickness });
                }

                this.ctx.moveTo(topPoints[0].x, topPoints[0].y);
                for (let j = 1; j < topPoints.length; j++) this.ctx.lineTo(topPoints[j].x, topPoints[j].y);
                for (let j = 0; j < bottomPoints.length; j++) this.ctx.lineTo(bottomPoints[j].x, bottomPoints[j].y);

                this.ctx.closePath();
                this.ctx.fill();
            } else {
                // Default mode (legacy bottom waves)
                const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
                gradient.addColorStop(0, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, ${r.opacity})`);
                gradient.addColorStop(1, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, ${r.opacity * 0.2})`);
                this.ctx.fillStyle = gradient;

                this.ctx.moveTo(0, this.canvas.height);
                this.ctx.lineTo(0, r.yOffset);

                for (let x = 0; x <= this.canvas.width; x += 15) {
                    const wave1 = Math.sin(x * r.wavelength + this.time * r.speedMultiplier + r.phase);
                    const wave2 = Math.sin(x * (r.wavelength * 1.6) - this.time * (r.speedMultiplier * 0.7));
                    const y = r.yOffset + Math.sin(this.time * 0.5 + i) * 60 + (wave1 * 0.6 + wave2 * 0.4) * r.amplitude + r.mouseInfluence * Math.sin(x * 0.01);
                    this.ctx.lineTo(x, y);
                }

                this.ctx.lineTo(this.canvas.width, this.canvas.height);
                this.ctx.closePath();
                this.ctx.fill();
            }
        }
    },

    renderBubbles(mouse) {
        for (let i = 0; i < this.entities.length; i++) {
            const b = this.entities[i];
            
            b.x += b.vx;
            b.y += b.vy + Math.sin(this.time * 2 + b.phase) * 0.5;

            // Mouse interaction
            if (mouse.x !== -1000) {
                const dx = b.x - mouse.x;
                const dy = b.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    b.vx += (dx / dist) * 0.1;
                    b.vy += (dy / dist) * 0.1;
                }
            }

            // Friction & wrap
            b.vx *= 0.99;
            if (b.y < -50) b.y = this.canvas.height + 50;
            if (b.x < -50) b.x = this.canvas.width + 50;
            if (b.x > this.canvas.width + 50) b.x = -50;

            const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { preset: 'pink' };
            let primary = { r: 255, g: 112, b: 166 };
            let secondary = { r: 255, g: 151, b: 112 };

            if (cfg.preset === 'purple') {
                primary = { r: 178, g: 141, b: 255 };
                secondary = { r: 197, g: 163, b: 255 };
            } else if (cfg.preset === 'custom' && cfg.colors && cfg.colors.length >= 2) {
                primary = this.hexToRgb(cfg.colors[0]);
                secondary = this.hexToRgb(cfg.colors[1]);
            }

            const grad = this.ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
            grad.addColorStop(0, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${b.opacity})`);
            grad.addColorStop(1, `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0)`);
            
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = grad;
            this.ctx.fill();
        }
    },

    renderLava(mouse) {
        const cfg = JSON.parse(localStorage.getItem('venary_bg_lavalamp')) || {};
        let primary = cfg.primary ? this.hexToRgb(cfg.primary) : { r: 255, g: 51, b: 0 };
        let secondary = cfg.secondary ? this.hexToRgb(cfg.secondary) : { r: 255, g: 153, b: 0 };

        for (let i = 0; i < this.entities.length; i++) {
            const b = this.entities[i];
            
            // Basic blob physics
            b.x += b.vx;
            b.y += Math.sin(this.time + i) * 0.3 + b.vy; // slight wiggle

            // Bounce off walls gently
            if (b.x < b.radius) { b.x = b.radius; b.vx *= -1; }
            if (b.x > this.canvas.width - b.radius) { b.x = this.canvas.width - b.radius; b.vx *= -1; }
            if (b.y < -b.radius * 2) { b.y = this.canvas.height + b.radius; } // loop around
            if (b.y > this.canvas.height + b.radius * 2) { b.y = -b.radius; } // loop around

            // Draw metaball gradient - softer edges for the contrast filter
            const grad = this.ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
            // Mix the two colors dynamically based on particle index
            const mix = (Math.sin(i * 123.45) * 0.5 + 0.5); 
            const blobColor = {
                r: Math.round(primary.r * mix + secondary.r * (1 - mix)),
                g: Math.round(primary.g * mix + secondary.g * (1 - mix)),
                b: Math.round(primary.b * mix + secondary.b * (1 - mix))
            };

            grad.addColorStop(0, `rgba(${blobColor.r}, ${blobColor.g}, ${blobColor.b}, 1)`);
            grad.addColorStop(0.5, `rgba(${blobColor.r}, ${blobColor.g}, ${blobColor.b}, 0.8)`);
            grad.addColorStop(1, `rgba(${blobColor.r}, ${blobColor.g}, ${blobColor.b}, 0)`);
            
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = grad;
            this.ctx.fill();
        }
    },

    renderWarpFlow(mouse) {
        let centerX = this.canvas.width / 2;
        let centerY = this.canvas.height / 2;

        if (mouse.x !== -1000) {
            centerX += (mouse.x - centerX) * 0.2;
            centerY += (mouse.y - centerY) * 0.2;
        }

        for (let i = 0; i < this.entities.length; i++) {
            const p = this.entities[i];
            
            p.z -= p.speed * 2;
            if (p.z <= 0) {
                p.x = (Math.random() - 0.5) * this.canvas.width * 2;
                p.y = (Math.random() - 0.5) * this.canvas.height * 2;
                p.z = 1000;
                p.speed = Math.random() * 5 + 2;
            }

            const fov = 200;
            const px = centerX + (p.x * fov) / p.z;
            const py = centerY + (p.y * fov) / p.z;
            
            const px_old = centerX + (p.x * fov) / (p.z + p.speed * 10);
            const py_old = centerY + (p.y * fov) / (p.z + p.speed * 10);

            this.ctx.beginPath();
            this.ctx.moveTo(px_old, py_old);
            this.ctx.lineTo(px, py);
            this.ctx.strokeStyle = p.color;
            this.ctx.lineWidth = Math.min(5, 1000 / p.z);
            this.ctx.globalAlpha = Math.max(0, 1 - (p.z / 1000));
            this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1;
    },

    renderGalaxy(mouse) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        for (let i = 0; i < this.entities.length; i++) {
            const p = this.entities[i];
            
            p.angle += p.speed;
            let currentRadius = p.radius + Math.sin(this.time * 5 + p.angle) * 10;

            const x = cx + Math.cos(p.angle) * currentRadius;
            const y = cy + Math.sin(p.angle) * currentRadius;

            // Mouse gravity
            let targetRadius = p.baseRadius;
            if (mouse.x !== -1000) {
                const dx = x - mouse.x;
                const dy = y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 200) {
                    targetRadius = p.baseRadius - 50;
                }
            }
            p.radius += (targetRadius - p.radius) * 0.05;

            // Draw fake high-performance glow
            this.ctx.beginPath();
            this.ctx.arc(x, y, p.size * 4, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = 0.2;
            this.ctx.fill();

            // Draw bright core
            this.ctx.beginPath();
            this.ctx.arc(x, y, p.size, 0, Math.PI * 2);
            this.ctx.globalAlpha = 1.0;
            this.ctx.fill();
        }
    },

    // ─── FIREFLIES ───────────────────────────────────────────────────────────────
    initFireflies() {
        const accentColors = [
            { r: 255, g: 240, b: 100 },
            { r: 180, g: 255, b: 120 },
            { r: 100, g: 220, b: 255 },
        ];
        for (let i = 0; i < 28; i++) {
            const c = accentColors[i % accentColors.length];
            this.entities.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.35,
                vy: (Math.random() - 0.5) * 0.35,
                radius: Math.random() * 2 + 1,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 0.025 + Math.random() * 0.025,
                color: c,
                glowRadius: Math.random() * 18 + 12,
            });
        }
    },

    renderFireflies(mouse) {
        for (let i = 0; i < this.entities.length; i++) {
            const f = this.entities[i];
            f.pulsePhase += f.pulseSpeed;
            const pulse = Math.sin(f.pulsePhase) * 0.5 + 0.5;
            f.vx += (Math.random() - 0.5) * 0.015;
            f.vy += (Math.random() - 0.5) * 0.015;
            f.vx = Math.max(-0.6, Math.min(0.6, f.vx));
            f.vy = Math.max(-0.6, Math.min(0.6, f.vy));
            if (mouse.x !== -1000) {
                const dx = f.x - mouse.x, dy = f.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) { f.vx += (dx / dist) * 0.12; f.vy += (dy / dist) * 0.12; }
            }
            f.x += f.vx; f.y += f.vy;
            if (f.x < 0) f.x = this.canvas.width;
            if (f.x > this.canvas.width) f.x = 0;
            if (f.y < 0) f.y = this.canvas.height;
            if (f.y > this.canvas.height) f.y = 0;
            const opacity = pulse * 0.85 + 0.15;
            const gr = this.canvas.getContext ? this.ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.glowRadius * (0.5 + pulse * 0.5)) : null;
            if (gr) {
                gr.addColorStop(0, `rgba(${f.color.r},${f.color.g},${f.color.b},${opacity * 0.55})`);
                gr.addColorStop(1, `rgba(${f.color.r},${f.color.g},${f.color.b},0)`);
                this.ctx.beginPath();
                this.ctx.arc(f.x, f.y, f.glowRadius * (0.5 + pulse * 0.5), 0, Math.PI * 2);
                this.ctx.fillStyle = gr;
                this.ctx.fill();
            }
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.radius * (0.5 + pulse * 0.5), 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${f.color.r},${f.color.g},${f.color.b},${opacity})`;
            this.ctx.fill();
        }
    },

    // ─── SNOW ────────────────────────────────────────────────────────────────────
    initSnow() {
        for (let i = 0; i < 65; i++) {
            this.entities.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 2.5 + 0.8,
                speed: Math.random() * 0.7 + 0.25,
                drift: (Math.random() - 0.5) * 0.25,
                opacity: Math.random() * 0.65 + 0.2,
                sway: Math.random() * Math.PI * 2,
                swaySpeed: 0.008 + Math.random() * 0.012,
            });
        }
    },

    renderSnow(mouse) {
        for (let i = 0; i < this.entities.length; i++) {
            const s = this.entities[i];
            s.sway += s.swaySpeed;
            s.x += s.drift + Math.sin(s.sway) * 0.25;
            s.y += s.speed;
            if (s.y > this.canvas.height + 10) { s.y = -10; s.x = Math.random() * this.canvas.width; }
            if (s.x < -10) s.x = this.canvas.width + 10;
            if (s.x > this.canvas.width + 10) s.x = -10;
            const gr = this.ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius * 2.5);
            gr.addColorStop(0, `rgba(200, 230, 255, ${s.opacity})`);
            gr.addColorStop(0.5, `rgba(150, 190, 255, ${s.opacity * 0.4})`);
            gr.addColorStop(1, 'rgba(100, 150, 255, 0)');
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius * 2.5, 0, Math.PI * 2);
            this.ctx.fillStyle = gr;
            this.ctx.fill();
        }
    },

    // ─── NETWORK ─────────────────────────────────────────────────────────────────
    initNetwork() {
        for (let i = 0; i < 38; i++) {
            this.entities.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.28,
                vy: (Math.random() - 0.5) * 0.28,
                radius: Math.random() * 2 + 1,
                opacity: Math.random() * 0.45 + 0.3,
            });
        }
    },

    renderNetwork(mouse) {
        const maxDist = 150;
        for (let i = 0; i < this.entities.length; i++) {
            const n = this.entities[i];
            n.x += n.vx; n.y += n.vy;
            if (n.x < 0 || n.x > this.canvas.width) { n.vx *= -1; n.x = Math.max(0, Math.min(this.canvas.width, n.x)); }
            if (n.y < 0 || n.y > this.canvas.height) { n.vy *= -1; n.y = Math.max(0, Math.min(this.canvas.height, n.y)); }
        }
        this.ctx.lineWidth = 0.7;
        for (let i = 0; i < this.entities.length; i++) {
            for (let j = i + 1; j < this.entities.length; j++) {
                const a = this.entities[i], b = this.entities[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < maxDist) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(a.x, a.y);
                    this.ctx.lineTo(b.x, b.y);
                    this.ctx.strokeStyle = `rgba(41,182,246,${(1 - dist / maxDist) * 0.28})`;
                    this.ctx.stroke();
                }
            }
        }
        for (let i = 0; i < this.entities.length; i++) {
            const n = this.entities[i];
            const near = mouse.x !== -1000 && Math.hypot(n.x - mouse.x, n.y - mouse.y) < 80;
            const r = near ? n.radius * 2.5 : n.radius;
            const gr = this.ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
            gr.addColorStop(0, `rgba(41,182,246,${n.opacity * (near ? 1.6 : 1)})`);
            gr.addColorStop(1, 'rgba(41,182,246,0)');
            this.ctx.beginPath(); this.ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2);
            this.ctx.fillStyle = gr; this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(190,230,255,${n.opacity})`; this.ctx.fill();
        }
    },

    // ─── METEOR ──────────────────────────────────────────────────────────────────
    initMeteor() {
        for (let i = 0; i < 160; i++) {
            this.entities.push({
                type: 'star',
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 1.1 + 0.2,
                opacity: Math.random() * 0.75 + 0.2,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.008 + Math.random() * 0.018,
            });
        }
        this._nextMeteor = 2500 + Math.random() * 4000;
        this._lastMeteorTime = 0;
    },

    renderMeteor(mouse) {
        const now = performance.now();
        if (now - this._lastMeteorTime > this._nextMeteor) {
            this._lastMeteorTime = now;
            this._nextMeteor = 3000 + Math.random() * 6000;
            const sx = Math.random() * this.canvas.width * 0.6;
            const sy = Math.random() * this.canvas.height * 0.25;
            const spd = 5 + Math.random() * 5;
            const ang = (25 + Math.random() * 25) * Math.PI / 180;
            this.entities.push({ type: 'meteor', x: sx, y: sy, vx: spd * Math.cos(ang), vy: spd * Math.sin(ang), len: 90 + Math.random() * 110, life: 1 });
        }
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            if (e.type === 'star') {
                e.twinklePhase += e.twinkleSpeed;
                const tw = (Math.sin(e.twinklePhase) * 0.28 + 0.72) * e.opacity;
                this.ctx.beginPath(); this.ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(200,220,255,${tw})`; this.ctx.fill();
            } else {
                e.x += e.vx; e.y += e.vy; e.life -= 0.018;
                if (e.life <= 0 || e.x > this.canvas.width || e.y > this.canvas.height) { this.entities.splice(i, 1); continue; }
                const len = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
                const nx = e.vx / len, ny = e.vy / len;
                const gr = this.ctx.createLinearGradient(e.x, e.y, e.x - nx * e.len, e.y - ny * e.len);
                gr.addColorStop(0, `rgba(255,255,255,${e.life})`);
                gr.addColorStop(0.35, `rgba(180,220,255,${e.life * 0.45})`);
                gr.addColorStop(1, 'rgba(100,150,255,0)');
                this.ctx.beginPath(); this.ctx.moveTo(e.x, e.y);
                this.ctx.lineTo(e.x - nx * e.len, e.y - ny * e.len);
                this.ctx.strokeStyle = gr; this.ctx.lineWidth = 1.8; this.ctx.stroke();
            }
        }
    },

    // ─── NEON TUNNEL (Image ref: cyan/magenta geometric frames rushing at viewer) ─
    initNeonTunnel() {
        this._tunnelOffset = 0;
        this.entities = [];
    },

    renderNeonTunnel(mouse) {
        const w = this.canvas.width, h = this.canvas.height;
        const cx = w / 2 + (mouse.x !== -1000 ? (mouse.x - w / 2) * 0.04 : 0);
        const cy = h / 2 + (mouse.y !== -1000 ? (mouse.y - h / 2) * 0.04 : 0);
        const maxScale = Math.max(w, h) * 1.25;

        this._tunnelOffset = (this._tunnelOffset + 0.016) % 1;

        const N = 16;
        for (let i = 0; i < N; i++) {
            const raw = ((i / N) + this._tunnelOffset) % 1;
            const t = raw * raw * raw; // cubic → fast zoom feel
            const scale = t * maxScale;
            if (scale < 2) continue;

            const alpha = Math.min(1, raw * 5) * (1 - raw * 0.45);
            const isCyan = i % 2 === 0;
            const primary = isCyan ? '#00FFFF' : '#FF00CC';
            const accent  = isCyan ? '#FF00CC' : '#00FFFF';
            const lw = Math.max(0.5, 2 - raw * 1.6);

            this.ctx.save();
            this.ctx.translate(cx, cy);
            this.ctx.rotate(this.time * 0.04 * (isCyan ? 1 : -1) + raw * 0.25);
            this.ctx.globalAlpha = alpha;

            // Main angular frame
            const fw = scale * 1.55, fh = scale;
            this.ctx.strokeStyle = primary;
            this.ctx.lineWidth = lw;
            this.ctx.shadowColor = primary;
            this.ctx.shadowBlur = 8;
            this.ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);

            // Corner slash accents
            const slash = scale * 0.18;
            this.ctx.strokeStyle = accent;
            this.ctx.lineWidth = lw * 0.55;
            this.ctx.shadowColor = accent;
            this.ctx.beginPath();
            this.ctx.moveTo(-fw/2, -fh/2 + slash); this.ctx.lineTo(-fw/2 + slash, -fh/2);
            this.ctx.moveTo( fw/2,  fh/2 - slash); this.ctx.lineTo( fw/2 - slash,  fh/2);
            this.ctx.moveTo( fw/2, -fh/2 + slash); this.ctx.lineTo( fw/2 - slash, -fh/2);
            this.ctx.moveTo(-fw/2,  fh/2 - slash); this.ctx.lineTo(-fw/2 + slash,  fh/2);
            this.ctx.stroke();

            // Horizontal scan-line accents every 3rd ring
            if (i % 3 === 0) {
                this.ctx.strokeStyle = primary;
                this.ctx.lineWidth = lw * 0.35;
                this.ctx.globalAlpha = alpha * 0.35;
                for (let li = 1; li < 4; li++) {
                    const ly = -fh/2 + (li / 4) * fh;
                    const lx = fw * (0.2 + (i % 5) * 0.08);
                    this.ctx.beginPath();
                    this.ctx.moveTo(-lx / 2, ly); this.ctx.lineTo(lx / 2, ly);
                    this.ctx.stroke();
                }
            }
            this.ctx.restore();
        }
        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1;
    },

    // ─── PARTICLE BURST (Image ref: neon spheres exploding from center) ──────────
    initParticleBurst() {
        const palette = [
            {r:255,g:20,b:200}, {r:200,g:0,b:255}, {r:255,g:180,b:0},
            {r:255,g:80,b:0},   {r:0,g:200,b:255}, {r:255,g:0,b:80},
            {r:130,g:0,b:255},
        ];
        for (let i = 0; i < 55; i++) {
            const c = palette[Math.floor(Math.random() * palette.length)];
            this.entities.push({
                angle:   Math.random() * Math.PI * 2,
                dist:    Math.random() * 80,
                speed:   1.5 + Math.random() * 2.5,
                radius:  5 + Math.random() * 18,
                color:   c,
                trailLen:60 + Math.random() * 120,
                opacity: 0.75 + Math.random() * 0.25,
            });
        }
    },

    renderParticleBurst(mouse) {
        const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
        const maxDist = Math.max(cx, cy) * 1.45;

        for (let i = 0; i < this.entities.length; i++) {
            const p = this.entities[i];
            p.dist += p.speed * 2.5;
            if (p.dist > maxDist) { p.dist = 0; p.angle = Math.random() * Math.PI * 2; }

            const x  = cx + Math.cos(p.angle) * p.dist;
            const y  = cy + Math.sin(p.angle) * p.dist;
            const td = Math.max(0, p.dist - p.trailLen);
            const tx = cx + Math.cos(p.angle) * td;
            const ty = cy + Math.sin(p.angle) * td;
            const fadeIn = Math.min(1, p.dist / 40);
            const alpha  = p.opacity * fadeIn;

            // Speed trail
            const trail = this.ctx.createLinearGradient(tx, ty, x, y);
            trail.addColorStop(0, `rgba(${p.color.r},${p.color.g},${p.color.b},0)`);
            trail.addColorStop(1, `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha * 0.35})`);
            this.ctx.beginPath();
            this.ctx.moveTo(tx, ty); this.ctx.lineTo(x, y);
            this.ctx.strokeStyle = trail;
            this.ctx.lineWidth = 0.7;
            this.ctx.stroke();

            // Glow halo
            const glow = this.ctx.createRadialGradient(x, y, 0, x, y, p.radius * 2.2);
            glow.addColorStop(0, `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha * 0.9})`);
            glow.addColorStop(0.4, `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha * 0.4})`);
            glow.addColorStop(1, `rgba(${p.color.r},${p.color.g},${p.color.b},0)`);
            this.ctx.beginPath();
            this.ctx.arc(x, y, p.radius * 2.2, 0, Math.PI * 2);
            this.ctx.fillStyle = glow;
            this.ctx.fill();

            // Bright core
            this.ctx.beginPath();
            this.ctx.arc(x, y, p.radius * 0.35, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255,255,255,${alpha * 0.95})`;
            this.ctx.fill();
        }
    },

    // ─── LIGHT STREAMS (Image ref: orange/blue neon wire trails flowing through space) ─
    initLightStreams() {
        const palette = [
            {r:255,g:130,b:0}, {r:255,g:90,b:0},
            {r:30,g:140,b:255}, {r:0,g:200,b:255}, {r:200,g:160,b:0},
        ];
        for (let i = 0; i < 22; i++) {
            const c = palette[i % palette.length];
            this.entities.push({
                x0:Math.random(),  y0:Math.random(),
                cx0:Math.random(), cy0:Math.random(),
                cx1:Math.random(), cy1:Math.random(),
                x1:Math.random(),  y1:Math.random(),
                dx0:(Math.random()-0.5)*0.0015,  dy0:(Math.random()-0.5)*0.0015,
                dcx0:(Math.random()-0.5)*0.002,  dcy0:(Math.random()-0.5)*0.002,
                dcx1:(Math.random()-0.5)*0.002,  dcy1:(Math.random()-0.5)*0.002,
                dx1:(Math.random()-0.5)*0.0015,  dy1:(Math.random()-0.5)*0.0015,
                color:c, width:1+Math.random()*2.5, opacity:0.45+Math.random()*0.55,
            });
        }
    },

    renderLightStreams(mouse) {
        const w = this.canvas.width, h = this.canvas.height;
        const wrap = v => (v < 0 ? v + 1 : v > 1 ? v - 1 : v);

        for (let i = 0; i < this.entities.length; i++) {
            const s = this.entities[i];
            s.x0=wrap(s.x0+s.dx0); s.y0=wrap(s.y0+s.dy0);
            s.cx0=wrap(s.cx0+s.dcx0); s.cy0=wrap(s.cy0+s.dcy0);
            s.cx1=wrap(s.cx1+s.dcx1); s.cy1=wrap(s.cy1+s.dcy1);
            s.x1=wrap(s.x1+s.dx1); s.y1=wrap(s.y1+s.dy1);

            const p0x=s.x0*w, p0y=s.y0*h, p1x=s.x1*w, p1y=s.y1*h;
            const pc0x=s.cx0*w, pc0y=s.cy0*h, pc1x=s.cx1*w, pc1y=s.cy1*h;

            const grad = this.ctx.createLinearGradient(p0x, p0y, p1x, p1y);
            grad.addColorStop(0,    `rgba(${s.color.r},${s.color.g},${s.color.b},0)`);
            grad.addColorStop(0.25, `rgba(${s.color.r},${s.color.g},${s.color.b},${s.opacity})`);
            grad.addColorStop(0.75, `rgba(${s.color.r},${s.color.g},${s.color.b},${s.opacity})`);
            grad.addColorStop(1,    `rgba(${s.color.r},${s.color.g},${s.color.b},0)`);

            this.ctx.beginPath();
            this.ctx.moveTo(p0x, p0y);
            this.ctx.bezierCurveTo(pc0x, pc0y, pc1x, pc1y, p1x, p1y);
            this.ctx.strokeStyle = grad;
            this.ctx.lineWidth = s.width;
            this.ctx.shadowColor = `rgba(${s.color.r},${s.color.g},${s.color.b},0.65)`;
            this.ctx.shadowBlur = 7;
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    },

    // ─── CHROMATIC VORTEX (Image ref: spinning rainbow concentric disc) ──────────
    initChromaticVortex() {
        this._vortexAngle = 0;
        this.entities = [];
    },

    renderChromaticVortex(mouse) {
        const w = this.canvas.width, h = this.canvas.height;
        const cx = w/2 + (mouse.x !== -1000 ? (mouse.x - w/2) * 0.015 : 0);
        const cy = h/2 + (mouse.y !== -1000 ? (mouse.y - h/2) * 0.015 : 0);
        const maxR = Math.min(w, h) * 0.52;

        this._vortexAngle += 0.006;

        const rings = 22, segs = 8;
        const ringH = maxR / rings;

        this.ctx.shadowBlur = 4;
        for (let r = 0; r < rings; r++) {
            const radius = (r / rings) * maxR + ringH / 2 + 12;
            const dir = r % 2 === 0 ? 1 : -1;
            const spin = this._vortexAngle * dir * (0.5 + (r / rings) * 1.8);
            this.ctx.lineWidth = ringH * 0.76;

            for (let s = 0; s < segs; s++) {
                const sa = (s / segs) * Math.PI * 2 + spin;
                const ea = ((s + 0.82) / segs) * Math.PI * 2 + spin;
                const hue = (r * 14 + s * (360 / segs) + this._vortexAngle * 22) % 360;
                const lit = 44 + (r / rings) * 26;
                const alpha = 0.52 + Math.sin(r * 0.45 + this.time * 1.4) * 0.26;

                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius, sa, ea);
                this.ctx.strokeStyle = `hsla(${hue},95%,${lit}%,${alpha})`;
                this.ctx.shadowColor = `hsla(${hue},100%,70%,0.35)`;
                this.ctx.stroke();
            }
        }
        this.ctx.shadowBlur = 0;
    },

    // ─── LIFECYCLE ───────────────────────────────────────────────────────────────
    restart(bgId) {
        this.paused = false;
        this._lastFrameTime = 0;
        this.refreshTheme(bgId);
        if (!this.animationId) this.animate();
    },

    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 0, b: 0 };
    },

    destroy() {
        this.paused = true;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
};
