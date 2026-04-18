/**
 * Forum Extension — Frontend Page
 */
var ForumPage = {
    currentView: 'categories',
    currentThreadId: null,
    currentCategoryId: null,

    // Escape a URL for safe use in src/href attributes — rejects non-http(s) schemes
    _escSrc(url) {
        const s = String(url || '');
        if (!/^https?:\/\//i.test(s)) return '';
        return s.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
    },

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
            const categories = await API.get('/api/forum/categories');
            let html = '<div class=\"forum-page\"><div class=\"page-header\"><h1>💬 FORUMS</h1><p>Join the discussion with the community</p></div>';

            categories.forEach(cat => {
                html += `
                    <div class=\"card forum-category-card animate-fade-up\" onclick=\"Router.go('/forum/category/${cat.id}')\">
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
            const data = await API.get(`/api/forum/categories/${this.currentCategoryId}/threads`);
            let html = `
                <div class=\"forum-page\">
                    <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem\">
                        <button class=\"btn btn-secondary\" onclick=\"Router.go('/forum')\">← Back</button>
                        ${App.currentUser
                            ? '<button class=\"btn btn-primary\" onclick=\"ForumPage.showNewThreadModal()\">+ New Thread</button>'
                            : '<span style=\"font-size:0.85rem;color:var(--text-muted);padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-md)\">🔒 You must be logged in to create a thread</span>'
                        }
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
                        <a href=\"/forum/thread/${t.id}\" class=\"forum-thread-row animate-fade-up\" style=\"text-decoration:none;\">
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
            const data = await API.get(`/api/forum/threads/${this.currentThreadId}`);
            const t = data.thread;

            let html = `
                <div class=\"forum-page\">
                    <div style=\"margin-bottom:1.5rem\">
                        <button class=\"btn btn-secondary\" onclick=\"Router.go('/forum/category/${t.category_id}')\">← Back to ${App.escapeHtml(t.category_name)}</button>
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
                                const rawSrc = typeof item === 'string' ? item : item.url;
                                const type = item.type || 'image';
                                if (type === 'youtube') {
                                    // Extract only an 11-char video ID — reject everything else
                                    const vidMatch = String(rawSrc).match(/^([a-zA-Z0-9_-]{11})$/);
                                    if (vidMatch) mediaHtml += `<div class=\"gallery-item youtube-embed\"><iframe src=\"https://www.youtube.com/embed/${vidMatch[1]}\" frameborder=\"0\" allowfullscreen></iframe></div>`;
                                } else if (type === 'video') {
                                    if (/^https:\/\//i.test(rawSrc)) mediaHtml += `<div class=\"gallery-item\"><video src=\"${ForumPage._escSrc(rawSrc)}\" controls></video></div>`;
                                } else {
                                    if (/^https?:\/\//i.test(rawSrc)) mediaHtml += `<div class=\"gallery-item\" data-src=\"${ForumPage._escSrc(rawSrc)}\"><img src=\"${ForumPage._escSrc(rawSrc)}\"></div>`;
                                }
                            });
                            mediaHtml += '</div>';
                        }
                    } catch (e) { }
                }

                // POST MANAGEMENT ACTIONS
                let actionHtml = '';
                if (App.currentUser && (App.currentUser.id === p.user_id || App.currentUser.role === 'admin' || App.currentUser.role === 'superadmin' || App.currentUser.role === 'moderator')) {
                    actionHtml = `
                        <div class=\"forum-post-actions\" style=\"display: flex; gap: 8px; margin-left: auto; align-items: center; opacity: 0.7; transition: opacity 0.2s;\">
                            <button class=\"btn btn-ghost btn-sm js-forum-edit\" data-post-id=\"${App.escapeHtml(p.id)}\" style=\"padding: 2px 6px; font-size: 0.75rem;\">
                                <i class=\"fas fa-edit\"></i> Edit
                            </button>
                            <button class=\"btn btn-ghost btn-sm text-danger js-forum-delete\" data-post-id=\"${App.escapeHtml(p.id)}\" data-is-op=\"${p.is_op ? '1' : '0'}\" data-thread-id=\"${App.escapeHtml(t.id)}\" style=\"padding: 2px 6px; font-size: 0.75rem; color: var(--neon-pink);\">
                                <i class=\"fas fa-trash\"></i> Delete
                            </button>
                        </div>
                    `;
                }

                html += `
                    <div class=\"forum-post animate-fade-up\" id=\"post-${p.id}\">
                        <div class=\"forum-post-sidebar\">
                            <div class=\"avatar\">${avatar}</div>
                        </div>
                        <div class=\"forum-post-content\">
                            <div class=\"forum-post-header\" style=\"display: flex; align-items: baseline;\">
                                <div style=\"display: flex; align-items: baseline; gap: 8px;\">
                                    <span class=\"forum-post-author\">${App.escapeHtml(p.display_name || p.username)}</span>
                                    <span class=\"forum-post-role\">${App.renderRankBadge({ name: p.role, color: p.role === 'admin' ? '#ff0000' : '#5865F2' })}</span>
                                    <span class=\"badge badge-level\" style=\"margin-left: 4px; font-size: 0.7rem;\">LVL ${p.level}</span>
                                    <span class=\"forum-post-time\">${App.timeAgo(p.created_at)}${p.edited_at ? ' (Edited)' : ''}</span>
                                </div>
                                ${actionHtml}
                            </div>
                            <div class=\"forum-post-body\" id=\"post-body-${p.id}\" data-raw-content=\"${encodeURIComponent(p.content)}\">${App.renderContent(p.content)}</div>
                            ${mediaHtml}
                        </div>
                    </div>
                `;
            });

            if (t.locked) {
                html += '<div class=\"card\" style=\"text-align:center;color:var(--text-muted)\">🔒 This thread is locked</div>';
            } else if (!App.currentUser) {
                html += '<div class=\"card\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">' +
                    '🔒 <strong style=\"color:var(--text-secondary)\">You must be logged in to reply.</strong>' +
                    ' <a href=\"/login\" style="color:var(--neon-cyan);text-decoration:none">Log in</a> or ' +
                    '<a href=\"/register\" style="color:var(--neon-cyan);text-decoration:none">create an account</a>.' +
                    '</div>';
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

            // Delegated listeners for edit/delete buttons (avoids inline onclick with user data)
            container.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.js-forum-edit');
                if (editBtn) { ForumPage.editPost(editBtn.dataset.postId, editBtn); return; }
                const delBtn = e.target.closest('.js-forum-delete');
                if (delBtn) { ForumPage.deletePost(delBtn.dataset.postId, delBtn.dataset.isOp === '1', delBtn.dataset.threadId); return; }
                const galleryItem = e.target.closest('.gallery-item[data-src]');
                if (galleryItem) { window.open(galleryItem.dataset.src); }
            }, { once: true });
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
            const result = await API.post(`/api/forum/categories/${this.currentCategoryId}/threads`, { title, content, media });
            document.getElementById('new-thread-modal').remove();
            Router.go(`/forum/thread/${result.thread.id}`);
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
            await API.post(`/api/forum/threads/${this.currentThreadId}/posts`, { content, media });
            if (typeof ImagesHook !== 'undefined') ImagesHook.reset(composer);
            this.render(document.getElementById('page-container'), ['thread', this.currentThreadId]);
            App.showToast('Reply posted!', 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to post reply', 'error');
        }
    },

    editPost(postId, btn) {
        const bodyEl = document.getElementById(`post-body-${postId}`);
        if (!bodyEl || bodyEl.querySelector('textarea')) return;

        const rawContent = decodeURIComponent(bodyEl.getAttribute('data-raw-content') || '');
        
        bodyEl.innerHTML = `
            <div class=\"forum-composer\" style=\"margin-top: 0; padding: 10px; background: transparent; border: none;\">
                <textarea id=\"edit-content-${postId}\" class=\"input-field\" rows=\"4\" style=\"width: 100%;\">${App.escapeHtml(rawContent)}</textarea>
                <div style=\"display:flex; justify-content:flex-end; gap: 8px; margin-top: 8px;\">
                    <button class=\"btn btn-ghost btn-sm\" onclick=\"ForumPage.cancelEdit('${postId}')\">Cancel</button>
                    <button class=\"btn btn-primary btn-sm\" onclick=\"ForumPage.saveEdit('${postId}')\">Save</button>
                </div>
            </div>
        `;
    },

    cancelEdit(postId) {
        const bodyEl = document.getElementById(`post-body-${postId}`);
        if (bodyEl) {
            const rawContent = decodeURIComponent(bodyEl.getAttribute('data-raw-content') || '');
            bodyEl.innerHTML = App.renderContent(rawContent);
        }
    },

    async saveEdit(postId) {
        const content = document.getElementById(`edit-content-${postId}`).value.trim();
        if (!content) return App.showToast('Content cannot be empty', 'warning');

        try {
            await API.put(`/api/forum/posts/${postId}`, { content });
            App.showToast('Post updated', 'success');
            this.render(document.getElementById('page-container'), ['thread', this.currentThreadId]);
        } catch (err) {
            App.showToast(err.message || 'Failed to edit post', 'error');
        }
    },

    async deletePost(postId, isOp, threadId) {
        if (isOp) {
            if (confirm('This is the original post. Deleting it will delete the entire thread. Are you sure you want to proceed?')) {
                try {
                    await API.delete(`/api/forum/threads/${threadId}`);
                    App.showToast('Thread deleted', 'success');
                    Router.go(`/forum/category/${this.currentCategoryId}`);
                } catch (err) {
                    App.showToast(err.message || 'Failed to delete thread', 'error');
                }
            }
        } else {
            if (confirm('Are you sure you want to delete this post?')) {
                try {
                    await API.delete(`/api/forum/posts/${postId}`);
                    App.showToast('Post deleted', 'success');
                    this.render(document.getElementById('page-container'), ['thread', this.currentThreadId]);
                } catch (err) {
                    App.showToast(err.message || 'Failed to delete post', 'error');
                }
            }
        }
    }
};
