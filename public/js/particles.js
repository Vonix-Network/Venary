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
    animationId: null,
    time: 0,

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

    refreshTheme() {
        this.theme = document.documentElement.getAttribute('data-theme') || 'default';
        this.entities = []; // Reset entities
        this.time = 0;

        switch (this.theme) {
            case 'vonix':
            case 'default':
            case 'ocean':
            case 'prism':
            case 'purple':
                this.initRibbons();
                break;
            case 'pink':
                this.initBubbles();
                break;
            case 'warp':
                this.initWarpFlow();
                break;
            case 'galaxy':
                this.initGalaxy();
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
    },

    // ─── INITIALIZERS ────────────────────────────────────────────────────────────

    initRibbons() {
        const count = this.theme === 'prism' ? 8 : 5;
        let colors = [];
        
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
        } else { // default
            colors = [
                { r: 176, g: 38, b: 255 }, { r: 0, g: 240, b: 255 },
                { r: 57, g: 255, b: 20 }, { r: 255, g: 45, b: 120 }, { r: 77, g: 124, b: 255 }
            ];
        }

        for (let i = 0; i < count; i++) {
            this.entities.push({
                yOffset: this.theme === 'default' ? (this.canvas.height / 2) + (Math.random() - 0.5) * 200 : this.canvas.height / 2,
                amplitude: (this.theme === 'prism' ? 80 : 150) + Math.random() * 80,
                speedMultiplier: (this.theme === 'ocean' ? 0.2 : 0.4) + Math.random() * 0.5,
                phase: Math.random() * Math.PI * 2,
                wavelength: (this.theme === 'prism' ? 0.003 : 0.0015) + Math.random() * 0.001,
                color: colors[i % colors.length],
                mouseInfluence: 0,
                targetMouseInfluence: 0,
                thickness: (this.theme === 'prism' ? 5 : 20) + Math.random() * (this.theme === 'prism' ? 10 : 40),
                opacity: this.theme === 'default' ? 0.15 + i * 0.05 : 0.2 + (Math.random() * 0.3)
            });
        }
    },

    initBubbles() {
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
        this.ctx.globalCompositeOperation = 'source-over';
        
        let bgColor = '#000000';
        if (this.theme === 'default') bgColor = '#0a0e17';
        else if (this.theme === 'ocean') bgColor = '#000810';
        else if (this.theme === 'pink') bgColor = '#120a10';
        else if (this.theme === 'purple') bgColor = '#0a0512';
        else if (this.theme === 'warp') bgColor = '#020005';
        else if (this.theme === 'galaxy') bgColor = '#050508';

        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.time += 0.003;
        const mouseObj = { ...this.mouse };
        this.mouse.vx *= 0.9;
        this.mouse.vy *= 0.9;

        this.ctx.globalCompositeOperation = 'screen';

        switch (this.theme) {
            case 'vonix':
            case 'default':
            case 'ocean':
            case 'prism':
            case 'purple':
                this.renderRibbons(mouseObj);
                break;
            case 'pink':
                this.renderBubbles(mouseObj);
                break;
            case 'warp':
                this.renderWarpFlow(mouseObj);
                break;
            case 'galaxy':
                this.renderGalaxy(mouseObj);
                break;
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
            
            if (this.theme !== 'default') {
                const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
                gradient.addColorStop(0, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, 0)`);
                gradient.addColorStop(0.5, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, ${r.opacity * 1.5})`);
                gradient.addColorStop(1, `rgba(${r.color.r}, ${r.color.g}, ${r.color.b}, 0)`);
                this.ctx.fillStyle = gradient;

                let topPoints = [];
                let bottomPoints = [];

                for (let x = -50; x <= this.canvas.width + 50; x += (this.theme === 'prism' ? 10 : 20)) {
                    const wave1 = Math.sin(x * r.wavelength + this.time * r.speedMultiplier + r.phase);
                    const wave2 = Math.sin(x * (r.wavelength * 1.8) - this.time * (r.speedMultiplier * 0.6));
                    const wave3 = Math.sin(x * (r.wavelength * 0.4) + this.time * (r.speedMultiplier * 1.3));

                    const combinedWave = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
                    const offsetBounce = Math.sin(this.time * 0.8 + i) * (this.theme === 'prism' ? 80 : 40);

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

            const grad = this.ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
            grad.addColorStop(0, `rgba(255, 112, 166, ${b.opacity})`);
            grad.addColorStop(1, `rgba(255, 151, 112, 0)`);
            
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

            this.ctx.beginPath();
            this.ctx.arc(x, y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 10;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    },

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
    }
};
