/* =======================================
   Venary — Admin Dashboard Page
   Now includes Extensions management tab
   ======================================= */
var AdminPage = {
  icons: {
    overview: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    reports: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    extensions: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
    donations: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
    settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
    forum: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    discord: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4M8 10v4M15 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"></path></svg>'
  },

  async render(container) {
    if (!App.currentUser || (App.currentUser.role !== 'admin' && App.currentUser.role !== 'superadmin')) {
      container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>You don\'t have permissions to view this page.</p></div>';
      return;
    }

    // Hide main nav and expand container to full width
    var mainNav = document.getElementById('main-nav');
    var mobileBottomNav = document.getElementById('mobile-bottom-nav');
    if (mainNav) mainNav.classList.add('hidden');
    if (mobileBottomNav) mobileBottomNav.classList.add('hidden');
    container.classList.add('full-width', 'admin-fullscreen');

    const isAdmin = App.currentUser.role === 'admin' || App.currentUser.role === 'superadmin';
    const isDonationsEnabled = App.extensions.some(e => e.id === 'donations' && e.enabled);
    const isForumEnabled = App.extensions.some(e => e.id === 'forum' && e.enabled);
    const isMinecraftEnabled = App.extensions.some(e => e.id === 'minecraft' && e.enabled);

    var backIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    var moreIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="5" cy="12" r="2"></circle></svg>';

    container.innerHTML = '<div class="admin-page">' +
      '<aside class="admin-sidebar">' +
      '  <div class="admin-sidebar-header"><h2>SYSTEM CONTROL</h2></div>' +
      '  <nav class="admin-nav">' +
      '    <button class="admin-nav-item active" data-tab="overview">' + this.icons.overview + ' <span>Overview</span></button>' +
      '    <button class="admin-nav-item" data-tab="users">' + this.icons.users + ' <span>Users</span></button>' +
      '    <button class="admin-nav-item" data-tab="reports">' + this.icons.reports + ' <span>Reports</span></button>' +
      (isAdmin ? '<button class="admin-nav-item" data-tab="settings">' + this.icons.settings + ' <span>Settings</span></button>' : '') +
      (isAdmin ? '<button class="admin-nav-item desktop-only-tab" data-tab="extensions">' + this.icons.extensions + ' <span>Extensions</span></button>' : '') +
      (isAdmin && isDonationsEnabled ? '<button class="admin-nav-item desktop-only-tab" data-tab="donations">' + this.icons.donations + ' <span>Donations</span></button>' : '') +
      (isAdmin && isForumEnabled ? '<button class="admin-nav-item desktop-only-tab" data-tab="forum">' + this.icons.forum + ' <span>Forum</span></button>' : '') +
      (isAdmin && isMinecraftEnabled ? '<button class="admin-nav-item desktop-only-tab" data-tab="discord">' + this.icons.discord + ' <span>Discord</span></button>' : '') +
      '    <button class="admin-nav-item admin-more-btn" onclick="AdminPage.showMoreMenu()">' + moreIcon + ' <span>More</span></button>' +
      '  </nav>' +
      '  <div class="admin-sidebar-footer">' +
      '    <button class="admin-nav-item admin-back-btn" onclick="window.location.hash=\'#/feed\'">' + backIcon + ' Back to Site</button>' +
      '  </div>' +
      '</aside>' +
      '<main class="admin-main">' +
      '  <header class="admin-content-header">' +
      '    <div class="title-info">' +
      '      <h1 id="admin-view-title">' + (isAdmin ? 'Admin Dashboard' : 'Moderator Dashboard') + '</h1>' +
      '      <p id="admin-view-subtitle">System status and platform statistics</p>' +
      '    </div>' +
      '  </header>' +
      '  <div id="admin-content" class="animate-fade-up">' +
      '    <div class="loading-spinner"></div>' +
      '  </div>' +
      '</main>' +
      '</div>';

    this.bindTabs();
    this.showOverview();
  },

  showMoreMenu() {
    const isAdmin = App.currentUser.role === 'admin' || App.currentUser.role === 'superadmin';
    const isDonationsEnabled = App.extensions.some(e => e.id === 'donations' && e.enabled);
    const isForumEnabled = App.extensions.some(e => e.id === 'forum' && e.enabled);
    const isMinecraftEnabled = App.extensions.some(e => e.id === 'minecraft' && e.enabled);

    var html = '<div style="display:flex;flex-direction:column;gap:10px">';
    if (isAdmin) html += '<button class="btn btn-secondary" onclick="App.closeModal(); document.querySelector(\'[data-tab=extensions]\').click()">' + this.icons.extensions + ' Extensions</button>';
    if (isAdmin && isDonationsEnabled) html += '<button class="btn btn-secondary" onclick="App.closeModal(); document.querySelector(\'[data-tab=donations]\').click()">' + this.icons.donations + ' Donations</button>';
    if (isAdmin && isForumEnabled) html += '<button class="btn btn-secondary" onclick="App.closeModal(); document.querySelector(\'[data-tab=forum]\').click()">' + this.icons.forum + ' Forum Settings</button>';
    if (isAdmin && isMinecraftEnabled) html += '<button class="btn btn-secondary" onclick="App.closeModal(); document.querySelector(\'[data-tab=discord]\').click()">' + this.icons.discord + ' Discord Settings</button>';
    html += '<button class="btn btn-danger" onclick="App.closeModal(); window.location.hash=\'#/feed\'">Exit Admin Dashboard</button>';
    html += '</div>';

    App.showModal('More Settings', html);
  },

  bindTabs() {
    var self = this;
    document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.admin-nav-item').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        
        // Update title/subtitle based on tab
        const titleEl = document.getElementById('admin-view-title');
        const subtitleEl = document.getElementById('admin-view-subtitle');
        
        if (tab === 'overview') {
          titleEl.innerText = 'Overview';
          subtitleEl.innerText = 'System status and platform statistics';
          self.showOverview();
        } else if (tab === 'users') {
          titleEl.innerText = 'User Management';
          subtitleEl.innerText = 'Manage accounts, roles, and access';
          self.loadUsers();
        } else if (tab === 'reports') {
          titleEl.innerText = 'Reports & Moderation';
          subtitleEl.innerText = 'Handle user reports and content violations';
          self.loadReports();
        } else if (tab === 'extensions') {
          titleEl.innerText = 'Platform Extensions';
          subtitleEl.innerText = 'Manage and configure installed extensions';
          self.loadExtensions();
        } else if (tab === 'donations') {
          titleEl.innerText = 'Donations';
          subtitleEl.innerText = 'Track and manage platform contributions';
          if (window.DonationsAdminPage) {
            window.DonationsAdminPage.render(document.getElementById('admin-content'));
          } else {
            App.showToast('Donations extension script not found.', 'error');
          }
        } else if (tab === 'settings') {
          titleEl.innerText = 'Global Settings';
          subtitleEl.innerText = 'Configure platform-wide preferences and appearance';
          self.loadSettings();
        } else if (tab === 'forum') {
          titleEl.innerText = 'Forum Categories';
          subtitleEl.innerText = 'Organize and manage discussion boards';
          self.loadForumConfig();
        } else if (tab === 'discord') {
          titleEl.innerText = 'Discord Settings';
          subtitleEl.innerText = 'Manage Discord webhooks and bot integration';
          self.loadDiscordSettings();
        }
      });
    });
  },

  async showOverview() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="admin-stats" id="admin-stats-grid">' +
      '<div class="admin-stat-card skeleton" style="height:120px"></div>' +
      '<div class="admin-stat-card skeleton" style="height:120px"></div>' +
      '<div class="admin-stat-card skeleton" style="height:120px"></div>' +
      '<div class="admin-stat-card skeleton" style="height:120px"></div>' +
      '</div>';
    await this.loadStats();
  },

  async loadStats() {
    try {
      var stats = await API.getAdminStats();
      var container = document.getElementById('admin-stats-grid');
      if (!container) return;
      container.innerHTML =
        '<div class="admin-stat-card animate-fade-up">' +
        '  <div class="stat-label">Total Users</div>' +
        '  <div class="stat-value">' + stats.total_users + '</div>' +
        '  <div class="stat-trend" style="color:var(--neon-green)">↑ New registrations</div>' +
        '</div>' +
        '<div class="admin-stat-card animate-fade-up" style="animation-delay:0.05s">' +
        '  <div class="stat-label">Online Now</div>' +
        '  <div class="stat-value" style="color:var(--neon-green)">' + stats.online_users + '</div>' +
        '  <div class="stat-trend" style="color:var(--text-muted)">Active users currently connected</div>' +
        '</div>' +
        '<div class="admin-stat-card animate-fade-up" style="animation-delay:0.1s">' +
        '  <div class="stat-label">Total Posts</div>' +
        '  <div class="stat-value" style="color:var(--neon-magenta)">' + stats.total_posts + '</div>' +
        '  <div class="stat-trend" style="color:var(--text-muted)">Social interactions logged</div>' +
        '</div>' +
        '<div class="admin-stat-card animate-fade-up" style="animation-delay:0.15s">' +
        '  <div class="stat-label">Pending Reports</div>' +
        '  <div class="stat-value" style="color:var(--neon-orange)">' + stats.pending_reports + '</div>' +
        '  <div class="stat-trend" style="color:' + (stats.pending_reports > 0 ? 'var(--neon-magenta)' : 'var(--text-muted)') + '">' + (stats.pending_reports > 0 ? '⚠ Attention required' : '✓ All clear') + '</div>' +
        '</div>';
    } catch (err) { console.error('Load admin stats error:', err); }
  },

  userFilters: { page: 1, search: '', role: 'all', sort: 'created_at', order: 'desc' },

  async loadUsers() {
    var content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var users = await API.getAdminUsers(this.userFilters.page, this.userFilters);

      // Fetch pterodactyl panel access state (if extension enabled)
      var isPteroEnabled = App.extensions.some(function(e) { return e.id === 'pterodactyl-panel' && e.enabled; });
      var isSuperadmin = App.currentUser && App.currentUser.role === 'superadmin';
      var pteroGrantedSet = new Set();
      if (isPteroEnabled) {
        try {
          var pteroAccess = await API.get('/api/ext/pterodactyl-panel/access/users');
          pteroAccess.forEach(function(r) { pteroGrantedSet.add(r.user_id); });
        } catch { /* ignore if not configured */ }
      }

      var isMinecraftEnabled = App.extensions.some(function(e) { return e.id === 'minecraft' && e.enabled; });

      var filterBarHtml = '<div class="admin-filters animate-fade-up" style="flex-wrap:wrap;gap:8px;">' +
        '<div style="flex:1;min-width:200px;position:relative;">' +
        '  <input type="text" id="admin-search" class="input-field" placeholder="Search username, email..." value="' + App.escapeHtml(this.userFilters.search) + '" style="width:100%;padding-left:36px;" onkeydown="if(event.key===\'Enter\')AdminPage.applyUserFilters()">' +
        '  <div style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none">' + this.icons.users + '</div>' +
        '</div>' +
        '<select id="admin-role" class="input-field" style="width:auto;min-width:110px;">' +
          '<option value="all"' + (this.userFilters.role === 'all' ? ' selected' : '') + '>All Roles</option>' +
          '<option value="user"' + (this.userFilters.role === 'user' ? ' selected' : '') + '>User</option>' +
          '<option value="moderator"' + (this.userFilters.role === 'moderator' ? ' selected' : '') + '>Moderator</option>' +
          '<option value="admin"' + (this.userFilters.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
        '</select>' +
        '<select id="admin-sort" class="input-field" style="width:auto;min-width:130px;">' +
          '<option value="created_at"' + (this.userFilters.sort === 'created_at' ? ' selected' : '') + '>Joined Date</option>' +
          '<option value="level"' + (this.userFilters.sort === 'level' ? ' selected' : '') + '>Level</option>' +
          '<option value="username"' + (this.userFilters.sort === 'username' ? ' selected' : '') + '>Username</option>' +
        '</select>' +
        '<select id="admin-order" class="input-field" style="width:auto;min-width:110px;">' +
          '<option value="desc"' + (this.userFilters.order === 'desc' ? ' selected' : '') + '>Desc</option>' +
          '<option value="asc"' + (this.userFilters.order === 'asc' ? ' selected' : '') + '>Asc</option>' +
        '</select>' +
        '<button class="btn btn-primary" onclick="AdminPage.applyUserFilters()" style="white-space:nowrap">Filter</button>' +
        '</div>';

      var cardsHtml = '<div class="admin-user-cards animate-fade-up" style="animation-delay:0.1s">' +
        users.map(function(u) {
          var init = (u.display_name || u.username || '?').charAt(0).toUpperCase();
          var isBanned = !!u.banned;
          var isOnline = u.status === 'online';
          var statusCls = isBanned ? 'badge-admin' : (isOnline ? 'badge-online' : 'badge-offline');
          var statusTxt = isBanned ? 'Banned' : (isOnline ? 'Online' : 'Offline');

          // Role selector
          var isSuperadminTarget = u.role === 'superadmin';
          var roleSelect = isSuperadminTarget
            ? '<select class="input-field" style="padding:3px 8px;font-size:0.78rem;height:28px;width:auto;background:var(--bg-tertiary);" disabled title="Superadmin — change via CLI"><option selected>Superadmin</option></select>'
            : '<select class="input-field" style="padding:3px 8px;font-size:0.78rem;height:28px;width:auto;background:var(--bg-tertiary);" onchange="AdminPage.changeRole(\'' + u.id + '\', this.value)">' +
              '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>User</option>' +
              '<option value="moderator"' + (u.role === 'moderator' ? ' selected' : '') + '>Moderator</option>' +
              '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
              '</select>';

          // Panel access toggle
          var pteroToggle = '';
          if (isPteroEnabled) {
            var isGranted = pteroGrantedSet.has(u.id);
            var canToggle = isSuperadmin;
            pteroToggle = '<label style="display:inline-flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted);cursor:' + (canToggle ? 'pointer' : 'not-allowed') + ';opacity:' + (canToggle ? '1' : '0.45') + '" title="Panel Access">' +
              '<input type="checkbox"' + (isGranted ? ' checked' : '') + (canToggle ? '' : ' disabled') +
              ' onchange="AdminPage.togglePanelAccess(\'' + u.id + '\', this)"' +
              ' style="accent-color:var(--neon-cyan);width:13px;height:13px;cursor:inherit">Panel</label>';
          }

          return '<div class="admin-user-card">' +
            // Left: avatar + identity
            '<div class="auc-identity">' +
            '  <div class="avatar" style="width:38px;height:38px;font-size:0.9rem;flex-shrink:0;border:1px solid var(--border-subtle)">' + init + '</div>' +
            '  <div style="min-width:0">' +
            '    <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.escapeHtml(u.display_name || u.username) + '</div>' +
            '    <div style="font-size:0.72rem;color:var(--text-muted)">@' + App.escapeHtml(u.username) + '</div>' +
            '  </div>' +
            '</div>' +
            // Middle: meta
            '<div class="auc-meta">' +
            '  <div class="auc-email">' + App.escapeHtml(u.email) + '</div>' +
            '  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">' +
            '    <span class="badge ' + statusCls + '" style="font-size:0.65rem;padding:2px 7px">' + statusTxt + '</span>' +
            '    <span class="badge badge-level" style="font-size:0.65rem;padding:2px 7px">LVL ' + u.level + '</span>' +
            '    <span style="font-size:0.72rem;color:var(--text-muted)">' + new Date(u.created_at).toLocaleDateString() + '</span>' +
            '  </div>' +
            '</div>' +
            // Right: controls
            '<div class="auc-controls">' +
            '  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
            roleSelect +
            (isPteroEnabled ? pteroToggle : '') +
            '  </div>' +
            '  <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px">' +
            (isBanned
              ? '<button class="btn btn-sm btn-secondary" onclick="AdminPage.unbanUser(\'' + u.id + '\')">Unban</button>'
              : '<button class="btn btn-sm btn-danger" onclick="AdminPage.showBanModal(\'' + u.id + '\', \'' + App.escapeHtml(u.username) + '\')">Ban</button>') +
            (isMinecraftEnabled ? '<button class="btn btn-sm btn-primary" onclick="AdminPage.assignMinecraftUuid(\'' + u.id + '\')" title="Assign MC UUID">UUID</button>' : '') +
            '<button class="btn btn-sm btn-ghost" onclick="window.location.hash=\'#/profile/' + u.id + '\'">View</button>' +
            '<button class="btn btn-sm btn-danger" onclick="AdminPage.deleteUser(\'' + u.id + '\')">Delete</button>' +
            '  </div>' +
            '</div>' +
            '</div>';
        }).join('') +
        '</div>';

      content.innerHTML = filterBarHtml + cardsHtml;
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
        content.innerHTML = '<div class="empty-state"><h3>No pending reports</h3><p>Excellent! The community is looking healthy.</p></div>';
        return;
      }
      content.innerHTML = '<div class="admin-settings-section">' + reports.map(function (r, i) {
        var actions = r.status === 'pending' ?
          '<div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-subtle)">' +
          '  <button class="btn btn-primary btn-sm" onclick="AdminPage.resolveReport(\'' + r.id + '\')">Resolve</button>' +
          (r.reported_user_id ? '<button class="btn btn-danger btn-sm" onclick="AdminPage.banUser(\'' + r.reported_user_id + '\')">Ban Target</button>' : '') + 
          '</div>' :
          (r.admin_note ? '<div style="margin-top:var(--space-md);padding:var(--space-sm);background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--text-muted)">Note: ' + App.escapeHtml(r.admin_note) + '</div>' : '');
        
        return '<div class="admin-settings-card animate-fade-up" style="animation-delay:' + (i * 0.05) + 's" data-report-id="' + r.id + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-md)">' +
          '  <div><span class="badge ' + (r.status === 'pending' ? 'badge-admin' : 'badge-online') + '">' + r.status.toUpperCase() + '</span>' +
          '  <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px">' + App.timeAgo(r.created_at) + '</span></div>' +
          '  <div style="font-size:0.75rem;color:var(--text-muted)">ID: <code>' + r.id + '</code></div>' +
          '</div>' +
          '<p style="font-size:1.1rem;font-weight:500;margin-bottom:var(--space-md)">' + App.escapeHtml(r.reason) + '</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);font-size:0.85rem;color:var(--text-secondary)">' +
          '  <div style="padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-md)">Reported by: <strong style="color:var(--text-primary)">@' + App.escapeHtml(r.reporter_username || 'Unknown') + '</strong></div>' +
          (r.reported_username ? '  <div style="padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-md)">Target User: <strong style="color:var(--neon-magenta)">@' + App.escapeHtml(r.reported_username) + '</strong></div>' : '') +
          '</div>' +
          actions + 
          '</div>';
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
        content.innerHTML = '<div class="empty-state" style="padding:4rem 2rem;text-align:center;background:var(--bg-card);border:1px dashed var(--border-subtle);border-radius:16px"><div style="font-size:3rem;margin-bottom:1rem;opacity:0.5">🧩</div><h3 style="margin-bottom:0.5rem">No extensions installed</h3><p style="color:var(--text-muted)">Place extension folders in the <code>extensions/</code> directory to get started.</p></div>';
        return;
      }
      
      const activeCount = extensions.filter(e => e.enabled).length;
      
      let html = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h2 style="font-size: 1.5rem; margin: 0 0 0.5rem 0; color: var(--text-primary); font-weight: 800; display:flex; align-items:center; gap: 10px;">
              <span style="font-size: 1.8rem; opacity: 0.9;">🧩</span> Platform Extensions
            </h2>
            <p style="color: var(--text-secondary); margin: 0; font-size: 0.95rem;">Manage, enable, or disable additional platform functionality.</p>
          </div>
          <div>
            <div style="background: linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9)); border: 1px solid rgba(255,255,255,0.05); padding: 10px 16px; border-radius: 12px; display:flex; align-items:center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <div style="text-align:right">
                <div style="font-size: 0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:700">Active Extensions</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--neon-cyan)">${activeCount} <span style="color:var(--text-muted); font-size: 0.9rem">/ ${extensions.length}</span></div>
              </div>
            </div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.5rem;">
      `;

      html += extensions.map(function (ext, i) {
        const isEnabled = ext.enabled;
        const statusColor = isEnabled ? 'var(--neon-green)' : 'var(--text-muted)';
        const statusBg = isEnabled ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)';
        const borderColor = isEnabled ? 'rgba(74,222,128,0.3)' : 'var(--border-subtle)';

        const toggleBtn = isEnabled 
            ? '<button class="mc-btn" style="background: rgba(239,68,68,0.05); color: var(--neon-magenta); border: 1px solid rgba(239,68,68,0.2); padding: 8px 16px; font-weight: 600; font-size: 0.85rem; flex: 1" onclick="AdminPage.toggleExtension(\'' + ext.id + '\')">Disable Extension</button>'
            : '<button class="mc-btn" style="background: rgba(102,187,106,0.1); color: var(--neon-green); border: 1px solid rgba(102,187,106,0.3); padding: 8px 16px; font-weight: 600; font-size: 0.85rem; flex: 1" onclick="AdminPage.toggleExtension(\'' + ext.id + '\')">Enable Extension</button>';

        const manageBtn = (isEnabled && ext.admin_route)
            ? '<button class="mc-btn" style="background: rgba(41,182,246,0.1); color: var(--neon-cyan); border: 1px solid rgba(41,182,246,0.3); padding: 8px 16px; font-weight: 600; font-size: 0.85rem; flex: 1; text-align: center; justify-content: center; display:flex; align-items:center; gap:6px;" onclick="window.location.hash=\'#' + ext.admin_route + '\'"><span>⚙️</span> Manage</button>'
            : '';

        let navBadges = '';
        if (ext.nav && ext.nav.length > 0) {
            navBadges = '<div style="margin-top: 1.2rem; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">' +
                '<span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Nav Items:</span>' +
                ext.nav.map(function(n) { return '<span style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">📌 ' + App.escapeHtml(n.label) + '</span>'; }).join('') +
            '</div>';
        }

        return '<div class="animate-fade-up" style="animation-delay: ' + (i * 0.05) + 's; background: var(--bg-card); backdrop-filter: blur(10px); border: 1px solid ' + borderColor + '; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; position: relative;" onmouseover="this.style.transform=\'translateY(-4px)\';this.style.boxShadow=\'0 12px 30px rgba(0,0,0,0.2)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'none\'">' +
            
            '<div style="height: 4px; background: ' + (isEnabled ? 'linear-gradient(90deg, #14F195, #9945FF)' : 'var(--border-subtle)') + '; width: 100%;"></div>' +
            
            '<div style="padding: 1.5rem; display: flex; flex-direction: column; flex-grow: 1;">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">' +
                    '<div style="display: flex; align-items: center; gap: 14px;">' +
                        '<div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: inset 0 2px 10px rgba(255,255,255,0.02);">' +
                            '🧩' +
                        '</div>' +
                        '<div>' +
                            '<h3 style="margin: 0 0 4px 0; font-size: 1.2rem; color: var(--text-primary); font-weight: 800; display: flex; align-items: center; gap: 8px;">' +
                                App.escapeHtml(ext.name) +
                                '<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); padding: 2px 6px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; font-family: monospace;">v' + ext.version + '</span>' +
                            '</h3>' +
                            '<div style="font-size: 0.8rem; color: var(--text-muted);">' +
                                'by <strong style="color: var(--text-secondary);">' + App.escapeHtml(ext.author || 'Unknown') + '</strong>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="background: ' + statusBg + '; color: ' + statusColor + '; border: 1px solid ' + statusColor + '30; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">' +
                        '<span style="font-size: 0.5rem;">' + (isEnabled ? '🟢' : '⚫') + '</span> ' + (isEnabled ? 'Active' : 'Inactive') +
                    '</div>' +
                '</div>' +

                '<p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin: 0 0 1.5rem 0; flex-grow: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">' +
                    App.escapeHtml(ext.description) +
                '</p>' +

                '<div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 8px; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.03);">' +
                    '<span>ID: <span style="color: var(--text-secondary); font-weight: 600;">' + ext.id + '</span></span>' +
                '</div>' +

                '<div style="display: flex; gap: 10px; margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1.2rem;">' +
                    toggleBtn +
                    manageBtn +
                '</div>' +

                navBadges +
            '</div>' +
        '</div>';
      }).join('');
      
      html += '</div>';
      content.innerHTML = html;
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

  /** Toggle Pterodactyl panel access for a user (superadmin only). */
  async togglePanelAccess(userId, checkbox) {
    var grant = checkbox.checked;
    try {
      if (grant) {
        await API.post('/api/ext/pterodactyl-panel/access/' + userId);
      } else {
        await API.delete('/api/ext/pterodactyl-panel/access/' + userId);
      }
      App.showToast('Panel access ' + (grant ? 'granted' : 'revoked') + '.', 'success');
    } catch (err) {
      // Revert toggle on failure
      checkbox.checked = !grant;
      App.showToast(err.message || 'Failed to update panel access.', 'error');
    }
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
        '<div class="admin-settings-section">',

        // — GENERAL —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0s">',
        '  <div class="admin-settings-header">',
        '    <h3>🌐 General Settings</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'general\',[\'siteName\',\'siteTagline\',\'siteDescription\',\'logoUrl\',\'faviconUrl\',\'footerText\'])">Save Changes</button>',
        '  </div>',
        this._field('Site Name', 'siteName', s.general.siteName, 'text', 'The name shown across the platform'),
        this._field('Site Tagline', 'siteTagline', s.general.siteTagline, 'text', 'Short one-liner shown on the login/home page'),
        this._field('Site Description', 'siteDescription', s.general.siteDescription, 'textarea', 'Used by search engines and embeds'),
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md)">',
        this._field('Logo URL', 'logoUrl', s.general.logoUrl, 'text', 'Full URL to your logo image'),
        this._field('Favicon URL', 'faviconUrl', s.general.faviconUrl, 'text', 'Full URL to your favicon'),
        '</div>',
        this._field('Footer Text', 'footerText', s.general.footerText, 'text', 'Custom text shown in the site footer'),
        '</div>',

        // — APPEARANCE —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0.05s">',
        '  <div class="admin-settings-header">',
        '    <h3>🎨 Appearance Config</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'appearance\',[\'primaryColor\',\'accentColor\'])">Save Changes</button>',
        '  </div>',
        '  <div style="display:flex;gap:var(--space-md);margin-bottom:var(--space-md)">',
        '    <div style="flex:1">',
        '      <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Primary Colour</label>',
        '      <div style="display:flex;gap:8px;align-items:center">',
        '        <input type="color" id="s-primaryColor" value="' + s.appearance.primaryColor + '" oninput="AdminPage.previewColor(\'primaryColor\',this.value)" style="width:48px;height:40px;border-radius:8px;border:none;cursor:pointer;background:none">',
        '        <input type="text" id="s-primaryColor-hex" class="input-field" value="' + s.appearance.primaryColor + '" style="font-family:monospace" oninput="AdminPage.syncColorHex(\'primaryColor\',this.value)" maxlength="7">',
        '      </div><small style="color:var(--text-muted)">Main accent — buttons, links, highlights</small>',
        '    </div>',
        '    <div style="flex:1">',
        '      <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">Accent Colour</label>',
        '      <div style="display:flex;gap:8px;align-items:center">',
        '        <input type="color" id="s-accentColor" value="' + s.appearance.accentColor + '" oninput="AdminPage.previewColor(\'accentColor\',this.value)" style="width:48px;height:40px;border-radius:8px;border:none;cursor:pointer;background:none">',
        '        <input type="text" id="s-accentColor-hex" class="input-field" value="' + s.appearance.accentColor + '" style="font-family:monospace" oninput="AdminPage.syncColorHex(\'accentColor\',this.value)" maxlength="7">',
        '      </div><small style="color:var(--text-muted)">Secondary — gradients, badges, glows</small>',
        '    </div>',
        '  </div>',
        '  <div style="padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md); border: 1px solid var(--border-subtle)">',
        '    <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Live Preview</p>',
        '    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">',
        '      <button class="btn btn-primary" id="preview-primary-btn">Primary Action</button>',
        '      <span class="badge badge-level" id="preview-badge">Level 99</span>',
        '      <div id="preview-glow" style="width:32px;height:32px;border-radius:50%;background:var(--neon-cyan);box-shadow:0 0 20px var(--neon-cyan)"></div>',
        '      <span style="color: var(--neon-cyan); font-weight: 600">Sample Text Link</span>',
        '    </div>',
        '  </div>',
        '</div>',

        // — COMMUNITY —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0.1s">',
        '  <div class="admin-settings-header">',
        '    <h3>👥 Community Tools</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'community\',[\'registrationOpen\',\'requireEmailVerification\',\'maxUsernameLength\',\'maxBioLength\',\'guestMode\'])">Save Changes</button>',
        '  </div>',
        this._toggle('Open Registration', 'registrationOpen', s.community.registrationOpen, 'Allow new users to register. Disable to lock the platform.'),
        this._toggle('Require Email Verification', 'requireEmailVerification', s.community.requireEmailVerification, 'Users must verify their email before posting.'),
        this._toggle('Guest Mode', 'guestMode', s.community.guestMode, 'Allow unauthenticated visitors to browse public pages (e.g. Donations, Forum) without logging in.'),
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md)">',
        this._field('Max Username Length', 'maxUsernameLength', s.community.maxUsernameLength, 'number', 'Maximum characters for usernames (8–64)'),
        this._field('Max Bio Length', 'maxBioLength', s.community.maxBioLength, 'number', 'Maximum characters for user bios (100–2000)'),
        '</div>',
        '</div>',

        // — GAMIFICATION —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0.15s">',
        '  <div class="admin-settings-header">',
        '    <h3>⭐ Gamification System</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'gamification\',[\'xpPerPost\',\'xpPerComment\',\'xpPerLike\',\'levelThresholds\'])">Save Changes</button>',
        '  </div>',
        '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-md)">',
        this._field('XP per Post', 'xpPerPost', s.gamification.xpPerPost, 'number', 'XP for new posts'),
        this._field('XP per Comment', 'xpPerComment', s.gamification.xpPerComment, 'number', 'XP for comments'),
        this._field('XP per Like', 'xpPerLike', s.gamification.xpPerLike, 'number', 'XP for likes'),
        '</div>',
        this._field('Level Thresholds (comma-separated XP)', 'levelThresholds', s.gamification.levelThresholds.join(', '), 'text', '10 values, Level N unlocks when XP ≥ threshold[N].'),
        '</div>',

        // — MAINTENANCE —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0.2s">',
        '  <div class="admin-settings-header">',
        '    <h3>🔧 Maintenance Config</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveSection(\'maintenance\',[\'maintenanceMode\',\'maintenanceMessage\'])">Save Changes</button>',
        '  </div>',
        '  <div style="padding:12px 16px;background:rgba(255,100,0,0.12);border:1px solid rgba(255,100,0,0.3);border-radius:var(--radius-md);margin-bottom:var(--space-md); color:#ff6400; font-size: 0.9rem">',
        '    <strong>⚠ Warning:</strong> Enabling maintenance mode will block all non-admin users from accessing the platform.',
        '  </div>',
        this._toggle('Maintenance Mode', 'maintenanceMode', s.maintenance.maintenanceMode, 'Show maintenance page to all regular users.'),
        this._field('Maintenance Message', 'maintenanceMessage', s.maintenance.maintenanceMessage, 'textarea', 'Message shown to users during maintenance'),
        '  <div style="margin-top:var(--space-md);padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">',
        '    <div><p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Database Engine</p>',
        '    <div style="font-family: var(--font-mono); color: var(--text-primary)">' + s.database.type.toUpperCase() + ' Storage Engine</div></div>',
        '    <span class="badge badge-online">System Ready</span>',
        '  </div>',
        '</div>',

        // — SMTP —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0.25s">',
        '  <div class="admin-settings-header">',
        '    <h3>📧 Mail & SMTP Config</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveSmtp()">Save Changes</button>',
        '  </div>',
        this._toggle('Enable SMTP Services', 'smtp.enabled', s.smtp.enabled, 'Turn on to allow the platform to send automated emails.'),
        '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">',
        this._field('SMTP Host', 'smtp.host', s.smtp.host, 'text', 'e.g. smtp.gmail.com'),
        this._field('SMTP Port', 'smtp.port', s.smtp.port, 'number', '587/465'),
        this._field('Username / Email', 'smtp.user', s.smtp.user, 'text', 'Account username'),
        this._field('Password', 'smtp.pass', s.smtp.pass, 'password', 'Account password'),
        '  </div>',
        this._field('From Address', 'smtp.from', s.smtp.from, 'text', 'e.g. no-reply@yourdomain.com'),
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md)">',
        this._toggle('Use SSL/TLS', 'smtp.secure', s.smtp.secure, 'Enable for port 465 SSL.'),
        this._toggle('Verify Certificate', 'smtp.rejectUnauthorized', s.smtp.rejectUnauthorized, 'Disable only for self-signed certs.'),
        '</div>',
        '  <div style="margin-top:var(--space-md);padding:16px;background:var(--bg-tertiary);border-radius:var(--radius-md); border: 1px solid var(--border-subtle); display:flex;gap:12px;align-items:center">',
        '    <input type="email" id="smtp-test-email" class="input-field" placeholder="Test recipient email" style="flex: 1">',
        '    <button class="btn btn-secondary" onclick="AdminPage.sendTestEmail()">Send Test Email</button>',
        '    <span id="smtp-test-result" style="font-size:0.85rem"></span>',
        '  </div>',
        '</div>',

        // — NOTIFICATIONS —
        '<div class="admin-settings-card animate-fade-up" style="animation-delay:0.3s">',
        '  <div class="admin-settings-header">',
        '    <h3>🔔 Notification Defaults</h3>',
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveNotifications()">Save Changes</button>',
        '  </div>',
        this._toggle('Welcome Email on Register', 'notif.welcomeEmail', s.notifications.welcomeEmail, 'Send a welcome email to new users.'),
        this._toggle('Friend Request Notifications', 'notif.notifyFriendRequests', s.notifications.notifyFriendRequests, 'Email users on friend requests.'),
        this._toggle('New Message Notifications', 'notif.notifyMessages', s.notifications.notifyMessages, 'Email users on direct messages.'),
        this._toggle('Comment Notifications', 'notif.notifyComments', s.notifications.notifyComments, 'Email users on post comments.'),
        this._toggle('Weekly Digest Emails', 'notif.digestEnabled', s.notifications.digestEnabled, 'Send weekly activity summaries.'),
        '</div>',

        '</div>'
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
      '<label style="display:block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px">' + label + '</label>' +
      el +
      (hint ? '<small style="color:var(--text-muted);display:block;margin-top:4px; font-size: 0.75rem">' + hint + '</small>' : '') +
      '</div>';
  },

  _toggle(label, id, checked, hint) {
    return '<div class="form-group" style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid var(--border-subtle);margin-bottom:var(--space-sm)">' +
      '<div><strong style="font-size:0.95rem; color: var(--text-primary)">' + label + '</strong>' +
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

      var addForm = '<div class="admin-settings-card animate-fade-up" style="margin-bottom:var(--space-md)">' +
        '<div class="admin-settings-header"><h3>Add Forum Category</h3></div>' +
        '<div style="display:flex;gap:12px;align-items:flex-end; flex-wrap: wrap;">' +
        '<div style="width: 80px"><label style="display:block;font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Icon</label><input type="text" id="new-cat-icon" class="input-field" value="💬" style="width:100%; text-align: center; font-size: 1.2rem"></div>' +
        '<div style="flex:1; min-width: 200px;"><label style="display:block;font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Name</label><input type="text" id="new-cat-name" class="input-field" placeholder="General Discussion" style="width:100%"></div>' +
        '<div style="flex:2; min-width: 300px;"><label style="display:block;font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Description</label><input type="text" id="new-cat-desc" class="input-field" placeholder="Talk about anything" style="width:100%"></div>' +
        '<div><button class="btn btn-primary" style="height: 42px" onclick="AdminPage.createForumCategory()">Create</button></div>' +
        '</div></div>';

      var tableRows = categories.map(function (c) {
        return '<tr>' +
          '<td style="width: 80px; text-align: center;"><span style="font-size:1.75rem">' + App.escapeHtml(c.icon) + '</span></td>' +
          '<td><strong style="font-size: 1rem; color: var(--text-primary)">' + App.escapeHtml(c.name) + '</strong><div style="font-size:0.85rem;color:var(--text-muted); margin-top: 4px">' + App.escapeHtml(c.description) + '</div></td>' +
          '<td style="white-space: nowrap;"><div style="font-weight: 700; color: var(--neon-cyan)">' + c.thread_count + ' Threads</div><div style="font-size:0.8rem;color:var(--text-muted)">' + c.post_count + ' Posts</div></td>' +
          '<td style="text-align: right;"><button class="btn btn-sm btn-danger" onclick="AdminPage.deleteForumCategory(\'' + c.id + '\')">Delete</button></td>' +
          '</tr>';
      }).join('');

      var list = '<div class="admin-table-container animate-fade-up" style="animation-delay: 0.1s;"><table class="admin-table"><thead><tr><th>Icon</th><th>Category Details</th><th>Statistics</th><th style="text-align:right">Actions</th></tr></thead>' +
        '<tbody>' + (tableRows || '<tr><td colspan="4" style="text-align:center;padding: 40px; color:var(--text-muted)">No forum categories found. Start by adding one above.</td></tr>') + '</tbody></table></div>';

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

      var html = '<div class="admin-settings-section">' +
        '<div class="admin-settings-card animate-fade-up">' +
        '  <div class="admin-settings-header">' +
        '    <h3>🎮 Discord Integration</h3>' +
        '    <button class="btn btn-primary btn-sm" onclick="AdminPage.saveDiscordSettings()">Save Changes</button>' +
        '  </div>' +
        this._field('Webhook URL (General/Alerts)', 'discord-webhookUrl', s.discord.webhookUrl, 'text', 'Enter the full Discord Webhook URL for system alerts.') +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md)">' +
        this._field('Discord Bot Token', 'discord-botToken', s.discord.botToken ? '••••••••' : '', 'text', 'Required for Direct Messaging support.') +
        this._field('Discord Server (Guild) ID', 'discord-guildId', s.discord.guildId, 'text', 'Required for member role fetching.') +
        '</div>';

      if (hasMC) {
        html += '<div style="margin-top:2rem;padding-top:2rem;border-top:1px solid var(--border-subtle)">' +
          '  <h4 style="margin-bottom:1.5rem;color:var(--neon-cyan); font-family: var(--font-display); font-size: 1rem;">🛰️ Minecraft Server Uptime Monitor</h4>' +
          this._field('Manager Notification Role ID', 'discord-uptimeRolePing', s.discord.uptimeRolePing, 'text', 'Role ID to ping/fetch for DM alerts.') +
          '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md)">' +
          this._field('Offline Strike Threshold', 'discord-uptimeStrikeThreshold', s.discord.uptimeStrikeThreshold, 'number', 'Pings before first alert (Default: 5).') +
          this._field('Repeat Alert Interval', 'discord-uptimeStrikeRepeat', s.discord.uptimeStrikeRepeat, 'number', 'Pings between follow-up alerts (Default: 10).') +
          '</div></div>';
      } else {
        html += '<div style="margin-top:2rem;padding-top:2rem;border-top:1px solid var(--border-subtle);opacity:0.5;">' +
          '  <h4 style="margin-bottom:1rem;color:var(--text-muted); font-family: var(--font-display); font-size: 1rem;">🛰️ Minecraft Server Uptime Monitor</h4>' +
          '  <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem; background: var(--bg-tertiary); padding: 12px; border-radius: var(--radius-md)">' +
          '    ℹ Activate the <strong>Minecraft Extension</strong> to configure uptime monitors and manager alerts.' +
          '  </p>' +
          '</div>';
      }

      html += '</div></div>';
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
