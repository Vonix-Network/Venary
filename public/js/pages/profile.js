/* =======================================
   Venary — Profile Page
   ======================================= */
const ProfilePage = {
  async render(container, params) {
    var userId = (params && params[0]) || (App.currentUser ? App.currentUser.id : null);
    var isOwnProfile = userId === (App.currentUser ? App.currentUser.id : null);
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
      var profile;
      if (isOwnProfile) {
        try { profile = await API.getUser(userId); } catch (e) { profile = App.currentUser; }
      } else {
        profile = await API.getUser(userId);
      }
      if (!profile) throw new Error('User not found');

      var initials = (profile.display_name || profile.username || '?').charAt(0).toUpperCase();
      var avatarContent = profile.avatar
        ? '<img src="' + App.escapeHtml(profile.avatar) + '" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
        : initials;
      var tags = profile.gaming_tags || [];

      var roleBadge = '';
      if (profile.role === 'admin') roleBadge = '<span class="badge badge-admin" style="margin-top:8px">ADMIN</span>';
      else if (profile.role === 'moderator') roleBadge = '<span class="badge badge-mod" style="margin-top:8px">MOD</span>';

      var tagsHtml = '';
      if (tags.length > 0) {
        tagsHtml = '<div class="profile-tags">' + tags.map(function (t) {
          return '<span class="tag">🎮 ' + App.escapeHtml(t) + '</span>';
        }).join('') + '</div>';
      }

      var actionsHtml = '';
      if (isOwnProfile) {
        actionsHtml = '<button class="btn btn-secondary" id="edit-profile-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Profile</button>';
        if (App.currentUser && App.currentUser.role === 'admin') {
          actionsHtml += ' <a href="#/admin" class="btn btn-secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Admin Panel</a>';
        }
      } else {
        actionsHtml = this.renderFriendButton(profile) +
          ' <button class="btn btn-secondary" onclick="window.location.hash=\'#/chat/' + profile.id + '\'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Message</button>';
      }

      var statsHtml = '';

      if (profile.minecraft_uuid) {
        // Resolve username if it's a UUID or missing
        if (!profile.minecraft_username || profile.minecraft_username === profile.minecraft_uuid) {
          try {
            const mojang = await fetch('https://api.ashcon.app/mojang/v2/user/' + profile.minecraft_uuid).then(r => r.json());
            if (mojang && mojang.username) profile.minecraft_username = mojang.username;
          } catch (e) { }
        }

        statsHtml += '<div class="stat-card wide anim-fade-up" style="animation-delay: 0.1s">' +
          '<div class="mc-id-left">' +
          '<img src="https://mc-heads.net/avatar/' + profile.minecraft_uuid + '/64" class="mc-id-head" alt="">' +
          '</div>' +
          '<div class="mc-id-right">' +
          '<div class="stat-label" style="text-align:left; margin:0 0 2px 0">Minecraft Account</div>' +
          '<div class="mc-id-username">' + App.escapeHtml(profile.minecraft_username || 'Minecraft Player') + '</div>' +
          '<div class="mc-id-uuid">' + profile.minecraft_uuid + '</div>' +
          '</div>' +
          '</div>';
      }

      statsHtml += '<div class="stat-card"><div class="stat-value">' + (profile.level || 1) + '</div><div class="stat-label">Level</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + (profile.xp || 0) + '</div><div class="stat-label">Site XP</div></div>';

      if (profile.minecraft_xp !== undefined && (profile.minecraft_xp > 0 || profile.minecraft_uuid)) {
        statsHtml += '<div class="stat-card"><div class="stat-value" style="color:#22c55e">' + (profile.minecraft_xp || 0) + '</div><div class="stat-label">MC XP</div></div>' +
          '<div class="stat-card"><div class="stat-value" style="color:var(--neon-cyan)">' + (profile.total_xp || 0) + '</div><div class="stat-label">Total XP</div></div>';
      }

      statsHtml += '<div class="stat-card"><div class="stat-value">' + (profile.friend_count || 0) + '</div><div class="stat-label">Friends</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + (profile.post_count || 0) + '</div><div class="stat-label">Posts</div></div>';

      container.innerHTML = '<div class="profile-page">' +
        '<div class="profile-header" style="position:relative">' +
        (profile.minecraft_uuid ? '<div id="skin-viewer-container" style="position:absolute;top:1rem;right:1rem;width:150px;height:200px;z-index:2;"></div>' : '') +
        '<div class="profile-info">' +
        '<div class="profile-avatar-section">' +
        '<div class="profile-avatar">' + avatarContent + '</div>' + roleBadge +
        '</div>' +
        '<div class="profile-details">' +
        '<h1>' + App.escapeHtml(profile.display_name || profile.username) + App.renderRankBadge(profile.donation_rank) + '</h1>' +
        '<p class="username">@' + App.escapeHtml(profile.username) + ' · <span class="badge badge-level">LVL ' + (profile.level || 1) + '</span></p>' +
        (profile.bio ? '<p class="profile-bio">' + App.escapeHtml(profile.bio) + '</p>' : '') +
        tagsHtml +
        '<div class="profile-actions">' + actionsHtml + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="profile-stats">' + statsHtml + '</div>' +
        '</div>' +
        (isOwnProfile ? '<div id="edit-modal" class="hidden"></div>' : '') +
        '<div class="page-header" style="margin-top: var(--space-xl)"><h1>📝 Posts</h1></div>' +
        '<div id="user-posts" class="stagger-children"><div class="loading-spinner"></div></div>' +
        '</div>';

      if (profile.minecraft_uuid) {
        setTimeout(function () {
          if (!window.skin3d) {
            var script = document.createElement('script');
            script.src = '/node_modules/skin3d/dist/skin3d.umd.js';
            script.onload = function () { ProfilePage.initSkinViewer(profile.minecraft_uuid); };
            document.head.appendChild(script);
          } else {
            ProfilePage.initSkinViewer(profile.minecraft_uuid);
          }
        }, 50);
      }

      this.loadUserPosts(userId);
      if (isOwnProfile) {
        var editBtn = document.getElementById('edit-profile-btn');
        if (editBtn) editBtn.addEventListener('click', function () { ProfilePage.showEditModal(profile); });
      }
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>User not found</h3><p>' + (err.message || '') + '</p></div>';
    }
  },

  renderFriendButton(profile) {
    if (profile.friendship_status === 'accepted') {
      return '<button class="btn btn-danger btn-sm" onclick="ProfilePage.removeFriend(\'' + profile.id + '\')">Remove Friend</button>';
    }
    if (profile.friendship_status === 'pending' && profile.friendship_direction === 'sent') {
      return '<button class="btn btn-secondary btn-sm" disabled>Request Sent</button>';
    }
    if (profile.friendship_status === 'pending' && profile.friendship_direction === 'received') {
      return '<button class="btn btn-primary btn-sm" onclick="ProfilePage.acceptFriend(\'' + profile.id + '\')">Accept Request</button>';
    }
    return '<button class="btn btn-primary btn-sm" onclick="ProfilePage.addFriend(\'' + profile.id + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> Add Friend</button>';
  },

  async addFriend(id) {
    try { await API.sendFriendRequest(id); App.showToast('Friend request sent!', 'success'); Router.navigate(window.location.hash); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async acceptFriend(id) {
    try { await API.acceptFriendRequest(id); App.showToast('Friend request accepted!', 'success'); Router.navigate(window.location.hash); } catch (err) { App.showToast(err.message, 'error'); }
  },
  async removeFriend(id) {
    if (!confirm('Remove this friend?')) return;
    try { await API.removeFriend(id); App.showToast('Friend removed', 'info'); Router.navigate(window.location.hash); } catch (err) { App.showToast(err.message, 'error'); }
  },

  initSkinViewer(uuid) {
    try {
      var container = document.getElementById('skin-viewer-container');
      if (!container) return;
      container.innerHTML = '';
      var canvas = document.createElement('canvas');
      container.appendChild(canvas);

      var viewer = new window.skin3d.Render({
        canvas: canvas,
        width: 150,
        height: 200,
        skin: 'https://minotar.net/skin/' + uuid,
        autoRotate: true
      });

      viewer.animation = new window.skin3d.WalkingAnimation();
    } catch (e) {
      console.error('Failed to init skin viewer', e);
      var container = document.getElementById('skin-viewer-container');
      if (container) container.innerHTML = '<img src="https://mc-heads.net/body/' + uuid + '/150" alt="Skin fallback" style="image-rendering:pixelated;margin:auto;display:block;height:100%">';
    }
  },

  async loadUserPosts(userId) {
    try {
      var posts = await API.getFeed();
      var userPosts = posts.filter(function (p) { return p.user_id === userId; });
      var container = document.getElementById('user-posts');
      if (!container) return;
      if (userPosts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No posts yet</p></div>';
      } else {
        container.innerHTML = userPosts.map(function (p, i) { return FeedPage.createPostElement(p, i); }).join('');
      }
    } catch (err) { /* silently fail */ }
  },

  showEditModal(profile) {
    var modal = document.getElementById('edit-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.innerHTML = '<div class="modal-overlay" id="edit-overlay"><div class="modal">' +
      '<div class="modal-header"><h3 class="modal-title">Edit Profile</h3>' +
      '<button class="modal-close" id="close-edit"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
      '<form id="edit-form" class="auth-form">' +
      '<div class="input-group"><label>Display Name</label><input type="text" class="input-field" id="edit-display" value="' + App.escapeHtml(profile.display_name || '') + '"></div>' +
      '<div class="input-group"><label>Avatar URL</label><input type="text" class="input-field" id="edit-avatar" value="' + App.escapeHtml(profile.avatar || '') + '" placeholder="https://example.com/image.png"></div>' +
      '<div class="input-group"><label>Bio</label><textarea class="input-field" id="edit-bio" rows="3">' + App.escapeHtml(profile.bio || '') + '</textarea></div>' +
      '<div class="input-group"><label>Gaming Tags (comma separated)</label><input type="text" class="input-field" id="edit-tags" value="' + (profile.gaming_tags || []).join(', ') + '" placeholder="e.g. FPS, RPG, Souls-like"></div>' +
      '<button type="submit" class="btn btn-primary">Save Changes</button>' +
      '</form></div></div>';

    document.getElementById('close-edit').addEventListener('click', function () { modal.classList.add('hidden'); });
    document.getElementById('edit-overlay').addEventListener('click', function (e) { if (e.target.id === 'edit-overlay') modal.classList.add('hidden'); });
    document.getElementById('edit-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        var tags = document.getElementById('edit-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        var updated = await API.updateProfile({
          display_name: document.getElementById('edit-display').value,
          avatar: document.getElementById('edit-avatar').value,
          bio: document.getElementById('edit-bio').value,
          gaming_tags: tags
        });
        App.currentUser = Object.assign({}, App.currentUser, updated);
        modal.classList.add('hidden');
        App.showToast('Profile updated!', 'success');
        Router.navigate(window.location.hash);
      } catch (err) { App.showToast(err.message, 'error'); }
    });
  }
};
