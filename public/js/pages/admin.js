/* =======================================
   Venary — Admin Dashboard Page
   Now includes Extensions management tab
   ======================================= */
var AdminPage = {
  async render(container) {
    if (!App.currentUser || (App.currentUser.role !== 'admin' && App.currentUser.role !== 'moderator')) {
      container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>You don\'t have permissions to view this page.</p></div>';
      return;
    }

    const isAdmin = App.currentUser.role === 'admin';
    const title = isAdmin ? '🛡️ ADMIN DASHBOARD' : '🛡️ MODERATOR DASHBOARD';
    const subtitle = isAdmin ? 'Manage users, content, extensions, and platform-wide moderation' : 'Manage users and platform moderation';

    const isDonationsEnabled = App.extensions.some(e => e.id === 'donations' && e.enabled);
    const isForumEnabled = App.extensions.some(e => e.id === 'forum' && e.enabled);
    const isMinecraftEnabled = App.extensions.some(e => e.id === 'minecraft' && e.enabled);

    container.innerHTML = '<div class="admin-page">' +
      '<div class="page-header animate-fade-up"><h1>' + title + '</h1><p>' + subtitle + '</p></div>' +
      '<div class="admin-stats" id="admin-stats">' +
      '<div class="admin-stat-card skeleton" style="height:100px"></div>' +
      '<div class="admin-stat-card skeleton" style="height:100px"></div>' +
      '<div class="admin-stat-card skeleton" style="height:100px"></div>' +
      '<div class="admin-stat-card skeleton" style="height:100px"></div>' +
      '</div>' +
      '<div class="tabs animate-fade-up">' +
      '<button class="tab-btn active" data-tab="users" id="admin-tab-users">Users</button>' +
      '<button class="tab-btn" data-tab="reports" id="admin-tab-reports">Reports</button>' +
      (isAdmin ? '<button class="tab-btn" data-tab="extensions" id="admin-tab-extensions">🧩 Extensions</button>' : '') +
      (isAdmin && isDonationsEnabled ? '<button class="tab-btn" data-tab="donations" id="admin-tab-donations">💰 Donations</button>' : '') +
      (isAdmin ? '<button class="tab-btn" data-tab="settings" id="admin-tab-settings">⚙️ Settings</button>' : '') +
      (isAdmin && isForumEnabled ? '<button class="tab-btn" data-tab="forum" id="admin-tab-forum">💬 Forum Categories</button>' : '') +
      (isAdmin && isMinecraftEnabled ? '<button class="tab-btn" data-tab="discord" id="admin-tab-discord">🎮 Discord Settings</button>' : '') +
      '</div>' +
      '<div id="admin-content"><div class="loading-spinner"></div></div>' +
      '</div>';

    this.bindTabs();
    await this.loadStats();
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
        else if (btn.dataset.tab === 'extensions') self.loadExtensions();
        else if (btn.dataset.tab === 'donations') {
          if (window.DonationsAdminPage) {
            window.DonationsAdminPage.render(document.getElementById('admin-content'));
          } else {
            App.showToast('Donations extension script not found. Please restart the server to apply changes.', 'error');
          }
        }
        else if (btn.dataset.tab === 'settings') self.loadSettings();
        else if (btn.dataset.tab === 'forum') self.loadForumConfig();
        else if (btn.dataset.tab === 'discord') self.loadDiscordSettings();
      });
    });
  },

  async loadStats() {
    try {
      var stats = await API.getAdminStats();
      var container = document.getElementById('admin-stats');
      if (!container) return;
      container.innerHTML =
        '<div class="admin-stat-card animate-fade-up"><div class="stat-value">' + stats.total_users + '</div><div class="stat-label">Total Users</div></div>' +
        '<div class="admin-stat-card animate-fade-up" style="animation-delay:0.05s"><div class="stat-value" style="color:var(--neon-green)">' + stats.online_users + '</div><div class="stat-label">Online Now</div></div>' +
        '<div class="admin-stat-card animate-fade-up" style="animation-delay:0.1s"><div class="stat-value" style="color:var(--neon-magenta)">' + stats.total_posts + '</div><div class="stat-label">Total Posts</div></div>' +
        '<div class="admin-stat-card animate-fade-up" style="animation-delay:0.15s"><div class="stat-value" style="color:var(--neon-orange)">' + stats.pending_reports + '</div><div class="stat-label">Pending Reports</div></div>';
    } catch (err) { console.error('Load admin stats error:', err); }
  },

  userFilters: { page: 1, search: '', role: 'all', sort: 'created_at', order: 'desc' },

  async loadUsers() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var users = await API.getAdminUsers(this.userFilters.page, this.userFilters);

      var filterBarHtml = '<div class="card" style="margin-bottom: var(--space-md); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">' +
        '<input type="text" id="admin-search" class="input-field" placeholder="Search username, email..." value="' + App.escapeHtml(this.userFilters.search) + '" style="flex: 1; min-width: 200px;">' +
        '<select id="admin-role" class="input-field" style="width: auto;">' +
          '<option value="all" ' + (this.userFilters.role === 'all' ? 'selected' : '') + '>All Roles</option>' +
          '<option value="user" ' + (this.userFilters.role === 'user' ? 'selected' : '') + '>User</option>' +
          '<option value="moderator" ' + (this.userFilters.role === 'moderator' ? 'selected' : '') + '>Moderator</option>' +
          '<option value="admin" ' + (this.userFilters.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
        '</select>' +
        '<select id="admin-sort" class="input-field" style="width: auto;" onchange="if(this.value === \'username\'){document.getElementById(\'admin-order\').value=\'asc\'}else{document.getElementById(\'admin-order\').value=\'desc\'}">' +
          '<option value="created_at" ' + (this.userFilters.sort === 'created_at' ? 'selected' : '') + '>Joined Date</option>' +
          '<option value="level" ' + (this.userFilters.sort === 'level' ? 'selected' : '') + '>Level</option>' +
          '<option value="username" ' + (this.userFilters.sort === 'username' ? 'selected' : '') + '>Username</option>' +
        '</select>' +
        '<select id="admin-order" class="input-field" style="width: auto;">' +
          '<option value="desc" ' + (this.userFilters.order === 'desc' ? 'selected' : '') + '>Descending (Z-A / Newest / Highest)</option>' +
          '<option value="asc" ' + (this.userFilters.order === 'asc' ? 'selected' : '') + '>Ascending (A-Z / Oldest / Lowest)</option>' +
        '</select>' +
        '<button class="btn btn-primary" onclick="AdminPage.applyUserFilters()">Search & Filter</button>' +
        '</div>';

      var tableHtml = '<div class="card" style="overflow-x:auto"><table class="admin-table" style="table-layout: fixed; width: 100%;"><thead><tr><th style="width:25%">User</th><th style="width:25%">Email</th><th style="width:10%">Role</th><th style="width:10%">Status</th><th style="width:5%">Level</th><th style="width:10%">Joined</th><th style="width:15%">Actions</th></tr></thead><tbody>' +
        users.map(function (u) {
          var init = (u.display_name || u.username || '?').charAt(0).toUpperCase();
          var statusHtml = u.banned ? '<span class="badge badge-admin">BANNED</span>' : '<span class="badge badge-' + (u.status === 'online' ? 'online' : 'offline') + '">' + u.status + '</span>';
          return '<tr>' +
            '<td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><div class="admin-user-row"><div class="avatar" style="width:28px;height:28px;font-size:0.65rem;flex-shrink:0">' + init + '</div><div style="min-width:0;overflow:hidden;"><div style="font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;" title="' + App.escapeHtml(u.display_name || u.username) + '">' + App.escapeHtml(u.display_name || u.username) + '</div><div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;" title="@' + App.escapeHtml(u.username) + '">@' + App.escapeHtml(u.username) + '</div></div></div></td>' +
            '<td style="color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + App.escapeHtml(u.email) + '">' + App.escapeHtml(u.email) + '</td>' +
            '<td><select class="input-field" style="padding:4px 8px;font-size:0.8rem;background:var(--bg-tertiary);width:auto" onchange="AdminPage.changeRole(\'' + u.id + '\', this.value)">' +
            '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>User</option>' +
            '<option value="moderator"' + (u.role === 'moderator' ? ' selected' : '') + '>Moderator</option>' +
            '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option></select></td>' +
            '<td>' + statusHtml + '</td>' +
            '<td><span class="badge badge-level">LVL ' + u.level + '</span></td>' +
            '<td style="color:var(--text-muted);font-size:0.8rem" title="' + new Date(u.created_at).toLocaleString() + '">' + new Date(u.created_at).toLocaleDateString() + '</td>' +
            '<td style="white-space:nowrap;"><div style="display:flex;gap:4px;flex-wrap:wrap;">' +
            (u.banned ? '<button class="btn btn-sm btn-secondary" onclick="AdminPage.unbanUser(\'' + u.id + '\')">Unban</button>' : '<button class="btn btn-sm btn-danger" onclick="AdminPage.showBanModal(\'' + u.id + '\', \'' + App.escapeHtml(u.username) + '\')">Ban</button>') +
            '<button class="btn btn-sm btn-primary" onclick="AdminPage.assignMinecraftUuid(\'' + u.id + '\')">MC UUID</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="window.location.hash=\'#/profile/' + u.id + '\'">View</button>' +
            '<button class="btn btn-sm btn-danger" onclick="AdminPage.deleteUser(\'' + u.id + '\')">Delete</button></div></td></tr>';
        }).join('') + '</tbody></table></div>';
      
      content.innerHTML = filterBarHtml + tableHtml;
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p>Failed to load users</p></div>';
    }
  },

  applyUserFilters() {
    this.userFilters.search = document.getElementById('admin-search').value;
    this.userFilters.role = document.getElementById('admin-role').value;
    this.userFilters.sort = document.getElementById('admin-sort').value;
    this.userFilters.order = document.getElementById('admin-order').value;
    this.userFilters.page = 1;
    this.loadUsers();
  },

  async loadReports() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var reports = await API.getAdminReports();
      if (reports.length === 0) {
        content.innerHTML = '<div class="empty-state"><h3>No reports</h3><p>All clear! No pending reports.</p></div>';
        return;
      }
      content.innerHTML = '<div class="stagger-children">' + reports.map(function (r, i) {
        var actions = r.status === 'pending' ?
          '<div style="display:flex;gap:var(--space-sm)"><button class="btn btn-primary btn-sm" onclick="AdminPage.resolveReport(\'' + r.id + '\')">Resolve</button>' +
          (r.reported_user_id ? '<button class="btn btn-danger btn-sm" onclick="AdminPage.banUser(\'' + r.reported_user_id + '\')">Ban User</button>' : '') + '</div>' :
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

  // ==========================================
  // EXTENSIONS TAB
  // ==========================================
  async loadExtensions() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var extensions = await API.get('/api/extensions');
      App.extensions = extensions; // Sync global state
      if (extensions.length === 0) {
        content.innerHTML = '<div class="empty-state"><h3>No extensions installed</h3><p>Place extension folders in the <code>extensions/</code> directory to get started.</p></div>';
        return;
      }
      content.innerHTML = '<div class="stagger-children">' + extensions.map(function (ext, i) {
        var statusBadge = ext.enabled ?
          '<span class="badge badge-online">Enabled</span>' :
          '<span class="badge badge-offline">Disabled</span>';
        var toggleBtn = ext.enabled ?
          '<button class="btn btn-sm btn-danger" onclick="AdminPage.toggleExtension(\'' + ext.id + '\')">Disable</button>' :
          '<button class="btn btn-sm btn-primary" onclick="AdminPage.toggleExtension(\'' + ext.id + '\')">Enable</button>';

        var manageBtn = (ext.enabled && ext.admin_route) ?
          '<button class="btn btn-sm btn-secondary" onclick="window.location.hash=\'#' + ext.admin_route + '\'">Manage</button>' : '';

        return '<div class="card" style="margin-bottom:var(--space-md);animation-delay:' + (i * 0.05) + 's">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
          '<h3 style="font-family:var(--font-display);font-size:0.95rem;letter-spacing:0.5px;margin-bottom:4px">' +
          '🧩 ' + App.escapeHtml(ext.name) + ' <span style="color:var(--text-muted);font-size:0.75rem">v' + ext.version + '</span></h3>' +
          '<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px">' + App.escapeHtml(ext.description) + '</p>' +
          '<div style="font-size:0.75rem;color:var(--text-muted)">by ' + App.escapeHtml(ext.author || 'Unknown') + ' · ID: <code>' + ext.id + '</code></div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:var(--space-sm)">' +
          statusBadge + ' ' + manageBtn + ' ' + toggleBtn +
          '</div>' +
          '</div>' +
          (ext.nav && ext.nav.length > 0 ? '<div style="margin-top:var(--space-sm);padding-top:var(--space-sm);border-top:1px solid var(--border-primary);font-size:0.78rem;color:var(--text-muted)">Nav items: ' +
            ext.nav.map(function (n) { return '<span class="badge badge-level" style="margin-left:4px">' + n.label + '</span>'; }).join('') + '</div>' : '') +
          '</div>';
      }).join('') + '</div>';
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p>Failed to load extensions</p></div>';
    }
  },

  async toggleExtension(extId) {
    try {
      var result = await API.post('/api/extensions/' + extId + '/toggle');
      App.showToast(result.message, 'success');
      this.loadExtensions();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  // ==========================================
  // USER MANAGEMENT
  // ==========================================
  async changeRole(userId, role) {
    try { await API.promoteUser(userId, role); App.showToast('User role changed to ' + role, 'success'); } catch (err) { App.showToast(err.message, 'error'); this.loadUsers(); }
  },
  showBanModal(userId, username) {
    const content = `
      <div class="form-group">
        <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Reason for Ban/Suspension</label>
        <textarea id="ban-reason" class="input-field" rows="3" placeholder="Violation of rules, etc."></textarea>
      </div>
      <div class="form-group" style="margin-top:1rem">
        <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Duration</label>
        <select id="ban-duration" class="input-field">
          <option value="permanent">Permanent Ban</option>
          <option value="60">1 Hour Suspension</option>
          <option value="1440">24 Hour Suspension</option>
          <option value="10080">7 Day Suspension</option>
          <option value="43200">30 Day Suspension</option>
        </select>
      </div>
      <div style="margin-top:1.5rem;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="AdminPage.confirmBan('${userId}')">Apply Punishment</button>
      </div>
    `;
    App.showModal('🛡️ Punish User: @' + username, content);
  },
  async confirmBan(userId) {
    const reason = document.getElementById('ban-reason').value.trim();
    const duration = document.getElementById('ban-duration').value;
    try {
      await API.post(`/api/admin/users/${userId}/ban`, { reason, duration });
      App.showToast(duration === 'permanent' ? 'User banned permanently' : 'User suspended', 'success');
      App.closeModal();
      this.loadUsers();
    } catch (err) {
      App.showToast(err.message || 'Failed to apply punishment', 'error');
    }
  },
  async banUser(userId) {
    // Legacy fallback
    var reason = await App.prompt('Ban User', 'Reason for ban:');
    if (reason === null) return;
    try { await API.banUser(userId, reason); App.showToast('User banned', 'success'); this.loadUsers(); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async unbanUser(userId) {
    try { await API.unbanUser(userId); App.showToast('User unbanned', 'success'); this.loadUsers(); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async deleteUser(userId) {
    var confirmed = await App.confirm('Delete User', 'Are you absolutely sure you want to permanently delete this user? This cannot be undone.');
    if (!confirmed) return;
    try {
      await API.deleteAdminUser(userId);
      App.showToast('User deleted successfully', 'success');
      this.loadUsers();
    } catch (err) {
      App.showToast(err.message || 'Failed to delete user', 'error');
    }
  },
  async assignMinecraftUuid(userId) {
    var uuid = await App.prompt('Assign UUID', 'Enter Minecraft UUID to assign to this user:');
    if (!uuid) return;
    try {
      await API.put('/api/ext/minecraft/admin/users/' + userId + '/minecraft', { minecraft_uuid: uuid });
      App.showToast('Minecraft UUID assigned', 'success');
      this.loadUsers();
    } catch (err) {
      App.showToast(err.message || 'Failed to assign UUID', 'error');
    }
  },
  async resolveReport(reportId) {
    var note = await App.prompt('Resolve Report', 'Admin note (optional):');
    if (note === null) return;
    try { await API.resolveReport(reportId, note || ''); App.showToast('Report resolved', 'success'); this.loadReports(); this.loadStats(); } catch (err) { App.showToast(err.message, 'error'); }
  },

  // ==========================================
  // SETTINGS MANAGEMENT — comprehensive panel
  // ==========================================
  async loadSettings() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var s = await API.get('/api/admin/settings');
      content.innerHTML = [
        '<div class="stagger-children">',

        // — GENERAL —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">🌐 General Settings</h3>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'general\',[\'siteName\',\'siteTagline\',\'siteDescription\',\'logoUrl\',\'faviconUrl\',\'footerText\'])">Save General</button>',
        '</div>',
        this._field('Site Name', 'siteName', s.general.siteName, 'text', 'The name shown across the platform'),
        this._field('Site Tagline', 'siteTagline', s.general.siteTagline, 'text', 'Short one-liner shown on the login/home page'),
        this._field('Site Description', 'siteDescription', s.general.siteDescription, 'textarea', 'Used by search engines and embeds'),
        this._field('Logo URL', 'logoUrl', s.general.logoUrl, 'text', 'Full URL to your logo image (leave empty for text logo)'),
        this._field('Favicon URL', 'faviconUrl', s.general.faviconUrl, 'text', 'Full URL to your favicon (.ico or .png)'),
        this._field('Footer Text', 'footerText', s.general.footerText, 'text', 'Custom text shown in the site footer'),
        '</div>',

        // — APPEARANCE —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0.05s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">🎨 Appearance Config</h3>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'appearance\',[\'primaryColor\',\'accentColor\'])">Save Appearance</button>',
        '</div>',
        '<div style="display:flex;gap:var(--space-md);margin-bottom:var(--space-md)">',
        '<div style="flex:1">',
        '<label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Primary Colour</label>',
        '<div style="display:flex;gap:8px;align-items:center">',
        '<input type="color" id="s-primaryColor" value="' + s.appearance.primaryColor + '" oninput="AdminPage.previewColor(\'primaryColor\',this.value)" style="width:48px;height:40px;border-radius:8px;border:none;cursor:pointer;background:none">',
        '<input type="text" id="s-primaryColor-hex" class="input-field" value="' + s.appearance.primaryColor + '" style="font-family:monospace" oninput="AdminPage.syncColorHex(\'primaryColor\',this.value)" maxlength="7">',
        '</div><small style="color:var(--text-muted)">Main accent — buttons, links, highlights</small>',
        '</div>',
        '<div style="flex:1">',
        '<label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Accent Colour</label>',
        '<div style="display:flex;gap:8px;align-items:center">',
        '<input type="color" id="s-accentColor" value="' + s.appearance.accentColor + '" oninput="AdminPage.previewColor(\'accentColor\',this.value)" style="width:48px;height:40px;border-radius:8px;border:none;cursor:pointer;background:none">',
        '<input type="text" id="s-accentColor-hex" class="input-field" value="' + s.appearance.accentColor + '" style="font-family:monospace" oninput="AdminPage.syncColorHex(\'accentColor\',this.value)" maxlength="7">',
        '</div><small style="color:var(--text-muted)">Secondary — gradients, badges, glows</small>',
        '</div>',
        '</div>',
        '<div style="padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md)">',
        '<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px">Live preview →</p>',
        '<div style="display:flex;gap:10px;flex-wrap:wrap">',
        '<button class="btn btn-primary" id="preview-primary-btn">Primary Button</button>',
        '<span class="badge badge-level" id="preview-badge">Level Badge</span>',
        '<div id="preview-glow" style="width:40px;height:40px;border-radius:50%;background:var(--neon-cyan);box-shadow:0 0 20px var(--neon-cyan)"></div>',
        '</div>',
        '</div>',
        '</div>',

        // — COMMUNITY —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0.1s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">👥 Community Tools</h3>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'community\',[\'registrationOpen\',\'requireEmailVerification\',\'maxUsernameLength\',\'maxBioLength\'])">Save Community</button>',
        '</div>',
        this._toggle('Open Registration', 'registrationOpen', s.community.registrationOpen, 'Allow new users to register. Disable to lock the platform.'),
        this._toggle('Require Email Verification', 'requireEmailVerification', s.community.requireEmailVerification, 'Users must verify their email before posting.'),
        this._field('Max Username Length', 'maxUsernameLength', s.community.maxUsernameLength, 'number', 'Maximum characters for usernames (8–64)'),
        this._field('Max Bio Length', 'maxBioLength', s.community.maxBioLength, 'number', 'Maximum characters for user bios (100–2000)'),
        '</div>',

        // — GAMIFICATION —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0.15s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">⭐ Gamification System</h3>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'gamification\',[\'xpPerPost\',\'xpPerComment\',\'xpPerLike\',\'levelThresholds\'])">Save Gamification</button>',
        '</div>',
        this._field('XP per Post', 'xpPerPost', s.gamification.xpPerPost, 'number', 'XP awarded when a user creates a new post'),
        this._field('XP per Comment', 'xpPerComment', s.gamification.xpPerComment, 'number', 'XP awarded when a user comments on a post'),
        this._field('XP per Like received', 'xpPerLike', s.gamification.xpPerLike, 'number', 'XP awarded when a user\'s post receives a like'),
        '<div class="form-group" style="margin-bottom:var(--space-md)">',
        '<label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Level Thresholds (comma-separated XP)</label>',
        '<input type="text" id="s-levelThresholds" class="input-field" value="' + s.gamification.levelThresholds.join(', ') + '" style="font-family:monospace">',
        '<small style="color:var(--text-muted)">10 values, starting with 0. Level N unlocks when XP ≥ threshold[N].</small>',
        '</div>',
        '</div>',

        // — MAINTENANCE —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0.2s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">🔧 Maintenance Config</h3>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'maintenance\',[\'maintenanceMode\',\'maintenanceMessage\'])">Save Maintenance</button>',
        '</div>',
        '<div style="padding:12px 16px;background:rgba(255,100,0,0.12);border:1px solid rgba(255,100,0,0.3);border-radius:var(--radius-md);margin-bottom:var(--space-md)">',
        '<strong style="color:#ff6400">⚠️ Warning:</strong> Enabling maintenance mode will block all non-admin users from accessing the platform.',
        '</div>',
        this._toggle('Maintenance Mode', 'maintenanceMode', s.maintenance.maintenanceMode, 'Show maintenance page to all regular users.'),
        this._field('Maintenance Message', 'maintenanceMessage', s.maintenance.maintenanceMessage, 'textarea', 'Message shown to users during maintenance'),
        '<div style="margin-top:var(--space-md);padding:12px 16px;background:var(--bg-tertiary);border-radius:var(--radius-md)">',
        '<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Database</p>',
        '<div style="display:flex;align-items:center;gap:10px">',
        '<span class="badge badge-online">' + s.database.type.toUpperCase() + '</span>',
        '<span style="font-size:0.85rem;color:var(--text-muted)">Database engine is locked after setup.</span>',
        '</div>',
        '</div>',
        '</div>',

        // — SMTP —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0.25s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<div>',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">📧 Mail & SMTP</h3>',
        '<small style="color:var(--text-muted)">Used for email notifications, welcome emails, and alerts.</small>',
        '</div>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveSmtp()">Save SMTP</button>',
        '</div>',
        this._toggle('Enable SMTP', 'smtp.enabled', s.smtp.enabled, 'Turn on to allow the platform to send emails.'),
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">',
        this._field('SMTP Host', 'smtp.host', s.smtp.host, 'text', 'e.g. smtp.gmail.com'),
        this._field('SMTP Port', 'smtp.port', s.smtp.port, 'number', '587 = TLS, 465 = SSL, 25 = plain'),
        this._field('Username / Email', 'smtp.user', s.smtp.user, 'text', 'Your SMTP account username'),
        this._field('Password', 'smtp.pass', s.smtp.pass, 'password', 'Leave unchanged to keep current password'),
        this._field('From Address', 'smtp.from', s.smtp.from, 'text', 'e.g. no-reply@yourdomain.com'),
        '</div>',
        this._toggle('Use SSL/TLS (port 465)', 'smtp.secure', s.smtp.secure, 'Enable if your server uses port 465 with full SSL.'),
        this._toggle('Verify TLS Certificate', 'smtp.rejectUnauthorized', s.smtp.rejectUnauthorized, 'Disable only for self-signed certs on internal servers.'),
        '<div style="margin-top:var(--space-md);display:flex;gap:10px;align-items:center">',
        '<input type="email" id="smtp-test-email" class="input-field" placeholder="Test recipient email" style="max-width:280px">',
        '<button class="btn btn-sm" style="background:var(--bg-tertiary);border:1px solid var(--border-light)" onclick="AdminPage.sendTestEmail()">Send Test Email</button>',
        '<span id="smtp-test-result" style="font-size:0.85rem"></span>',
        '</div>',
        '</div>',

        // — NOTIFICATIONS —
        '<div class="card" style="margin-bottom:var(--space-md);animation-delay:0.3s">',
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">',
        '<div>',
        '<h3 style="font-family:var(--font-display);font-size:1.1rem">🔔 Notifications</h3>',
        '<small style="color:var(--text-muted)">Global defaults — users can override these in their own profile settings.</small>',
        '</div>',
        '<button class="btn btn-primary btn-sm" onclick="AdminPage.saveNotifications()">Save Notifications</button>',
        '</div>',
        this._toggle('Welcome Email on Register', 'notif.welcomeEmail', s.notifications.welcomeEmail, 'Send a welcome email to new users when they sign up.'),
        this._toggle('Friend Request Notifications', 'notif.notifyFriendRequests', s.notifications.notifyFriendRequests, 'Email users when they receive a friend request.'),
        this._toggle('New Message Notifications', 'notif.notifyMessages', s.notifications.notifyMessages, 'Email users when they receive a direct message.'),
        this._toggle('Comment Notifications', 'notif.notifyComments', s.notifications.notifyComments, 'Email users when someone comments on their post.'),
        this._toggle('Weekly Digest Emails', 'notif.digestEnabled', s.notifications.digestEnabled, 'Send a weekly activity summary email to users (requires SMTP).'),
        '</div>',

        '</div>' // stagger-children
      ].join('');


    } catch (err) {
      console.error(err);
      content.innerHTML = '<div class="empty-state"><p>Failed to load settings: ' + (err.message || 'Unknown error') + '</p></div>';
    }
  },

  // Helper: single input field
  _field(label, id, value, type, hint) {
    var el = type === 'textarea'
      ? '<textarea id="s-' + id + '" class="input-field" rows="3" style="resize:vertical">' + App.escapeHtml(String(value || '')) + '</textarea>'
      : '<input type="' + type + '" id="s-' + id + '" class="input-field" value="' + App.escapeHtml(String(value || '')) + '">';
    return '<div class="form-group" style="margin-bottom:var(--space-md)">' +
      '<label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">' + label + '</label>' +
      el +
      (hint ? '<small style="color:var(--text-muted);display:block;margin-top:4px">' + hint + '</small>' : '') +
      '</div>';
  },

  _toggle(label, id, checked, hint) {
    return '<div class="form-group" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-primary);margin-bottom:var(--space-sm)">' +
      '<div><strong style="font-size:0.9rem">' + label + '</strong>' +
      (hint ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">' + hint + '</div>' : '') + '</div>' +
      '<label class="custom-toggle" style="cursor:pointer;position:relative;display:inline-block;width:48px;height:26px">' +
      '<input type="checkbox" id="s-' + id + '"' + (checked ? ' checked' : '') + ' style="opacity:0;width:0;height:0">' +
      '<span class="toggle-bg"></span>' +
      '<span class="toggle-knob"></span>' +
      '</label>' +
      '</div>';
  },

  previewColor(which, val) {
    var hexInput = document.getElementById('s-' + which + '-hex');
    if (hexInput) hexInput.value = val;
    if (which === 'primaryColor') {
      document.documentElement.style.setProperty('--neon-cyan', val);
      var btn = document.getElementById('preview-primary-btn');
      if (btn) btn.style.background = 'linear-gradient(135deg,' + val + ',#0080ff)';
    }
    if (which === 'accentColor') {
      document.documentElement.style.setProperty('--neon-magenta', val);
      var glow = document.getElementById('preview-glow');
      if (glow) { glow.style.background = val; glow.style.boxShadow = '0 0 20px ' + val; }
    }
  },

  syncColorHex(which, val) {
    var colorInput = document.getElementById('s-' + which);
    if (/^#[0-9a-fA-F]{6}$/.test(val) && colorInput) {
      colorInput.value = val;
      this.previewColor(which, val);
    }
  },

  async saveSection(section, keys) {
    var updates = {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var el = document.getElementById('s-' + key);
      if (!el) continue;
      if (el.type === 'checkbox') {
        updates[key] = el.checked;
      } else if (key === 'levelThresholds') {
        updates[key] = el.value.split(',').map(function (v) { return parseInt(v.trim()); }).filter(function (n) { return !isNaN(n); });
      } else if (el.type === 'number') {
        updates[key] = parseInt(el.value) || 0;
      } else {
        updates[key] = el.value.trim();
      }
    }
    try {
      await API.post('/api/admin/settings', updates);
      App.showToast('✓ ' + section.charAt(0).toUpperCase() + section.slice(1) + ' settings saved!', 'success');
    } catch (err) {
      App.showToast(err.message || 'Failed to save', 'error');
    }
  },

  async saveSmtp() {
    var g = function (id) { return document.getElementById('s-' + id); };
    var smtp = {
      enabled: g('smtp.enabled') ? g('smtp.enabled').checked : false,
      host: g('smtp.host') ? g('smtp.host').value.trim() : '',
      port: g('smtp.port') ? parseInt(g('smtp.port').value) || 587 : 587,
      secure: g('smtp.secure') ? g('smtp.secure').checked : false,
      user: g('smtp.user') ? g('smtp.user').value.trim() : '',
      pass: g('smtp.pass') ? g('smtp.pass').value : '',
      from: g('smtp.from') ? g('smtp.from').value.trim() : '',
      rejectUnauthorized: g('smtp.rejectUnauthorized') ? g('smtp.rejectUnauthorized').checked : true
    };
    try {
      await API.post('/api/admin/settings', { smtp: smtp });
      App.showToast('✓ SMTP settings saved!', 'success');
    } catch (err) {
      App.showToast(err.message || 'Failed to save SMTP', 'error');
    }
  },

  async saveNotifications() {
    var g = function (id) { return document.getElementById('s-' + id); };
    var notifications = {
      welcomeEmail: g('notif.welcomeEmail') ? g('notif.welcomeEmail').checked : false,
      notifyFriendRequests: g('notif.notifyFriendRequests') ? g('notif.notifyFriendRequests').checked : false,
      notifyMessages: g('notif.notifyMessages') ? g('notif.notifyMessages').checked : false,
      notifyComments: g('notif.notifyComments') ? g('notif.notifyComments').checked : false,
      digestEnabled: g('notif.digestEnabled') ? g('notif.digestEnabled').checked : false
    };
    try {
      await API.post('/api/admin/settings', { notifications: notifications });
      App.showToast('✓ Notification settings saved!', 'success');
    } catch (err) {
      App.showToast(err.message || 'Failed to save notifications', 'error');
    }
  },

  async sendTestEmail() {
    var emailEl = document.getElementById('smtp-test-email');
    var resultEl = document.getElementById('smtp-test-result');
    var to = emailEl ? emailEl.value.trim() : '';
    if (!to) return App.showToast('Enter a recipient email first', 'error');
    if (resultEl) resultEl.textContent = 'Sending…';
    try {
      var res = await API.post('/api/admin/settings/test-email', { to: to });
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--neon-green)">✓ ' + res.message + '</span>';
    } catch (err) {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--neon-magenta)">✗ ' + (err.message || 'Failed') + '</span>';
    }
  },



  // ==========================================
  // FORUM CONFIGURATION
  // ==========================================
  async loadForumConfig() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var categories = await API.get('/api/ext/forum/categories');

      var addForm = '<div class="card" style="margin-bottom:var(--space-md)">' +
        '<h3 style="margin-bottom:var(--space-md);font-family:var(--font-display)">Add Category</h3>' +
        '<div style="display:flex;gap:10px;align-items:flex-end">' +
        '<div style="flex:1"><label style="font-size:0.8rem">Icon (Emoji)</label><input type="text" id="new-cat-icon" class="input-field" value="💬" style="width:100%"></div>' +
        '<div style="flex:3"><label style="font-size:0.8rem">Name</label><input type="text" id="new-cat-name" class="input-field" placeholder="General Discussion" style="width:100%"></div>' +
        '<div style="flex:4"><label style="font-size:0.8rem">Description</label><input type="text" id="new-cat-desc" class="input-field" placeholder="Talk about anything" style="width:100%"></div>' +
        '<div><button class="btn btn-primary" onclick="AdminPage.createForumCategory()">Add</button></div>' +
        '</div></div>';

      var tableRows = categories.map(function (c) {
        return '<tr>' +
          '<td><span style="font-size:1.5rem">' + App.escapeHtml(c.icon) + '</span></td>' +
          '<td><strong>' + App.escapeHtml(c.name) + '</strong><div style="font-size:0.8rem;color:var(--text-muted)">' + App.escapeHtml(c.description) + '</div></td>' +
          '<td>' + c.thread_count + ' threads<br><span style="font-size:0.8rem;color:var(--text-muted)">' + c.post_count + ' posts</span></td>' +
          '<td><button class="btn btn-sm btn-danger" onclick="AdminPage.deleteForumCategory(\'' + c.id + '\')">Delete</button></td>' +
          '</tr>';
      }).join('');

      var list = '<div class="card"><table class="admin-table"><thead><tr><th>Icon</th><th>Category</th><th>Stats</th><th>Actions</th></tr></thead>' +
        '<tbody>' + (tableRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No categories found.</td></tr>') + '</tbody></table></div>';

      content.innerHTML = addForm + list;
    } catch (err) {
      if (err.status === 404) {
        content.innerHTML = '<div class="empty-state"><h3>Forum extension is not active</h3><p>Please enable the Forum extension to configure it.</p></div>';
      } else {
        content.innerHTML = '<div class="empty-state"><p>Failed to load forum categories</p></div>';
      }
    }
  },

  async createForumCategory() {
    var icon = document.getElementById('new-cat-icon').value;
    var name = document.getElementById('new-cat-name').value;
    var desc = document.getElementById('new-cat-desc').value;

    if (!name) return App.showToast('Please enter a category name', 'error');

    try {
      await API.post('/api/ext/forum/categories', { icon: icon, name: name, description: desc });
      App.showToast('Category created', 'success');
      this.loadForumConfig();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async deleteForumCategory(id) {
    if (!confirm('Are you sure you want to delete this category? All threads and posts inside it will be PERMANENTLY DELETED.')) return;
    try {
      await API.delete('/api/ext/forum/categories/' + id);
      App.showToast('Category deleted', 'success');
      this.loadForumConfig();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  // ==========================================
  // DISCORD SETTINGS
  // ==========================================
  async loadDiscordSettings() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var s = await API.get('/api/admin/settings');
      var exts = await API.get('/api/extensions');
      var hasMC = exts.find(e => e.id === 'minecraft' && e.enabled);

      var html = '<div class="card animate-fade-up">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">' +
        '  <h3 style="font-family:var(--font-display);font-size:1.1rem">🎮 Discord Integration</h3>' +
        '  <button class="btn btn-primary btn-sm" onclick="AdminPage.saveDiscordSettings()">Save Discord Settings</button>' +
        '</div>' +
        this._field('Webhook URL (General/Alerts)', 'discord-webhookUrl', s.discord.webhookUrl, 'text', 'Enter the full Discord Webhook URL to send notifications.') +
        this._field('Discord Bot Token', 'discord-botToken', s.discord.botToken ? '••••••••' : '', 'text', 'Required to send Direct Messages to users.') +
        this._field('Discord Server (Guild) ID', 'discord-guildId', s.discord.guildId, 'text', 'Required to fetch members by role for Direct Messaging.');

      if (hasMC) {
        html += '<div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--border-primary)">' +
          '<h4 style="margin-bottom:1rem;color:var(--neon-cyan)">Minecraft Server Alerts</h4>' +
          this._field('Manager Uptime Notification Role ID', 'discord-uptimeRolePing', s.discord.uptimeRolePing, 'text', 'Numeric Role ID to fetch managers to DM. e.g. 1234567890') +
          this._field('Offline Strike Threshold', 'discord-uptimeStrikeThreshold', s.discord.uptimeStrikeThreshold, 'number', 'Number of consecutive offline pings before triggering an alert (Default 5).') +
          this._field('Offline Strike Repeat Interval', 'discord-uptimeStrikeRepeat', s.discord.uptimeStrikeRepeat, 'number', 'Number of pings after first alert before sending another (Default 10).') +
          '</div>';
      } else {
        html += '<div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--border-primary);opacity:0.5;pointer-events:none">' +
          '<h4 style="margin-bottom:1rem;color:var(--text-muted)">Minecraft Server Alerts</h4>' +
          '<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem">Activate the <strong>Minecraft Extension</strong> to configure uptime ping monitors & alerts.</p>' +
          this._field('Manager Uptime Notification Role ID', 'discord-uptimeRolePing', '', 'text', 'Numeric Role ID to fetch managers to DM.') +
          '</div>';
      }

      html += '</div>';
      content.innerHTML = html;
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p>Failed to load discord settings</p></div>';
    }
  },

  async saveDiscordSettings() {
    try {
      var webhookUrl = document.getElementById('s-discord-webhookUrl').value;
      var botToken = document.getElementById('s-discord-botToken').value;
      var guildId = document.getElementById('s-discord-guildId').value;

      var rolePingEl = document.getElementById('s-discord-uptimeRolePing');
      var thresholdEl = document.getElementById('s-discord-uptimeStrikeThreshold');
      var repeatEl = document.getElementById('s-discord-uptimeStrikeRepeat');

      var payload = { discord: { webhookUrl: webhookUrl, guildId: guildId } };
      if (botToken && botToken !== '••••••••') {
        payload.discord.botToken = botToken;
      }

      if (rolePingEl && thresholdEl && repeatEl) {
        payload.discord.uptimeRolePing = rolePingEl.value;
        payload.discord.uptimeStrikeThreshold = thresholdEl.value;
        payload.discord.uptimeStrikeRepeat = repeatEl.value;
      }

      await API.post('/api/admin/settings', payload);
      App.showToast('Discord settings saved', 'success');
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
