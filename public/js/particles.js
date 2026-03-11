/* =======================================
   Venary — Fluid Ribbon Engine
   Interactive canvas fluid ribbon system
   ======================================= */
const ParticleEngine = {
    canvas: null,
    ctx: null,
    ribbons: [],
    mouse: { x: -1000, y: -1000, vx: 0, vy: 0 },
    lastMouse: { x: -1000, y: -1000 },
    animationId: null,
    time: 0,
    config: {
        count: 5,
        baseSpeed: 0.003,
        baseAmp: 120,
    },

    init() {
        this.canvas = document.getElementById('particle-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createRibbons();
        this.bindEvents();
        this.animate();
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createRibbons() {
        this.ribbons = [];
        const theme = document.documentElement.getAttribute('data-theme') || 'default';
        const isVonix = theme === 'vonix';

        const colors = isVonix ? [
            { r1: 180, g1: 220, b1: 255, r2: 0, g2: 120, b2: 210 },
            { r1: 0, g1: 150, b1: 255, r2: 0, g2: 80, b2: 160 },
            { r1: 255, g1: 255, b1: 255, r2: 100, g2: 180, b2: 255 },
            { r1: 50, g1: 130, b1: 200, r2: 10, g2: 50, b2: 100 },
            { r1: 150, g1: 200, b1: 255, r2: 30, g2: 100, b2: 180 }
        ] : [
            { r1: 176, g1: 38, b1: 255, r2: 0, g2: 240, b2: 255 },
            { r1: 0, g1: 240, b1: 255, r2: 57, g2: 255, b2: 20 },
            { r1: 57, g1: 255, b1: 20, r2: 255, g2: 200, b2: 0 },
            { r1: 255, g1: 45, b1: 120, r2: 176, g2: 38, b2: 255 },
            { r1: 77, g1: 124, b1: 255, r2: 255, g2: 45, b2: 120 }
        ];

        for (let i = 0; i < this.config.count; i++) {
            if (isVonix) {
                this.ribbons.push({
                    yOffset: this.canvas.height / 2,
                    amplitude: 150 + Math.random() * 80,
                    speedMultiplier: 0.3 + Math.random() * 0.5,
                    phase: Math.random() * Math.PI * 2,
                    wavelength: 0.0015 + Math.random() * 0.001,
                    colors: colors[i % colors.length],
                    mouseInfluence: 0,
                    targetMouseInfluence: 0,
                    thickness: 20 + Math.random() * 40,
                    opacity: 0.2 + (Math.random() * 0.3)
                });
            } else {
                this.ribbons.push({
                    yOffset: (this.canvas.height / 2) + (Math.random() - 0.5) * 200,
                    amplitude: this.config.baseAmp + Math.random() * 80,
                    speedMultiplier: 0.5 + Math.random() * 1.0,
                    phase: Math.random() * Math.PI * 2,
                    wavelength: 0.001 + Math.random() * 0.002,
                    colors: colors[i % colors.length],
                    mouseInfluence: 0,
                    targetMouseInfluence: 0,
                    opacity: 0.15 + i * 0.05
                });
            }
        }
    },

    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.createRibbons();
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

    animate() {
        const theme = document.documentElement.getAttribute('data-theme') || 'default';
        const isVonix = theme === 'vonix';

        this.ctx.globalCompositeOperation = 'source-over';
        if (isVonix) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        } else {
            this.ctx.fillStyle = 'rgba(10, 14, 23, 1)';
        }
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.time += this.config.baseSpeed;

        const mouseSpeed = Math.sqrt(this.mouse.vx * this.mouse.vx + this.mouse.vy * this.mouse.vy);
        this.mouse.vx *= 0.9;
        this.mouse.vy *= 0.9;

        this.ctx.globalCompositeOperation = 'screen';

        for (let i = 0; i < this.ribbons.length; i++) {
            const r = this.ribbons[i];

            if (this.mouse.y !== -1000) {
                const distY = Math.abs(this.mouse.y - r.yOffset);
                if (distY < 300) {
                    const force = (300 - distY) / 300;
                    r.targetMouseInfluence += (this.mouse.y > r.yOffset ? -1 : 1) * force * mouseSpeed * 0.02;
                }
            }

            r.targetMouseInfluence *= 0.95;
            r.mouseInfluence += (r.targetMouseInfluence - r.mouseInfluence) * 0.1;

            this.ctx.beginPath();
            const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);

            if (isVonix) {
                gradient.addColorStop(0, `rgba(${r.colors.r1}, ${r.colors.g1}, ${r.colors.b1}, ${r.opacity})`);
                gradient.addColorStop(0.5, `rgba(${r.colors.r2}, ${r.colors.g2}, ${r.colors.b2}, ${r.opacity * 1.5})`);
                gradient.addColorStop(1, `rgba(${r.colors.r1}, ${r.colors.g1}, ${r.colors.b1}, ${r.opacity})`);
                this.ctx.fillStyle = gradient;

                let topPoints = [];
                let bottomPoints = [];

                for (let x = -50; x <= this.canvas.width + 50; x += 20) {
                    const wave1 = Math.sin(x * r.wavelength + this.time * r.speedMultiplier + r.phase);
                    const wave2 = Math.sin(x * (r.wavelength * 1.8) - this.time * (r.speedMultiplier * 0.6));
                    const wave3 = Math.sin(x * (r.wavelength * 0.4) + this.time * (r.speedMultiplier * 1.3));

                    const combinedWave = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
                    const offsetBounce = Math.sin(this.time * 0.8 + i) * 40;

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
                for (let j = 1; j < topPoints.length; j++) {
                    this.ctx.lineTo(topPoints[j].x, topPoints[j].y);
                }
                for (let j = 0; j < bottomPoints.length; j++) {
                    this.ctx.lineTo(bottomPoints[j].x, bottomPoints[j].y);
                }

                this.ctx.closePath();
                this.ctx.fill();

                this.ctx.strokeStyle = `rgba(255, 255, 255, ${r.opacity * 0.5})`;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

            } else {
                gradient.addColorStop(0, `rgba(${r.colors.r1}, ${r.colors.g1}, ${r.colors.b1}, ${r.opacity})`);
                gradient.addColorStop(1, `rgba(${r.colors.r2}, ${r.colors.g2}, ${r.colors.b2}, ${r.opacity})`);
                this.ctx.fillStyle = gradient;

                this.ctx.moveTo(0, this.canvas.height);
                this.ctx.lineTo(0, r.yOffset);

                for (let x = 0; x <= this.canvas.width; x += 15) {
                    const wave1 = Math.sin(x * r.wavelength + this.time * r.speedMultiplier + r.phase);
                    const wave2 = Math.sin(x * (r.wavelength * 1.6) - this.time * (r.speedMultiplier * 0.7));
                    const wave3 = Math.sin(x * (r.wavelength * 0.5) + this.time * (r.speedMultiplier * 1.2));

                    const combinedWave = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
                    const verticalDrift = Math.sin(this.time * 0.5 + i) * 60;

                    const y = r.yOffset + verticalDrift + combinedWave * r.amplitude + r.mouseInfluence * Math.sin(x * 0.01);
                    this.ctx.lineTo(x, y);
                }

                this.ctx.lineTo(this.canvas.width, this.canvas.height);
                this.ctx.closePath();
                this.ctx.fill();
            }
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    },

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
};
