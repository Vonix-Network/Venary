/* =======================================
   Venary — Interactive WebGL Live Wallpapers Engine
   Supports: webgl-cyber, webgl-matrix, webgl-stars, webgl-geometry, webgl-fluid, webgl-aurora, webgl-particles
   ======================================= */
const WebGLEngine = {
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    animationId: null,
    theme: null,
    time: 0,
    mouse: new THREE.Vector2(),
    targetMouse: new THREE.Vector2(),
    raycaster: new THREE.Raycaster(),
    objects: [],
    materials: [],

    getCssColor(varName, fallbackHex) {
        try {
            const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (!val) return new THREE.Color(fallbackHex);
            // THREE.Color cannot parse rgba() — strip alpha to get rgb()
            const cleaned = val.replace(/rgba\s*\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)');
            return new THREE.Color(cleaned);
        } catch (e) {
            return new THREE.Color(fallbackHex);
        }
    },
    
    init() {
        this.canvas = document.getElementById('webgl-canvas');
        if (!this.canvas) return;

        // Set up WebGL renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Basic scene and camera setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        // Events
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        window.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        window.addEventListener('touchmove', this.onTouchMove.bind(this), false);

        // Don't animate until a WebGL theme is active
    },

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },

    onMouseMove(event) {
        this.targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    },

    onTouchMove(event) {
        if (event.touches.length > 0) {
            this.targetMouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
            this.targetMouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
        }
    },

    clearScene() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.customUpdate = null;
        
        if (!this.scene) return; // Not yet initialized
        
        while(this.scene.children.length > 0){ 
            this.scene.remove(this.scene.children[0]); 
        }
        
        this.objects.forEach(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
        this.objects = [];
        this.materials = [];
        this.time = 0;
        this.camera.position.set(0, 0, 5);
        this.camera.rotation.set(0, 0, 0);
        this.scene.background = null;
        this.scene.fog = null;
    },

    refreshTheme(themeId) {
        this.theme = themeId;
        this.clearScene();
        
        // Setup proper configuration based on theme
        switch(this.theme) {
            case 'webgl-cyber': this.initCyber(); break;
            case 'webgl-matrix': this.initMatrix(); break;
            case 'webgl-stars': this.initStars(); break;
            case 'webgl-geometry': this.initGeometry(); break;
            case 'webgl-fluid': this.initFluid(); break;
            case 'webgl-aurora': this.initAurora(); break;
            case 'webgl-particles': this.initParticles(); break;
            default: return; // Do nothing if not a WebGL theme
        }
        
        this.animate();
    },

    /* ============================
       THEME INITIALIZERS
       ============================ */
       
    initCyber() {
        this.scene.background = this.getCssColor('--bg-primary', 0x05060A);
        this.scene.fog = new THREE.FogExp2(this.scene.background, 0.05);

        // Synthwave Ground Grid
        const cyan = this.getCssColor('--neon-cyan', 0x29b6f6);
        const magenta = this.getCssColor('--neon-magenta', 0xec407a);
        
        const gridHelper = new THREE.GridHelper(100, 100, magenta, cyan);
        gridHelper.position.y = -2;
        this.scene.add(gridHelper);
        this.objects.push(gridHelper);

        // Cyber mountains (wireframe)
        const geometry = new THREE.PlaneGeometry(100, 40, 32, 16);
        const material = new THREE.MeshBasicMaterial({ color: magenta, wireframe: true, transparent: true, opacity: 0.3 });
        const mountains = new THREE.Mesh(geometry, material);
        mountains.rotation.x = -Math.PI / 2;
        mountains.position.y = -2.1;
        
        // Deform plane slightly 
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) > 5 || pos.getY(i) < -5) {
                pos.setZ(i, Math.random() * 3);
            }
        }
        geometry.computeVertexNormals();
        
        this.scene.add(mountains);
        this.objects.push(mountains);

        // Setup custom animation loop closure
        this.customUpdate = () => {
            gridHelper.position.z = (this.time * 5) % 1;
            this.camera.position.x += (this.mouse.x * 2 - this.camera.position.x) * 0.05;
            this.camera.position.y += (-this.mouse.y * 1 + 1 - this.camera.position.y) * 0.05;
            this.camera.lookAt(0, 0, -10);
        };
    },

    initMatrix() {
        this.scene.background = this.getCssColor('--bg-primary', 0x000500);
        this.camera.position.z = 20;

        const mainColor = this.getCssColor('--neon-cyan', 0x29b6f6);
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];
        const numDrops = 1000;

        for (let i = 0; i < numDrops; i++) {
            const x = THREE.MathUtils.randFloatSpread(50);
            const y = THREE.MathUtils.randFloatSpread(50);
            const z = THREE.MathUtils.randFloatSpread(20);
            vertices.push(x, y, z);
            
            // Randomize brightness of main color
            const intensity = Math.random() * 0.5 + 0.5;
            colors.push(mainColor.r * intensity, mainColor.g * intensity, mainColor.b * intensity);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });

        const rain = new THREE.Points(geometry, material);
        this.scene.add(rain);
        this.objects.push(rain);

        this.customUpdate = () => {
            const pos = geometry.attributes.position;
            for (let i = 0; i < numDrops; i++) {
                let y = pos.getY(i);
                // Faster drops depending on index
                y -= 0.1 + (i % 5) * 0.05;
                if (y < -25) {
                    y = 25;
                }
                pos.setY(i, y);
            }
            pos.needsUpdate = true;
            
            this.camera.rotation.y = this.mouse.x * 0.1;
            this.camera.rotation.x = -this.mouse.y * 0.1;
        };
    },

    initStars() {
        this.scene.background = this.getCssColor('--bg-primary', 0x020208);
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        for ( let i = 0; i < 4000; i ++ ) {
            const x = THREE.MathUtils.randFloatSpread( 2000 );
            const y = THREE.MathUtils.randFloatSpread( 2000 );
            const z = THREE.MathUtils.randFloatSpread( 2000 );
            vertices.push( x, y, z );
        }
        geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
        
        // Use a sprite optionally, but small points work well
        const starColor = this.getCssColor('--neon-cyan', 0xffffff);
        const material = new THREE.PointsMaterial({ color: starColor, size: 2, sizeAttenuation: true, transparent: true, opacity: 0.8 });
        const stars = new THREE.Points( geometry, material );
        this.scene.add( stars );
        this.objects.push(stars);

        this.customUpdate = () => {
            // Hyperjump effect tied to mouse
            const warpSpeed = Math.max(0.2, (Math.abs(this.mouse.x) + Math.abs(this.mouse.y)) * 5);
            stars.rotation.z += 0.001 * warpSpeed;
            
            const positions = stars.geometry.attributes.position.array;
            for(let i=2; i < positions.length; i+=3) {
                positions[i] += warpSpeed * 10;
                if (positions[i] > 1000) {
                    positions[i] -= 2000;
                }
            }
            stars.geometry.attributes.position.needsUpdate = true;
        };
    },

    initGeometry() {
        this.scene.background = this.getCssColor('--bg-primary', 0x0b1021);
        
        const c1 = this.getCssColor('--neon-cyan', 0x29b6f6);
        const c2 = this.getCssColor('--neon-magenta', 0xab47bc);
        const c3 = this.getCssColor('--neon-green', 0x66bb6a);

        const lights = [];
        lights[0] = new THREE.PointLight(c1, 1, 0);
        lights[1] = new THREE.PointLight(c2, 1, 0);
        lights[2] = new THREE.PointLight(c3, 1, 0);
        
        lights[0].position.set(0, 200, 0);
        lights[1].position.set(100, 200, 100);
        lights[2].position.set(-100, -200, -100);
        
        this.scene.add(lights[0]);
        this.scene.add(lights[1]);
        this.scene.add(lights[2]);
        
        const shapes = [
            new THREE.IcosahedronGeometry(1, 0),
            new THREE.OctahedronGeometry(1.2, 0),
            new THREE.TetrahedronGeometry(1.5, 0)
        ];
        
        const mat = new THREE.MeshPhongMaterial({
            color: 0x1A2236,
            emissive: 0x0A0E17,
            side: THREE.DoubleSide,
            flatShading: true,
            transparent: true,
            opacity: 0.9
        });
        
        const wireMat = new THREE.MeshBasicMaterial({ color: c1, wireframe: true, transparent: true, opacity: 0.3 });
        
        this.meshGroup = new THREE.Group();
        
        for (let i = 0; i < 20; i++) {
            const mesh = new THREE.Mesh(shapes[i % 3], mat);
            const wire = new THREE.Mesh(shapes[i % 3], wireMat);
            
            mesh.add(wire);
            
            mesh.position.x = (Math.random() - 0.5) * 20;
            mesh.position.y = (Math.random() - 0.5) * 10;
            mesh.position.z = (Math.random() - 0.5) * 10 - 5;
            
            mesh.rotation.x = Math.random() * Math.PI;
            mesh.rotation.y = Math.random() * Math.PI;
            
            const scale = Math.random() * 0.8 + 0.2;
            mesh.scale.set(scale, scale, scale);
            
            this.meshGroup.add(mesh);
            this.objects.push(mesh);
        }
        
        this.scene.add(this.meshGroup);

        this.customUpdate = () => {
            this.meshGroup.rotation.x += 0.001;
            this.meshGroup.rotation.y += 0.002;
            
            this.meshGroup.children.forEach((child, i) => {
                child.rotation.x += 0.002 * (i%3+1);
                child.rotation.y += 0.003 * (i%2+1);
            });
            
            this.camera.position.x += (this.mouse.x * 3 - this.camera.position.x) * 0.05;
            this.camera.position.y += (this.mouse.y * 3 - this.camera.position.y) * 0.05;
            this.camera.lookAt(0, 0, 0);
        };
    },

    initFluid() {
        this.scene.background = this.getCssColor('--bg-primary', 0x0a1526);
        
        const fluidColor = this.getCssColor('--neon-cyan', 0x42a5f5);
        const specColor = this.getCssColor('--neon-magenta', 0x29b6f6);
        
        const geometry = new THREE.PlaneGeometry(30, 20, 64, 64);
        const material = new THREE.MeshPhongMaterial({
            color: fluidColor,
            emissive: new THREE.Color(fluidColor).multiplyScalar(0.2),
            specular: specColor,
            shininess: 100,
            flatShading: true,
            side: THREE.DoubleSide
        });
        
        const plane = new THREE.Mesh(geometry, material);
        plane.rotation.x = -Math.PI / 2 + 0.2;
        plane.position.y = -3;
        this.scene.add(plane);
        this.objects.push(plane);
        
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 10, 10);
        this.scene.add(light);
        
        const initialZ = [];
        const pos = geometry.attributes.position;
        for(let i=0; i<pos.count; i++) {
            initialZ.push(pos.getZ(i));
        }

        this.customUpdate = () => {
            for(let i=0; i<pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                // Fluid displacement formula combining sine waves
                const z = Math.sin(x * 0.5 + this.time * 2) * Math.cos(y * 0.5 + this.time * 2) * 1.5;
                pos.setZ(i, z);
            }
            pos.needsUpdate = true;
            geometry.computeVertexNormals();
            
            // Mouse reacts by slightly tumbling the camera
            this.camera.position.x += (this.mouse.x * 5 - this.camera.position.x) * 0.05;
            this.camera.position.y += (-this.mouse.y * 2 + 3 - this.camera.position.y) * 0.05;
            this.camera.lookAt(0, -3, 0);
        };
    },

    initAurora() {
        this.scene.background = this.getCssColor('--bg-primary', 0x020d1c);
        
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.ribbons = [];
        for (let r = 0; r < 5; r++) {
            const geometry = new THREE.PlaneGeometry(40, 6, 64, 1);
            const colors = [];
            const pos = geometry.attributes.position;
            
            const c1 = this.getCssColor('--neon-cyan', 0x00f0ff);
            const c2 = this.getCssColor('--neon-magenta', 0x39ff14);

            for(let i=0; i<pos.count; i++) {
                const color = c1.clone().lerp(c2, (Math.sin(i * 0.05) + 1) / 2);
                colors.push(color.r, color.g, color.b);
            }
            
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            
            const ribbon = new THREE.Mesh(geometry, material);
            ribbon.position.z = -10 + r * 2;
            ribbon.position.y = (r - 2) * 1.5;
            this.scene.add(ribbon);
            this.ribbons.push(ribbon);
            this.objects.push(ribbon);
        }

        this.customUpdate = () => {
            this.ribbons.forEach((ribbon, r) => {
                const pos = ribbon.geometry.attributes.position;
                for(let i=0; i<pos.count; i++) {
                    const x = pos.getX(i);
                    const yOffset = Math.sin(x * 0.2 + this.time * 1.5 + r) * 2;
                    // Fix bottom edge, wave top edge
                    if (pos.getY(i) > 0) {
                        pos.setY(i, 3 + yOffset);
                    } else {
                        pos.setY(i, -3 + yOffset * 0.5);
                    }
                }
                pos.needsUpdate = true;
            });
            
            this.camera.position.x += (this.mouse.x * 2 - this.camera.position.x) * 0.1;
            this.camera.position.y += (-this.mouse.y * 1 - this.camera.position.y) * 0.1;
            this.camera.lookAt(0, 0, -5);
        };
    },

    initParticles() {
        this.scene.background = this.getCssColor('--bg-primary', 0x100516);
        
        const baseColor = this.getCssColor('--neon-magenta', 0xff4081);
        this.cursorColor = this.getCssColor('--neon-cyan', 0xe040fb);

        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        const colors = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
            
            velocities.push({
                x: (Math.random() - 0.5) * 0.05,
                y: (Math.random() - 0.5) * 0.05,
                z: (Math.random() - 0.5) * 0.05
            });
            
            colors.push(baseColor.r, baseColor.g, baseColor.b); 
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        this.objects.push(particles);

        this.customUpdate = () => {
            const pos = geometry.attributes.position;
            const col = geometry.attributes.color;
            
            // Map mouse to world space roughly
            const vector = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
            vector.unproject(this.camera);
            const dir = vector.sub(this.camera.position).normalize();
            const distance = dir.z !== 0 ? (-this.camera.position.z / dir.z) : 1;
            const mousePos = this.camera.position.clone().add(dir.multiplyScalar(distance));

            for (let i = 0; i < particleCount; i++) {
                let px = pos.getX(i);
                let py = pos.getY(i);
                let pz = pos.getZ(i);

                const vx = velocities[i].x;
                const vy = velocities[i].y;
                const vz = velocities[i].z;
                
                px += vx;
                py += vy;
                pz += vz;
                
                // Repel from mouse
                const dx = px - mousePos.x;
                const dy = py - mousePos.y;
                const distSq = dx*dx + dy*dy;
                
                if (distSq < 4 && distSq > 0.0001) {
                    const force = 0.05 / Math.sqrt(distSq);
                    px += dx * force;
                    py += dy * force;
                    
                    // Light up around mouse
                    col.setXYZ(i, this.cursorColor.r, this.cursorColor.g, this.cursorColor.b);
                } else {
                    // Slowly drift back
                    col.setXYZ(i, baseColor.r, baseColor.g + Math.sin(this.time+i)*0.2, baseColor.b);
                }

                // Wrap
                if (px > 10) px = -10;
                if (px < -10) px = 10;
                if (py > 10) py = -10;
                if (py < -10) py = 10;
                if (pz > 10) pz = -10;
                if (pz < -10) pz = 10;

                pos.setXYZ(i, px, py, pz);
            }
            pos.needsUpdate = true;
            col.needsUpdate = true;
            
            particles.rotation.y += 0.001;
            particles.rotation.x += 0.0005;
        };
    },

    animate() {
        if (!this.canvas || !this.scene || !this.camera) return;
        
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        
        this.time += 0.01;
        
        // Smooth mouse following
        this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.1;
        this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.1;

        if (this.customUpdate) {
            this.customUpdate();
        }

        this.renderer.render(this.scene, this.camera);
    }
};
