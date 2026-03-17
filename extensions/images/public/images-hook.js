/**
 * Media & Embeds Extension — Frontend Hook
 * Now with BBCode Editor Support and Forum Integration.
 */
var ImagesHook = {
    settings: null,
    attachedImages: [],

    async init() {
        // Listen for Feed rendering
        document.addEventListener('feed:rendered', (e) => {
            this.injectAll(e.detail.container);
        });

        // Listen for Forum rendering
        document.addEventListener('forum:rendered', (e) => {
            this.injectAll(e.detail.container);
        });

        // Fallback for direct loads
        this.injectAll(document);
        this.injectStyles();

        if (!this.settings) {
            try {
                this.settings = await API.get('/api/ext/images/settings');
            } catch (err) {
                console.warn('[Media] Could not fetch settings.');
            }
        }
    },

    injectStyles() {
        if (document.getElementById('images-hook-styles')) return;
        const style = document.createElement('style');
        style.id = 'images-hook-styles';
        style.innerHTML = `
            .composer-image-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 8px;
                padding: 12px;
                border-top: 1px solid var(--border-subtle);
            }
            .composer-image-item {
                position: relative;
                aspect-ratio: 1;
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid var(--border-subtle);
                background: rgba(0,0,0,0.2);
            }
            .composer-image-item.uploading::after {
                content: '';
                position: absolute;
                inset: 0;
                background: rgba(0,0,0,0.6) url('data:image/svg+xml,<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><style>.s{transform-origin:center;animation:r 1s infinite linear}@keyframes r{100%{transform:rotate(360deg)}}</style><path d=\"M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4Z\" fill=\"%2300d4ff\" opacity=\"0.3\"/><path class=\"s\" d=\"M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z\" fill=\"%2300d4ff\"/></svg>') no-repeat center;
            }
            .composer-image-item img, .composer-image-item video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .composer-image-remove {
                position: absolute;
                top: 4px;
                right: 4px;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(0,0,0,0.6);
                color: #fff;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                z-index: 2;
            }
            .composer-link-input-area {
                padding: 12px;
                border-top: 1px solid var(--border-subtle);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .media-type-badge {
                position: absolute;
                bottom: 4px;
                left: 4px;
                font-size: 9px;
                padding: 2px 4px;
                border-radius: 4px;
                text-transform: uppercase;
                font-weight: bold;
                pointer-events: none;
            }
            
            /* BBCode Toolbar Styles */
            .bb-toolbar {
                display: flex;
                gap: 4px;
                padding: 8px 12px;
                background: rgba(255,255,255,0.03);
                border-bottom: 1px solid var(--border-subtle);
                flex-wrap: wrap;
            }
            .bb-btn {
                background: transparent;
                border: 1px solid transparent;
                color: var(--text-secondary);
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.8rem;
                font-weight: bold;
                transition: all 0.2s;
                min-width: 30px;
            }
            .bb-btn:hover {
                background: rgba(255,255,255,0.08);
                color: var(--neon-cyan);
                border-color: var(--neon-cyan);
            }
        `;
        document.head.appendChild(style);
    },

    injectAll(root) {
        if (!root) return;
        const composers = root.querySelectorAll('.post-composer, .forum-composer');
        composers.forEach(c => {
            if (c.classList.contains('forum-composer')) {
                this.injectBBToolbar(c);
            }
            this.injectComposerControls(c);
        });
    },

    injectBBToolbar(composer) {
        if (composer.querySelector('.bb-toolbar')) return;
        const textarea = composer.querySelector('textarea');
        if (!textarea) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'bb-toolbar';

        const tags = [
            { label: 'B', tag: 'b', title: 'Bold' },
            { label: 'I', tag: 'i', title: 'Italic' },
            { label: 'U', tag: 'u', title: 'Underline' },
            { label: 'S', tag: 's', title: 'Strikethrough' },
            { label: 'Link', tag: 'url', title: 'Insert Link', prompt: 'Enter URL:' },
            { label: 'Quote', tag: 'quote', title: 'Insert Quote' },
            { label: 'Code', tag: 'code', title: 'Insert Code Block' },
            { label: 'Color', tag: 'color', title: 'Insert Color', prompt: 'Enter color (e.g. red, #ff0000):' },
        ];

        tags.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'bb-btn';
            btn.textContent = t.label;
            btn.title = t.title;
            btn.type = 'button';
            btn.onclick = () => this.insertBBCode(textarea, t.tag, t.prompt);
            toolbar.appendChild(btn);
        });

        composer.insertBefore(toolbar, composer.firstChild);
    },

    insertBBCode(textarea, tag, promptMsg) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end);

        let openTag = `[${tag}]`;
        if (promptMsg) {
            const val = prompt(promptMsg);
            if (val === null) return;
            if (tag === 'url' || tag === 'color') openTag = `[${tag}=${val}]`;
        }

        const replacement = openTag + selected + `[/${tag}]`;
        textarea.value = text.substring(0, start) + replacement + text.substring(end);

        textarea.focus();
        textarea.selectionStart = start + openTag.length;
        textarea.selectionEnd = start + openTag.length + selected.length;

        // Trigger input event for char counters
        textarea.dispatchEvent(new Event('input'));
    },

    injectComposerControls(composer) {
        if (composer.querySelector('.images-hook-controls')) return;

        const actions = composer.querySelector('.composer-actions, .forum-actions');
        if (!actions) return;

        const container = document.createElement('div');
        container.className = 'images-hook-controls';
        container.style.display = 'flex';
        container.style.gap = '8px';
        container.style.marginRight = 'auto';

        // 1. Upload Button
        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'btn btn-ghost btn-sm';
        uploadBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
        uploadBtn.title = 'Upload Media';
        uploadBtn.onclick = () => {
            if (!this.settings || this.settings.allow_direct_upload !== '1') return App.showToast('Uploads disabled.', 'warning');
            this.activeComposer = composer;
            this.fileInput.click();
        };
        container.appendChild(uploadBtn);

        if (!this.fileInput) {
            this.fileInput = document.createElement('input');
            this.fileInput.type = 'file';
            this.fileInput.multiple = true;
            this.fileInput.accept = 'image/*,video/*';
            this.fileInput.style.display = 'none';
            this.fileInput.onchange = (e) => this.handleFileSelect(e);
            document.body.appendChild(this.fileInput);
        }

        // 2. YouTube Button
        const ytBtn = document.createElement('button');
        ytBtn.className = 'btn btn-ghost btn-sm';
        ytBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.42a2.78 2.78 0 0 0-1.94 2C1 8.11 1 12 1 12s0 3.89.46 5.58a2.78 2.78 0 0 0 1.94 2c1.72.42 8.6.42 8.6.42s6.88 0 8.6-.42a2.78 2.78 0 0 0 1.94-2C23 15.89 23 12 23 12s0-3.89-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>';
        ytBtn.onclick = () => { this.activeComposer = composer; this.toggleLinkInput(composer, 'youtube'); };
        container.appendChild(ytBtn);

        // 3. Link Button
        const linkBtn = document.createElement('button');
        linkBtn.className = 'btn btn-ghost btn-sm';
        linkBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
        linkBtn.onclick = () => { this.activeComposer = composer; this.toggleLinkInput(composer, 'image'); };
        container.appendChild(linkBtn);

        actions.insertBefore(container, actions.firstChild);

        const grid = document.createElement('div');
        grid.className = 'composer-image-grid hidden';
        composer.appendChild(grid);

        const linkInput = document.createElement('div');
        linkInput.className = 'composer-link-input-area hidden';
        linkInput.innerHTML = `
            <div style="display:flex; gap:8px; width:100%;">
                <input type="text" class="input-field img-link-input" placeholder="Paste URL..." style="flex:1">
                <button class="btn btn-primary btn-sm btn-add-link">Add</button>
            </div>
            <div class="image-guide-info hidden" style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Need an image link? <a href="#" onclick="App.showImageGuide(event)" style="color: var(--neon-cyan); text-decoration: none;">Click here for Guide</a></span>
            </div>
        `;
        composer.appendChild(linkInput);
    },

    toggleLinkInput(composer, type) {
        const area = composer.querySelector('.composer-link-input-area');
        const input = area.querySelector('.img-link-input');
        const guide = area.querySelector('.image-guide-info');
        input.placeholder = type === 'youtube' ? 'Paste YouTube link...' : 'Paste image URL...';
        input.dataset.type = type;
        if (guide) {
            if (type === 'image') guide.classList.remove('hidden');
            else guide.classList.add('hidden');
        }
        area.querySelector('.btn-add-link').onclick = () => this.addLinkFromInput(composer);
        area.classList.toggle('hidden');
        if (!area.classList.contains('hidden')) input.focus();
    },

    addLinkFromInput(composer) {
        const input = composer.querySelector('.img-link-input');
        const url = input.value.trim();
        const type = input.dataset.type || 'image';
        if (!url) return;

        if (type === 'youtube') {
            const ytId = this.extractYoutubeId(url);
            if (!ytId) return App.showToast('Invalid YouTube URL', 'error');
            this.attachedImages.push({ type: 'youtube', url: ytId, thumb: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`, composer });
        } else {
            this.attachedImages.push({ type: 'image', url: url, composer });
        }

        input.value = '';
        composer.querySelector('.composer-link-input-area').classList.add('hidden');
        this.updatePreview(composer);
    },

    extractYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length == 11) ? match[2] : null;
    },

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        const composer = this.activeComposer;

        for (const file of files) {
            const tempUrl = URL.createObjectURL(file);
            const isVideo = file.type.startsWith('video/');
            const imgObj = { type: isVideo ? 'video' : 'image', url: tempUrl, file: file, uploading: false, composer };
            const index = this.attachedImages.push(imgObj) - 1;
            this.updatePreview(composer);
            this.performUpload(index, file, composer);
        }
        e.target.value = '';
    },

    async performUpload(index, file, composer) {
        if (!this.attachedImages[index]) return;
        this.attachedImages[index].uploading = true;
        this.updatePreview(composer);

        try {
            const formData = new FormData();
            formData.append('media', file);
            const response = await fetch('/api/ext/images/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + API.token },
                body: formData
            });
            const result = await response.json();
            if (result.url) {
                URL.revokeObjectURL(this.attachedImages[index].url);
                this.attachedImages[index].url = result.url;
            } else {
                let errorMsg = result.error || 'Upload failed';
                if (errorMsg.includes('HTTP 412')) {
                    errorMsg = 'Upload service (Catbox) is temporarily paused. Please try again in a few minutes or use an external link.';
                }
                throw new Error(errorMsg);
            }
        } catch (err) {
            App.showToast(err.message, 'error');
            this.removeImage(index, composer);
        } finally {
            if (this.attachedImages[index]) {
                this.attachedImages[index].uploading = false;
                this.updatePreview(composer);
            }
        }
    },

    removeImage(index, composer) {
        const img = this.attachedImages[index];
        if (img && img.type === 'file') URL.revokeObjectURL(img.url);
        this.attachedImages.splice(index, 1);
        this.updatePreview(composer);
    },

    updatePreview(composer) {
        const grid = composer.querySelector('.composer-image-grid');
        if (!grid) return;

        const myImages = this.attachedImages.filter(img => img.composer === composer);
        if (myImages.length === 0) {
            grid.classList.add('hidden');
            return;
        }

        grid.classList.remove('hidden');
        grid.innerHTML = myImages.map((img, i) => {
            const realIdx = this.attachedImages.indexOf(img);
            const src = img.type === 'youtube' ? img.thumb : img.url;
            return `
                <div class="composer-image-item ${img.uploading ? 'uploading' : ''}">
                    ${img.type === 'video' ? `<video src="${src}"></video>` : `<img src="${src}">`}
                    <div class="media-type-badge" style="background:${img.type === 'youtube' ? 'red' : 'var(--neon-magenta)'}">${img.type}</div>
                    <button class="composer-image-remove" onclick="ImagesHook.removeImage(${realIdx}, this.closest('.post-composer, .forum-composer'))">✕</button>
                </div>
            `;
        }).join('');
    },

    async getImages(composer) {
        const myImages = this.attachedImages.filter(img => img.composer === composer);
        if (myImages.length === 0) return null;
        const data = [];
        for (const img of myImages) {
            if (img.uploading) { App.showToast('Waiting for uploads...', 'warning'); return null; }
            data.push({ type: img.type, url: img.url });
        }
        return JSON.stringify(data);
    },

    reset(composer) {
        this.attachedImages = this.attachedImages.filter(img => {
            if (img.composer === composer) {
                if (img.type === 'file') URL.revokeObjectURL(img.url);
                return false;
            }
            return true;
        });
        this.updatePreview(composer);
        const linkArea = composer.querySelector('.composer-link-input-area');
        if (linkArea) linkArea.classList.add('hidden');
    }
};

ImagesHook.init();
