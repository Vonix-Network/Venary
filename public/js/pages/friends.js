/* =======================================
   Venary — Friends Page
   ======================================= */
const FriendsPage = {
  searchTimeout: null,

  async render(container) {
    container.innerHTML = '<div class="friends-page">' +
      '<div class="page-header animate-fade-up"><h1>🎮 SQUAD</h1><p>Manage your gaming network</p></div>' +
      '<div class="search-bar animate-fade-up" style="animation-delay: 0.1s">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input type="text" class="input-field" placeholder="Search gamers by username..." id="friend-search">' +
      '<div class="search-results hidden" id="search-results"></div>' +
      '</div>' +
      '<div class="tabs animate-fade-up" style="animation-delay: 0.15s">' +
      '<button class="tab-btn active" data-tab="friends" id="tab-friends">Friends</button>' +
      '<button class="tab-btn" data-tab="requests" id="tab-requests">Requests <span id="request-count"></span></button>' +
      '</div>' +
      '<div id="friends-content"></div>' +
      '</div>';

    this.bindEvents();
    await this.loadFriends();
  },

  bindEvents() {
    var searchInput = document.getElementById('friend-search');
    var searchResults = document.getElementById('search-results');
    var self = this;

    searchInput.addEventListener('input', function (e) {
      clearTimeout(self.searchTimeout);
      var q = e.target.value.trim();
      if (q.length < 2) { searchResults.classList.add('hidden'); return; }
      self.searchTimeout = setTimeout(function () { self.searchUsers(q); }, 300);
    });
    searchInput.addEventListener('blur', function () { setTimeout(function () { searchResults.classList.add('hidden'); }, 200); });
    searchInput.addEventListener('focus', function () { if (searchResults.children.length > 0) searchResults.classList.remove('hidden'); });

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (btn.dataset.tab === 'friends') self.loadFriends();
        else self.loadRequests();
      });
    });
  },

  async searchUsers(q) {
    var results = document.getElementById('search-results');
    try {
      var users = await API.searchUsers(q);
      if (users.length === 0) {
        results.innerHTML = '<div class="search-result-item" style="color: var(--text-muted)">No gamers found</div>';
      } else {
        results.innerHTML = users.map(function (u) {
          return '<div class="search-result-item" onclick="window.location.hash=\'#/profile/' + u.id + '\'">' +
            '<div class="avatar">' + (u.display_name || u.username || '?').charAt(0).toUpperCase() + '</div>' +
            '<div style="flex:1"><div style="font-weight:600">' + App.escapeHtml(u.display_name || u.username) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-muted)">@' + App.escapeHtml(u.username) + ' · LVL ' + u.level + '</div></div>' +
            '<span class="badge badge-' + (u.status === 'online' ? 'online' : 'offline') + '">' + u.status + '</span></div>';
        }).join('');
      }
      results.classList.remove('hidden');
    } catch (err) { results.classList.add('hidden'); }
  },

  async loadFriends() {
    var content = document.getElementById('friends-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var friends = await API.getFriends();
      if (friends.length === 0) {
        content.innerHTML = '<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><h3>No friends yet</h3><p>Search for gamers above to build your squad!</p></div>';
        return;
      }
      content.innerHTML = '<div class="friends-grid stagger-children">' + friends.map(function (f, i) {
        var statusText = f.status === 'online' ? '🟢 Online' : '⚫ Last seen ' + App.timeAgo(f.last_seen);
        return '<div class="friend-card" style="animation-delay: ' + (i * 0.05) + 's">' +
          '<div class="avatar" style="position:relative">' + (f.display_name || f.username || '?').charAt(0).toUpperCase() + '<span class="status-dot ' + (f.status || 'offline') + '"></span></div>' +
          '<div class="friend-info"><h3>' + App.escapeHtml(f.display_name || f.username) + '</h3><p class="friend-status">' + statusText + '</p></div>' +
          '<div class="friend-actions">' +
          '<button class="btn btn-ghost btn-sm" onclick="window.location.hash=\'#/chat/' + f.id + '\'" title="Message"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.location.hash=\'#/profile/' + f.id + '\'" title="Profile"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>' +
          '<button class="btn btn-ghost btn-sm" onclick="FriendsPage.removeFriend(\'' + f.id + '\')" title="Remove" style="color:var(--neon-pink)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</div></div>';
      }).join('') + '</div>';
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p>Failed to load friends</p></div>';
    }
  },

  async loadRequests() {
    var content = document.getElementById('friends-content');
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var data = await API.getFriendRequests();
      var incoming = data.incoming;
      var outgoing = data.outgoing;
      if (incoming.length === 0 && outgoing.length === 0) {
        content.innerHTML = '<div class="empty-state"><h3>No pending requests</h3><p>You\'re all caught up!</p></div>';
        return;
      }
      var html = '';
      if (incoming.length > 0) {
        html += '<h3 style="font-family:var(--font-display);margin-bottom:var(--space-md);font-size:0.9rem;letter-spacing:1px">INCOMING REQUESTS</h3>' +
          '<div class="friends-grid stagger-children" style="margin-bottom:var(--space-xl)">' + incoming.map(function (r, i) {
            return '<div class="friend-card" style="animation-delay: ' + (i * 0.05) + 's">' +
              '<div class="avatar">' + (r.display_name || r.username || '?').charAt(0).toUpperCase() + '</div>' +
              '<div class="friend-info"><h3>' + App.escapeHtml(r.display_name || r.username) + '</h3><p class="friend-status">LVL ' + r.level + ' · Sent ' + App.timeAgo(r.requested_at) + '</p></div>' +
              '<div class="friend-actions"><button class="btn btn-primary btn-sm" onclick="FriendsPage.acceptRequest(\'' + r.id + '\')">Accept</button>' +
              '<button class="btn btn-danger btn-sm" onclick="FriendsPage.rejectRequest(\'' + r.id + '\')">Reject</button></div></div>';
          }).join('') + '</div>';
      }
      if (outgoing.length > 0) {
        html += '<h3 style="font-family:var(--font-display);margin-bottom:var(--space-md);font-size:0.9rem;letter-spacing:1px">SENT REQUESTS</h3>' +
          '<div class="friends-grid stagger-children">' + outgoing.map(function (r, i) {
            return '<div class="friend-card" style="animation-delay: ' + (i * 0.05) + 's;opacity:0.7">' +
              '<div class="avatar">' + (r.display_name || r.username || '?').charAt(0).toUpperCase() + '</div>' +
              '<div class="friend-info"><h3>' + App.escapeHtml(r.display_name || r.username) + '</h3><p class="friend-status">Pending · Sent ' + App.timeAgo(r.requested_at) + '</p></div>' +
              '<button class="btn btn-ghost btn-sm" onclick="FriendsPage.cancelRequest(\'' + r.id + '\')">Cancel</button></div>';
          }).join('') + '</div>';
      }
      content.innerHTML = html;
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p>Failed to load requests</p></div>';
    }
  },

  async acceptRequest(userId) {
    try { await API.acceptFriendRequest(userId); App.showToast('Friend request accepted!', 'success'); this.loadRequests(); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async rejectRequest(userId) {
    try { await API.removeFriend(userId); App.showToast('Request rejected', 'info'); this.loadRequests(); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async cancelRequest(userId) {
    try { await API.removeFriend(userId); App.showToast('Request cancelled', 'info'); this.loadRequests(); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async removeFriend(userId) {
    if (!confirm('Remove this friend from your squad?')) return;
    try { await API.removeFriend(userId); App.showToast('Friend removed', 'info'); this.loadFriends(); } catch (err) { App.showToast(err.message, 'error'); }
  }
};
