/**
 * Forum Extension — Frontend Page
 */
var ForumPage = {
    currentView: 'categories',
    currentThreadId: null,
    currentCategoryId: null,

    async render(container, params) {
        if (params && params[0] === 'thread') {
            this.currentView = 'thread';
            this.currentThreadId = params[1];
            await this.renderThread(container);
        } else if (params && params[0] === 'category') {
            this.currentView = 'category';
            this.currentCategoryId = params[1];
            await this.renderCategory(container);
        } else {
            this.currentView = 'categories';
            await this.renderCategories(container);
        }

        // Dispatch event for extensions (BBCode, Media)
        document.dispatchEvent(new CustomEvent('forum:rendered', { detail: { container } }));
    },

    async renderCategories(container) {
        container.innerHTML = '<div class=\"loading-spinner\"></div>';
        try {
            const categories = await API.get('/api/ext/forum/categories');
            let html = '<div class=\"forum-page\"><div class=\"page-header\"><h1>💬 FORUMS</h1><p>Join the discussion with the community</p></div>';

            categories.forEach(cat => {
                html += `
                    <div class=\"card forum-category-card animate-fade-up\" onclick=\"window.location.hash='#/forum/category/${cat.id}'\">
                        <div class=\"forum-cat-icon\">${cat.icon}</div>
                        <div class=\"forum-cat-info\">
                            <h3>${App.escapeHtml(cat.name)}</h3>
                            <p>${App.escapeHtml(cat.description)}</p>
                        </div>
                        <div class=\"forum-cat-stats\">
                            <div class="forum-stat">
                                <span class="forum-stat-value">${cat.thread_count}</span>
                                <span class="forum-stat-label">Threads</span>
                            </div>
                            <div class="forum-stat">
                                <span class="forum-stat-value">${cat.post_count}</span>
                                <span class="forum-stat-label">Posts</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = '<div class=\"empty-state\"><h3>Could not load forums</h3></div>';
        }
    },

    async renderCategory(container) {
        container.innerHTML = '<div class=\"loading-spinner\"></div>';
        try {
            const data = await API.get(`/api/ext/forum/categories/${this.currentCategoryId}/threads`);
            let html = `
                <div class=\"forum-page\">
                    <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem\">
                        <button class=\"btn btn-secondary\" onclick=\"window.location.hash='#/forum'\">← Back</button>
                        <button class=\"btn btn-primary\" onclick=\"ForumPage.showNewThreadModal()\">+ New Thread</button>
                    </div>
                    <div id=\"thread-list\" class=\"stagger-children forum-thread-list\">
                        <div class=\"forum-thread-header\">
                            <div>DISCUSSION</div>
                            <div class=\"th-stats\">REPLIES</div>
                            <div class=\"th-stats\">VIEWS</div>
                            <div class=\"th-last\">LAST ACTIVITY</div>
                        </div>
            `;

            if (data.threads.length === 0) {
                html += '<div class=\"empty-state\"><p>No threads yet. Be the first to start a discussion!</p></div>';
            } else {
                data.threads.forEach(t => {
                    html += `
                        <a href=\"#/forum/thread/${t.id}\" class=\"forum-thread-row animate-fade-up\" style=\"text-decoration:none;\">
                            <div>
                                <div class=\"forum-thread-title\">
                                    ${t.pinned ? '<span class=\"forum-badge pinned\">📌 Pinned</span>' : ''}
                                    ${t.locked ? '<span class=\"forum-badge locked\">🔒 Locked</span>' : ''}
                                    <span>${App.escapeHtml(t.title)}</span>
                                </div>
                                <div class=\"forum-thread-meta\">
                                    By ${App.escapeHtml(t.display_name || t.username)} • ${App.timeAgo(t.created_at)}
                                </div>
                            </div>
                            <div class=\"forum-thread-stat\">${t.post_count}</div>
                            <div class=\"forum-thread-stat\">${t.view_count}</div>
                            <div class=\"forum-thread-last\">
                                <div>${App.escapeHtml(t.last_user || t.display_name || t.username)}</div>
                                <span class=\"forum-thread-last-time\">${App.timeAgo(t.last_post_at || t.created_at)}</span>
                            </div>
                        </a>
                    `;
                });
            }
            html += '</div></div>';
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = '<div class=\"empty-state\"><h3>Could not load category</h3></div>';
        }
    },

    async renderThread(container) {
        container.innerHTML = '<div class=\"loading-spinner\"></div>';
        try {
            const data = await API.get(`/api/ext/forum/threads/${this.currentThreadId}`);
            const t = data.thread;

            let html = `
                <div class=\"forum-page\">
                    <div style=\"margin-bottom:1.5rem\">
                        <button class=\"btn btn-secondary\" onclick=\"window.location.hash='#/forum/category/${t.category_id}'\">← Back to ${App.escapeHtml(t.category_name)}</button>
                    </div>
                    <div class=\"page-header\">
                        <h1>${t.pinned ? '📌 ' : ''}${App.escapeHtml(t.title)}</h1>
                        <p>${t.view_count} views • Started ${App.timeAgo(t.created_at)}</p>
                    </div>
                    <div id=\"post-list\" class=\"stagger-children\">
            `;

            data.posts.forEach(p => {
                const avatar = p.avatar ? `<img src=\"${App.escapeHtml(p.avatar)}\" style=\"width:100%;height:100%;object-fit:cover;border-radius:50%\">` : (p.display_name || p.username || '?').charAt(0).toUpperCase();

                // MEDIA RENDERING
                let mediaHtml = '';
                if (p.media) {
                    try {
                        const media = JSON.parse(p.media);
                        if (Array.isArray(media)) {
                            mediaHtml = '<div class=\"post-gallery four-plus-imgs\" style=\"margin-bottom:15px\">';
                            media.forEach(item => {
                                const src = typeof item === 'string' ? item : item.url;
                                const type = item.type || 'image';
                                if (type === 'youtube') mediaHtml += `<div class=\"gallery-item youtube-embed\"><iframe src=\"https://www.youtube.com/embed/${src}\" frameborder=\"0\" allowfullscreen></iframe></div>`;
                                else if (type === 'video') mediaHtml += `<div class=\"gallery-item\"><video src=\"${src}\" controls></video></div>`;
                                else mediaHtml += `<div class=\"gallery-item\" onclick=\"window.open('${src}')\"><img src=\"${src}\"></div>`;
                            });
                            mediaHtml += '</div>';
                        }
                    } catch (e) { }
                }

                html += `
                    <div class=\"card forum-post animate-fade-up\" id=\"post-${p.id}\">
                        <div class=\"forum-post-user\">
                            <div class=\"avatar\">${avatar}</div>
                            <div class=\"username\">${App.escapeHtml(p.display_name || p.username)}</div>
                            <div class=\"badge badge-level\">LVL ${p.level}</div>
                            ${App.renderRankBadge({ name: p.role, color: p.role === 'admin' ? '#ff0000' : '#00d4ff' })}
                        </div>
                        <div class=\"forum-post-content\">
                            <div class=\"post-time\">${App.timeAgo(p.created_at)}${p.edited_at ? ' (Edited)' : ''}</div>
                            <div class=\"content\">${App.renderContent(p.content)}</div>
                            ${mediaHtml}
                        </div>
                    </div>
                `;
            });

            if (t.locked) {
                html += '<div class=\"card\" style=\"text-align:center;color:var(--text-muted)\">🔒 This thread is locked</div>';
            } else {
                html += `
                    <div class=\"card forum-composer animate-fade-up\">
                        <h3>Quick Reply</h3>
                        <textarea id=\"reply-content\" class=\"input-field\" rows=\"5\" placeholder=\"Write your reply...\"></textarea>
                        <div class=\"forum-actions\" style=\"display:flex;justify-content:flex-end;margin-top:12px\">
                            <button class=\"btn btn-primary\" onclick=\"ForumPage.submitReply()\">Post Reply</button>
                        </div>
                    </div>
                `;
            }

            html += '</div></div>';
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = '<div class=\"empty-state\"><h3>Thread not found</h3></div>';
        }
    },

    showNewThreadModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'new-thread-modal';
        modal.innerHTML = `
            <div class=\"modal\" style=\"width:700px\">
                <div class=\"modal-header\">
                    <div class=\"modal-title\">Start New Thread</div>
                    <button class=\"btn btn-ghost\" onclick=\"document.getElementById('new-thread-modal').remove()\">✕</button>
                </div>
                <div class=\"modal-body forum-composer\">
                    <input type=\"text\" id=\"thread-title\" class=\"input-field\" placeholder=\"Thread Title\" style=\"margin-bottom:12px;font-size:1.1rem;font-weight:bold\">
                    <textarea id=\"thread-content\" class=\"input-field\" rows=\"10\" placeholder=\"Tell us what's on your mind...\"></textarea>
                    <div class=\"forum-actions\" style=\"display:flex;justify-content:space-between;align-items:center;margin-top:15px\">
                        <div id=\"thread-media-hook\"></div>
                        <button class=\"btn btn-primary\" onclick=\"ForumPage.submitThread()\">Create Thread</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        // Dispatch event so BBCode and Media can hook in
        document.dispatchEvent(new CustomEvent('forum:rendered', { detail: { container: modal } }));
    },

    async submitThread() {
        const title = document.getElementById('thread-title').value.trim();
        const content = document.getElementById('thread-content').value.trim();
        const composer = document.querySelector('#new-thread-modal .forum-composer');

        const media = (typeof ImagesHook !== 'undefined') ? await ImagesHook.getImages(composer) : null;

        if (!title || !content) return App.showToast('Please fill in all fields', 'warning');

        try {
            const result = await API.post(`/api/ext/forum/categories/${this.currentCategoryId}/threads`, { title, content, media });
            document.getElementById('new-thread-modal').remove();
            window.location.hash = `#/forum/thread/${result.thread.id}`;
            App.showToast('Thread created!', 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to create thread', 'error');
        }
    },

    async submitReply() {
        const content = document.getElementById('reply-content').value.trim();
        const composer = document.querySelector('.forum-composer');
        const media = (typeof ImagesHook !== 'undefined') ? await ImagesHook.getImages(composer) : null;

        if (!content) return;

        try {
            await API.post(`/api/ext/forum/threads/${this.currentThreadId}/posts`, { content, media });
            if (typeof ImagesHook !== 'undefined') ImagesHook.reset(composer);
            this.render(document.getElementById('page-container'), ['thread', this.currentThreadId]);
            App.showToast('Reply posted!', 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to post reply', 'error');
        }
    }
};
