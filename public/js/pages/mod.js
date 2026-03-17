/* =======================================
   Venary — Moderator Dashboard Page
   ======================================= */
var ModPage = {
    async render(container) {
        if (!App.currentUser || (App.currentUser.role !== 'admin' && App.currentUser.role !== 'moderator')) {
            container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>You don\'t have permissions to view this page.</p></div>';
            return;
        }

        container.innerHTML = '<div class="admin-page">' +
            '<div class="page-header animate-fade-up"><h1>🛡️ MODERATOR DASHBOARD</h1><p>Manage users, reports, feed posts, and forum moderation</p></div>' +
            '<div class="tabs animate-fade-up">' +
            '<button class="tab-btn active" data-tab="users" id="mod-tab-users">Users</button>' +
            '<button class="tab-btn" data-tab="reports" id="mod-tab-reports">Reports</button>' +
            '<button class="tab-btn" data-tab="posts" id="mod-tab-posts">📝 Feed Posts</button>' +
            '<button class="tab-btn" data-tab="forum" id="mod-tab-forum">💬 Forum Moderation</button>' +
            '</div>' +
            '<div id="mod-content"><div class="loading-spinner"></div></div>' +
            '</div>';

        this.bindTabs();
        await this.loadUsers();
    },

    bindTabs() {
        var self = this;
        document.querySelectorAll('.admin-page .tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.admin-page .tab-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                if (btn.dataset.tab === 'users') self.loadUsers();
                else if (btn.dataset.tab === 'reports') self.loadReports();
                else if (btn.dataset.tab === 'posts') self.loadPostsMod();
                else if (btn.dataset.tab === 'forum') self.loadForumMod();
            });
        });
    },

    async loadUsers() {
        var content = document.getElementById('mod-content');
        content.innerHTML = '<div class="loading-spinner"></div>';
        try {
            var users = await API.getAdminUsers(1);
            const isFullAdmin = App.currentUser.role === 'admin';

            content.innerHTML = '<div class="card" style="overflow-x:auto"><table class="admin-table"><thead><tr><th>User</th><th>Status</th><th>Level</th><th>Actions</th></tr></thead><tbody>' +
                users.map(function (u) {
                    var init = (u.display_name || u.username || '?').charAt(0).toUpperCase();
                    var statusHtml = u.banned ? '<span class="badge badge-admin">BANNED</span>' : '<span class="badge badge-' + (u.status === 'online' ? 'online' : 'offline') + '">' + u.status + '</span>';

                    let actionBtns = '';
                    if (u.role === 'admin' && !isFullAdmin) {
                        actionBtns = '<span class="badge badge-level">Admin</span>';
                    } else {
                        if (u.banned) {
                            actionBtns += '<button class="btn btn-sm btn-secondary" onclick="ModPage.unbanUser(\'' + u.id + '\')">Unban</button> ';
                        } else {
                            actionBtns += '<button class="btn btn-sm btn-danger" onclick="ModPage.banUser(\'' + u.id + '\')">Ban</button> ';
                        }
                        actionBtns += '<button class="btn btn-sm btn-ghost" onclick="window.location.hash=\'#/profile/' + u.id + '\'">View</button>';
                    }

                    return '<tr>' +
                        '<td><div class="admin-user-row"><div class="avatar" style="width:28px;height:28px;font-size:0.65rem">' + init + '</div><div><div style="font-weight:600">' + App.escapeHtml(u.display_name || u.username) + '</div><div style="font-size:0.75rem;color:var(--text-muted)">@' + App.escapeHtml(u.username) + '</div></div></div></td>' +
                        '<td>' + statusHtml + '</td>' +
                        '<td><span class="badge badge-level">LVL ' + u.level + '</span></td>' +
                        '<td><div style="display:flex;gap:4px">' + actionBtns + '</div></td></tr>';
                }).join('') + '</tbody></table></div>';
        } catch (err) {
            content.innerHTML = '<div class="empty-state"><p>Failed to load users</p></div>';
        }
    },

    async loadReports() {
        var content = document.getElementById('mod-content');
        content.innerHTML = '<div class="loading-spinner"></div>';
        try {
            var reports = await API.getAdminReports();
            if (reports.length === 0) {
                content.innerHTML = '<div class="empty-state"><h3>No reports</h3><p>All clear! No pending reports.</p></div>';
                return;
            }
            content.innerHTML = '<div class="stagger-children">' + reports.map(function (r, i) {
                var actions = r.status === 'pending' ?
                    '<div style="display:flex;gap:var(--space-sm)"><button class="btn btn-primary btn-sm" onclick="ModPage.resolveReport(\'' + r.id + '\')">Resolve</button>' +
                    (r.reported_user_id ? '<button class="btn btn-danger btn-sm" onclick="ModPage.banUser(\'' + r.reported_user_id + '\')">Ban User</button>' : '') + '</div>' :
                    (r.admin_note ? '<p style="font-size:0.8rem;color:var(--text-muted)">Note: ' + App.escapeHtml(r.admin_note) + '</p>' : '');
                return '<div class="card" style="margin-bottom:var(--space-md);animation-delay:' + (i * 0.05) + 's" data-report-id="' + r.id + '">' +
                    '<div class="card-header"><div><span class="badge ' + (r.status === 'pending' ? 'badge-admin' : 'badge-online') + '" style="margin-right:8px">' + r.status.toUpperCase() + '</span><span style="color:var(--text-muted);font-size:0.8rem">' + App.timeAgo(r.created_at) + '</span></div></div>' +
                    '<p style="margin-bottom:var(--space-md)">' + App.escapeHtml(r.reason) + '</p>' +
                    '<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--space-md)">Reported by: <strong>' + App.escapeHtml(r.reporter_username || 'Unknown') + '</strong>' +
                    (r.reported_username ? ' · Target: <strong>' + App.escapeHtml(r.reported_username) + '</strong>' : '') + '</div>' +
                    actions + '</div>';
            }).join('') + '</div>';
        } catch (err) {
            content.innerHTML = '<div class="empty-state"><p>Failed to load reports</p></div>';
        }
    },

    async loadPostsMod() {
        var content = document.getElementById('mod-content');
        content.innerHTML = '<div class="loading-spinner"></div>';
        try {
            var posts = await API.get('/api/admin/posts');
            if (!posts || posts.length === 0) {
                content.innerHTML = '<div class="empty-state"><h3>No posts</h3><p>The feed is currently empty.</p></div>';
                return;
            }

            var html = '<div class="card"><h3 style="margin-bottom:var(--space-md);font-family:var(--font-display)">Recent Feed Posts</h3><table class="admin-table"><thead><tr><th>Author</th><th>Content Preview</th><th>Stats</th><th>Posted</th><th>Actions</th></tr></thead><tbody>';

            html += posts.map(function (p) {
                var preview = p.content.length > 50 ? p.content.substring(0, 50) + '...' : p.content;
                var mediaBadge = p.image ? '<span class="badge badge-level" style="margin-top:4px;display:inline-block">Has Image</span>' : '';
                return '<tr>' +
                    '<td><span style="font-weight:600">' + App.escapeHtml(p.display_name || p.username) + '</span><br><span style="font-size:0.8rem;color:var(--text-muted)">@' + App.escapeHtml(p.username) + '</span></td>' +
                    '<td><div style="font-size:0.85rem;color:var(--text-secondary);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + App.escapeHtml(preview) + '</div>' + mediaBadge + '</td>' +
                    '<td><span style="font-size:0.8rem;color:var(--text-muted)">' + p.like_count + ' Likes<br>' + p.comment_count + ' Comments</span></td>' +
                    '<td><span style="font-size:0.85rem;color:var(--text-muted)">' + App.timeAgo(p.created_at) + '</span></td>' +
                    '<td><div style="display:flex;gap:4px">' +
                    '<button class="btn btn-sm btn-ghost" onclick="window.location.hash=\'#/feed\'">View in Feed</button> ' +
                    '<button class="btn btn-sm btn-danger" onclick="ModPage.deleteFeedPost(\'' + p.id + '\')">Delete</button>' +
                    '</div></td></tr>';
            }).join('');

            html += '</tbody></table></div>';
            content.innerHTML = html;
        } catch (err) {
            content.innerHTML = '<div class="empty-state"><p>Failed to load feed posts</p></div>';
        }
    },

    async deleteFeedPost(postId) {
        var confirmed = await App.confirm('Delete Post', 'Are you sure you want to PERMANENTLY delete this feed post and all its comments?');
        if (!confirmed) return;
        try {
            await API.delete('/api/admin/posts/' + postId);
            this.showToast('Post deleted', 'success');
            this.loadPostsMod();
        } catch (e) { this.showToast(e.message, 'error'); }
    },

    showToast(message, type) {
        // Use App.showToast for consistency
        if (App && App.showToast) App.showToast(message, type);
        else App.alert('Alert', message);
    },

    async loadForumMod() {
        var content = document.getElementById('mod-content');
        content.innerHTML = '<div class="loading-spinner"></div>';
        try {
            var recentThreads = await API.get('/api/ext/forum/mod/threads');

            if (!recentThreads || recentThreads.length === 0) {
                content.innerHTML = '<div class="empty-state"><h3>No recent threads</h3><p>The forum is quiet right now.</p></div>';
                return;
            }

            var html = '<div class="card"><h3 style="margin-bottom:var(--space-md);font-family:var(--font-display)">Recent Threads</h3><table class="admin-table"><thead><tr><th>Thread</th><th>Author</th><th>Posted</th><th>Actions</th></tr></thead><tbody>';

            html += recentThreads.map(function (t) {
                var badges = '';
                if (t.pinned) badges += '<span class="badge badge-level" style="margin-right:4px">Pinned</span>';
                if (t.locked) badges += '<span class="badge badge-admin" style="margin-right:4px">Locked</span>';

                return '<tr>' +
                    '<td><strong style="color:var(--text-primary)">' + App.escapeHtml(t.title) + '</strong><br><div>' + badges + '</div></td>' +
                    '<td><span style="font-size:0.85rem">@' + App.escapeHtml(t.username) + '</span></td>' +
                    '<td><span style="font-size:0.85rem;color:var(--text-muted)">' + App.timeAgo(t.created_at) + '</span></td>' +
                    '<td><div style="display:flex;gap:4px">' +
                    '<button class="btn btn-sm btn-ghost" onclick="ModPage.toggleForumPin(\'' + t.id + '\')">' + (t.pinned ? 'Unpin' : 'Pin') + '</button>' +
                    '<button class="btn btn-sm btn-secondary" onclick="ModPage.toggleForumLock(\'' + t.id + '\')">' + (t.locked ? 'Unlock' : 'Lock') + '</button>' +
                    '<button class="btn btn-sm btn-danger" onclick="ModPage.deleteForumThread(\'' + t.id + '\')">Delete</button>' +
                    '</div></td></tr>';
            }).join('');

            html += '</tbody></table></div>';
            content.innerHTML = html;

        } catch (err) {
            if (err.status === 404) {
                content.innerHTML = '<div class="empty-state"><p>Forum extension may not be active or missing moderation API.</p></div>';
            } else {
                content.innerHTML = '<div class="empty-state"><p>Failed to load forum moderation data</p></div>';
            }
        }
    },

    async toggleForumPin(threadId) {
        try {
            await API.put('/api/ext/forum/threads/' + threadId + '/pin');
            App.showToast('Thread pin toggled', 'success');
            this.loadForumMod();
        } catch (e) { App.showToast(e.message, 'error'); }
    },

    async toggleForumLock(threadId) {
        try {
            await API.put('/api/ext/forum/threads/' + threadId + '/lock');
            App.showToast('Thread lock toggled', 'success');
            this.loadForumMod();
        } catch (e) { App.showToast(e.message, 'error'); }
    },

    async deleteForumThread(threadId) {
        var confirmed = await App.confirm('Delete Thread', 'Are you sure you want to PERMANENTLY delete this thread?');
        if (!confirmed) return;
        try {
            await API.delete('/api/ext/forum/threads/' + threadId);
            App.showToast('Thread deleted', 'success');
            this.loadForumMod();
        } catch (e) { App.showToast(e.message, 'error'); }
    },

    async banUser(userId) {
        var reason = await App.prompt('Ban User', 'Reason for ban:');
        if (reason === null) return;
        try { await API.banUser(userId, reason); App.showToast('User banned', 'success'); this.loadUsers(); } catch (err) { App.showToast(err.message, 'error'); }
    },
    async unbanUser(userId) {
        try { await API.unbanUser(userId); App.showToast('User unbanned', 'success'); this.loadUsers(); } catch (err) { App.showToast(err.message, 'error'); }
    },
    async resolveReport(reportId) {
        var note = await App.prompt('Resolve Report', 'Moderator note (optional):');
        if (note === null) return;
        try { await API.resolveReport(reportId, note || ''); App.showToast('Report resolved', 'success'); this.loadReports(); } catch (err) { App.showToast(err.message, 'error'); }
    }
};
