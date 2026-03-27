/* =======================================
   Venary — Profile Page
   Uses Skin3D for animated Minecraft avatars
   ======================================= */
const ProfilePage = {
  _viewer: null,
  _previewViewer: null,
  _currentProfile: null,

  async render(container, params) {
    var userId = (params && params[0]) || (App.currentUser ? App.currentUser.id : null);
    var isOwnProfile = userId === (App.currentUser ? App.currentUser.id : null);
    container.innerHTML = '<div class="loading-spinner"></div>';

    // Dispose previous viewers
    ProfilePage._disposeMainViewer();
    ProfilePage._disposePreviewViewer();

    try {
      var profile;
      if (isOwnProfile) {
        try { profile = await API.getUser(userId); } catch (e) { profile = App.currentUser; }
      } else {
        profile = await API.getUser(userId);
      }
      if (!profile) throw new Error('User not found');
      ProfilePage._currentProfile = profile;

      // Normalize userId and isOwnProfile in case user was accessed by username
      userId = profile.id;
      isOwnProfile = userId === (App.currentUser ? App.currentUser.id : null);

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
        // no buttons here — actions moved to avatar dropdown
      } else {
        actionsHtml = this.renderFriendButton(profile) +
          ' <button class="btn btn-secondary" onclick="window.location.hash=\'#/chat/' + profile.id + '\'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Message</button>';
      }

      var statsHtml = '';

      if (profile.minecraft_uuid) {
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

      statsHtml += '<div style="grid-column: 1 / -1; display: flex; justify-content: center; gap: var(--space-md);">' +
        '<div class="stat-card" style="flex: 1; max-width: calc(50% - var(--space-md)/2);"><div class="stat-value">' + (profile.friend_count || 0) + '</div><div class="stat-label">Friends</div></div>' +
        '<div class="stat-card" style="flex: 1; max-width: calc(50% - var(--space-md)/2);"><div class="stat-value">' + (profile.post_count || 0) + '</div><div class="stat-label">Posts</div></div>' +
        '</div>';

      // Build the skin viewer — positioned on the RIGHT side of the profile header
      var skinViewerHtml = '';
      if (profile.minecraft_uuid) {
        skinViewerHtml = '<div class="skin-viewer-wrapper">' +
          '<div id="skin-viewer-container" class="skin-viewer-box"></div>' +
          (isOwnProfile ? '<button class="btn btn-secondary btn-sm skin-customize-btn" id="customize-skin-btn">🎨 Customize</button>' : '') +
          '</div>';
      }

      container.innerHTML = '<div class="profile-page">' +
        '<div class="profile-header" style="position:relative">' +
        (profile.minecraft_uuid ? skinViewerHtml : '') +
        '<div class="profile-info">' +
        '<div class="profile-avatar-section">' +
        (isOwnProfile
          ? '<div style="position:relative">' +
            '<div class="profile-avatar" id="profile-avatar-trigger" style="cursor:pointer" onclick="ProfilePage.toggleAvatarMenu()" title="Profile options">' + avatarContent + '</div>' +
            roleBadge +
            '</div>'
          : '<div class="profile-avatar">' + avatarContent + '</div>' + roleBadge
        ) +
        '<div id="profile-donation-btn-area"></div>' +
        '<div class="profile-actions">' + actionsHtml + '</div>' +
        '</div>' +
        '<div class="profile-details">' +
        '<h1>' + App.renderUsername(profile, true) + ' ' + App.renderRankBadge(profile.donation_rank) + '</h1>' +
        '<p class="username">@' + App.escapeHtml(profile.username) + ' · <span class="badge badge-level">LVL ' + (profile.level || 1) + '</span></p>' +
        (profile.bio ? '<p class="profile-bio">' + App.escapeHtml(profile.bio) + '</p>' : '') +
        tagsHtml +
        '</div>' +
        '</div>' +
        '<div class="profile-stats">' + statsHtml + '</div>' +
        '</div>' +
        (isOwnProfile ? '<div id="edit-modal" class="hidden"></div>' : '') +
        '<div id="skin-customize-modal" class="hidden"></div>' +
        '<div class="page-header" style="margin-top: var(--space-xl)"><h1>📝 Posts</h1></div>' +
        '<div id="user-posts" class="stagger-children"><div class="loading-spinner"></div></div>' +
        '</div>';

      // Load skin3d and init viewer
      if (profile.minecraft_uuid) {
        ProfilePage._loadSkin3d(function () {
          ProfilePage._initMainViewer(profile.minecraft_uuid, profile.skin_animation || {});
        });
      }

      this.loadUserPosts(userId);

      // Load donation rank button (visible to all users)
      ProfilePage._loadDonationButton(profile.id, isOwnProfile);

      if (isOwnProfile) {
        var customizeBtn = document.getElementById('customize-skin-btn');
        if (customizeBtn) customizeBtn.addEventListener('click', function () { ProfilePage.showCustomizeModal(profile); });
      }
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>User not found</h3><p>' + (err.message || '') + '</p></div>';
    }
  },

  toggleAvatarMenu() {
    var existing = document.getElementById('profile-avatar-menu');
    if (existing) {
      existing.remove();
      return;
    }

    var trigger = document.getElementById('profile-avatar-trigger');
    if (!trigger) return;
    var rect = trigger.getBoundingClientRect();

    var donationsEnabled = App.extensions && App.extensions.some(function(e) { return e.id === 'donations' && e.enabled; });

    var menu = document.createElement('div');
    menu.id = 'profile-avatar-menu';
    menu.className = 'profile-avatar-dropdown';
    menu.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + (rect.top - 8) + 'px;transform:translateY(-100%);z-index:9999;';
    menu.innerHTML =
      '<div class="notification-item" onclick="ProfilePage.closeAvatarMenu(); ProfilePage.showEditModal(ProfilePage._currentProfile);" style="cursor:pointer;display:flex;align-items:center;gap:10px">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '<span>Edit Profile</span>' +
      '</div>' +
      (donationsEnabled
        ? '<div class="notification-item" onclick="ProfilePage.closeAvatarMenu(); ProfilePage.showDonationHistory();" style="cursor:pointer;display:flex;align-items:center;gap:10px">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
            '<span>Donation History</span>' +
          '</div>'
        : '');

    document.body.appendChild(menu);

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function handler(e) {
        if (!menu.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  },

  closeAvatarMenu() {
    var menu = document.getElementById('profile-avatar-menu');
    if (menu) menu.remove();
  },

  // ──────────────────────────────────────────────
  //  Skin3D Library Loading
  // ──────────────────────────────────────────────

  _loadSkin3d(callback) {
    if (window.skin3d && window.skin3d.Render) return callback();
    var script = document.createElement('script');
    script.src = '/js/skin3d.bundle.js';
    script.onload = function () {
      console.log('[Skin3D] Library loaded, exports:', Object.keys(window.skin3d || {}));
      callback();
    };
    script.onerror = function () { console.error('[Skin3D] Failed to load bundle'); };
    document.head.appendChild(script);
  },

  // ──────────────────────────────────────────────
  //  Animation Definitions
  // ──────────────────────────────────────────────

  ANIMATIONS: {
    idle:    { label: '😴 Idle',      desc: 'Gentle sway' },
    walking: { label: '🚶 Walking',   desc: 'Arms and legs swing' },
    running: { label: '🏃 Running',   desc: 'Fast, exaggerated swing' },
    flying:  { label: '🦅 Flying',    desc: 'Body rotates, elytra' },
    waving:  { label: '👋 Waving',    desc: 'One arm waves' },
    crouch:  { label: '🧎 Crouching', desc: 'Crouch pose' },
    hit:     { label: '⚔️ Hit',       desc: 'Right arm swings' },
    none:    { label: '🧍 None',      desc: 'Static pose' }
  },

  _createAnimation(type, speed) {
    var s3d = window.skin3d;
    if (!s3d) return null;
    var anim = null;
    switch (type) {
      case 'idle':    anim = new s3d.IdleAnimation(); break;
      case 'walking': anim = new s3d.WalkingAnimation(); break;
      case 'running': anim = new s3d.RunningAnimation(); break;
      case 'flying':  anim = new s3d.FlyingAnimation(); break;
      case 'waving':  anim = new s3d.WaveAnimation(); break;
      case 'crouch':  anim = new s3d.CrouchAnimation(); break;
      case 'hit':     anim = new s3d.HitAnimation(); break;
      case 'none':    return null;
      default:        anim = new s3d.WalkingAnimation(); break;
    }
    if (anim && speed) anim.speed = speed;
    return anim;
  },

  // ──────────────────────────────────────────────
  //  Main Profile Viewer (right side of header)
  // ──────────────────────────────────────────────

  _initMainViewer(uuid, prefs) {
    var container = document.getElementById('skin-viewer-container');
    if (!container || !window.skin3d || !window.skin3d.Render) {
      console.error('[Skin3D] Cannot init: container=', !!container, 'skin3d=', !!window.skin3d);
      return;
    }

    // Dispose any existing viewer first
    ProfilePage._disposeMainViewer();

    try {
      container.innerHTML = '';
      var settings = Object.assign({ animation: 'walking', speed: 1, autoRotate: true, zoom: 0.8, autoRotateSpeed: 1 }, prefs || {});

      // Create a canvas element for the renderer
      var canvas = document.createElement('canvas');
      container.appendChild(canvas);

      var viewer = new window.skin3d.Render({
        canvas: canvas,
        width: container.clientWidth || 160,
        height: container.clientHeight || 240,
        skin: 'https://mc-heads.net/skin/' + uuid,
        zoom: settings.zoom || 0.8,
        animation: ProfilePage._createAnimation(settings.animation, settings.speed)
      });

      viewer.autoRotate = settings.autoRotate !== false;
      viewer.autoRotateSpeed = settings.autoRotateSpeed || 1;

      // Show nametag if username is known
      if (ProfilePage._currentProfile && ProfilePage._currentProfile.minecraft_username) {
        try { viewer.nameTag = ProfilePage._currentProfile.minecraft_username; } catch (e) { }
      }

      ProfilePage._viewer = viewer;
      console.log('[Skin3D] Main viewer initialized successfully');
    } catch (e) {
      console.error('[Skin3D] Failed to init main viewer:', e);
      // Fallback to static image
      container.innerHTML = '<img src="https://mc-heads.net/body/' + uuid + '/160" alt="Skin" style="image-rendering:pixelated;margin:auto;display:block;height:100%">';
    }
  },

  _disposeMainViewer() {
    if (ProfilePage._viewer) {
      try { ProfilePage._viewer.dispose(); } catch (e) { }
      ProfilePage._viewer = null;
    }
  },

  // ──────────────────────────────────────────────
  //  Customization Modal
  // ──────────────────────────────────────────────

  showCustomizeModal(profile) {
    var modal = document.getElementById('skin-customize-modal');
    if (!modal || !profile.minecraft_uuid) return;
    modal.classList.remove('hidden');

    var currentPrefs = Object.assign({ animation: 'walking', speed: 1, autoRotate: true, zoom: 0.8, autoRotateSpeed: 1 }, profile.skin_animation || {});

    // Build animation options dropdown
    var animOptions = '';
    var anims = ProfilePage.ANIMATIONS;
    for (var key in anims) {
      animOptions += '<option value="' + key + '"' + (currentPrefs.animation === key ? ' selected' : '') + '>' + anims[key].label + ' — ' + anims[key].desc + '</option>';
    }

    modal.innerHTML = '<div class="modal-overlay" id="skin-customize-overlay"><div class="modal" style="max-width:480px">' +
      '<div class="modal-header"><h3 class="modal-title">🎨 Customize Skin Animation</h3>' +
      '<button class="modal-close" id="close-skin-customize"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +

      '<div class="skin-customize-body">' +
      '<div class="skin-customize-preview"><div id="skin-customize-viewer" style="width:180px;height:260px;margin:0 auto;border-radius:12px;overflow:hidden;background:rgba(0,0,0,0.3);"></div></div>' +

      '<form id="skin-customize-form" class="auth-form" style="margin-top:var(--space-md)">' +
      '<div class="input-group"><label>Animation</label>' +
      '<select class="input-field" id="skin-anim-type">' + animOptions + '</select></div>' +

      '<div class="input-group"><label>Animation Speed: <span id="speed-val">' + currentPrefs.speed.toFixed(1) + 'x</span></label>' +
      '<input type="range" class="input-field" id="skin-anim-speed" min="0.1" max="3" step="0.1" value="' + currentPrefs.speed + '" style="padding:4px 0"></div>' +

      '<div class="input-group"><label>Zoom: <span id="zoom-val">' + currentPrefs.zoom.toFixed(1) + '</span></label>' +
      '<input type="range" class="input-field" id="skin-anim-zoom" min="0.3" max="2" step="0.1" value="' + currentPrefs.zoom + '" style="padding:4px 0"></div>' +

      '<div class="input-group"><label>Auto Rotate Speed: <span id="rotate-speed-val">' + (currentPrefs.autoRotateSpeed || 1).toFixed(1) + '</span></label>' +
      '<input type="range" class="input-field" id="skin-rotate-speed" min="0" max="5" step="0.5" value="' + (currentPrefs.autoRotateSpeed || 1) + '" style="padding:4px 0"></div>' +

      '<div class="input-group" style="flex-direction:row;align-items:center;gap:8px">' +
      '<input type="checkbox" id="skin-auto-rotate"' + (currentPrefs.autoRotate !== false ? ' checked' : '') + ' style="width:auto">' +
      '<label for="skin-auto-rotate" style="margin:0;cursor:pointer">Auto Rotate</label></div>' +

      '<button type="submit" class="btn btn-primary" style="width:100%">💾 Save Animation</button>' +
      '</form>' +
      '</div>' +
      '</div></div>';

    // Close modal handler (with viewer cleanup/restore)
    var closeModal = function () {
      modal.classList.add('hidden');
      ProfilePage._disposePreviewViewer();
      // Restore main viewer
      if (profile.minecraft_uuid) {
        ProfilePage._initMainViewer(profile.minecraft_uuid, profile.skin_animation || {});
      }
    };

    document.getElementById('close-skin-customize').addEventListener('click', closeModal);
    document.getElementById('skin-customize-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'skin-customize-overlay') closeModal();
    });

    // Dispose main viewer first to free WebGL context
    ProfilePage._disposeMainViewer();

    // Init preview viewer after a frame so the modal DOM is painted
    requestAnimationFrame(function () {
      setTimeout(function () {
        ProfilePage._initPreviewViewer(profile.minecraft_uuid, currentPrefs);
      }, 50);
    });

    // Live preview controls
    document.getElementById('skin-anim-type').addEventListener('change', function () { ProfilePage._updatePreview(); });
    document.getElementById('skin-anim-speed').addEventListener('input', function () {
      document.getElementById('speed-val').textContent = parseFloat(this.value).toFixed(1) + 'x';
      ProfilePage._updatePreview();
    });
    document.getElementById('skin-anim-zoom').addEventListener('input', function () {
      document.getElementById('zoom-val').textContent = parseFloat(this.value).toFixed(1);
      ProfilePage._updatePreview();
    });
    document.getElementById('skin-rotate-speed').addEventListener('input', function () {
      document.getElementById('rotate-speed-val').textContent = parseFloat(this.value).toFixed(1);
      ProfilePage._updatePreview();
    });
    document.getElementById('skin-auto-rotate').addEventListener('change', function () { ProfilePage._updatePreview(); });

    // Save handler
    document.getElementById('skin-customize-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var newPrefs = {
        animation: document.getElementById('skin-anim-type').value,
        speed: parseFloat(document.getElementById('skin-anim-speed').value),
        autoRotate: document.getElementById('skin-auto-rotate').checked,
        zoom: parseFloat(document.getElementById('skin-anim-zoom').value),
        autoRotateSpeed: parseFloat(document.getElementById('skin-rotate-speed').value)
      };

      try {
        var updated = await API.updateProfile({ skin_animation: newPrefs });
        App.currentUser = Object.assign({}, App.currentUser, updated);
        profile.skin_animation = newPrefs;
        modal.classList.add('hidden');
        ProfilePage._disposePreviewViewer();
        App.showToast('Skin animation saved!', 'success');
        // Re-init main viewer with new settings
        ProfilePage._initMainViewer(profile.minecraft_uuid, newPrefs);
      } catch (err) {
        App.showToast(err.message || 'Failed to save', 'error');
      }
    });
  },

  // ──────────────────────────────────────────────
  //  Preview Viewer (inside customize modal)
  // ──────────────────────────────────────────────

  _initPreviewViewer(uuid, prefs) {
    var container = document.getElementById('skin-customize-viewer');
    if (!container || !window.skin3d || !window.skin3d.Render) {
      console.error('[Skin3D] Cannot init preview: container=', !!container, 'skin3d=', !!window.skin3d);
      return;
    }

    ProfilePage._disposePreviewViewer();

    try {
      container.innerHTML = '';
      var canvas = document.createElement('canvas');
      container.appendChild(canvas);

      var viewer = new window.skin3d.Render({
        canvas: canvas,
        width: 180,
        height: 260,
        skin: 'https://mc-heads.net/skin/' + uuid,
        zoom: prefs.zoom || 0.8,
        animation: ProfilePage._createAnimation(prefs.animation, prefs.speed)
      });

      viewer.autoRotate = prefs.autoRotate !== false;
      viewer.autoRotateSpeed = prefs.autoRotateSpeed || 1;

      ProfilePage._previewViewer = viewer;
      console.log('[Skin3D] Preview viewer initialized successfully');
    } catch (e) {
      console.error('[Skin3D] Preview viewer error:', e);
    }
  },

  _updatePreview() {
    var viewer = ProfilePage._previewViewer;
    if (!viewer) return;
    try {
      var type = document.getElementById('skin-anim-type').value;
      var speed = parseFloat(document.getElementById('skin-anim-speed').value);
      var autoRotate = document.getElementById('skin-auto-rotate').checked;
      var zoom = parseFloat(document.getElementById('skin-anim-zoom').value);
      var rotateSpeed = parseFloat(document.getElementById('skin-rotate-speed').value);

      viewer.animation = ProfilePage._createAnimation(type, speed);
      viewer.autoRotate = autoRotate;
      viewer.autoRotateSpeed = rotateSpeed;
      viewer.zoom = zoom;
    } catch (e) { console.error('[Skin3D] Preview update error:', e); }
  },

  _disposePreviewViewer() {
    if (ProfilePage._previewViewer) {
      try { ProfilePage._previewViewer.dispose(); } catch (e) { }
      ProfilePage._previewViewer = null;
    }
  },

  // ──────────────────────────────────────────────
  //  Donation History
  // ──────────────────────────────────────────────

  async _loadDonationButton(userId, isOwnProfile) {
    const area = document.getElementById('profile-donation-btn-area');
    if (!area) return;

    // Check if donations extension is enabled
    const donationsEnabled = App.extensions && App.extensions.some(function(e) { return e.id === 'donations' && e.enabled; });
    if (!donationsEnabled) return;

    // For own profile, donation history is now in the avatar dropdown menu
    if (isOwnProfile) return;

    // For other users, nothing to show here
    area.innerHTML = '';
  },

  async showDonationHistory() {
    App.showModal('💰 Donation History', '<div style="text-align:center;padding:20px"><div class="loading-spinner"></div></div>');

    try {
      const data = await API.get('/api/ext/donations/my-history');
      const { donations, conversions } = data;

      let html = '';

      // Current rank summary
      try {
        const rank = await API.get('/api/ext/donations/my-rank');
        if (rank && rank.active && rank.rank_name) {
          const daysLeft = rank.expires_at
            ? Math.max(0, Math.ceil((new Date(rank.expires_at) - Date.now()) / (1000 * 60 * 60 * 24)))
            : '∞';
          html += `<div style="background:var(--bg-card);border:1px solid ${App.escapeHtml(rank.rank_color || 'var(--border-subtle)')};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
            <span style="font-size:1.5rem">${rank.rank_icon || '⭐'}</span>
            <div>
              <div style="font-weight:700;color:${App.escapeHtml(rank.rank_color)}">${App.escapeHtml(rank.rank_name)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted)">${daysLeft === '∞' ? 'Permanent' : daysLeft + ' days remaining'}</div>
            </div>
            <a href="#/donate" onclick="App.closeModal()" style="margin-left:auto;font-size:0.8rem;color:var(--neon-cyan);text-decoration:none">Manage →</a>
          </div>`;
        }
      } catch { /* no rank */ }

      // Donations table
      if (donations && donations.length > 0) {
        html += '<div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Transaction History</div>';
        html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto">';
        for (const d of donations) {
          const statusColor = d.status === 'completed' ? '#22c55e' : d.status === 'pending' ? '#eab308' : '#ef4444';
          const typeIcon = d.payment_type === 'manual' ? '📝' : '💳';
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm)">
            <div>
              <span style="font-size:0.85rem;font-weight:600;color:${App.escapeHtml(d.rank_color || 'var(--text-primary)')}">${d.rank_icon || typeIcon} ${App.escapeHtml(d.rank_name || 'Donation')}</span>
              <div style="font-size:0.75rem;color:var(--text-muted)">${new Date(d.created_at).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'})}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:#22c55e">$${parseFloat(d.amount).toFixed(2)}</div>
              <div style="font-size:0.7rem;color:${statusColor}">${d.status}</div>
            </div>
          </div>`;
        }
        html += '</div>';
      } else {
        html += '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:20px 0">No donation history yet.</p>';
      }

      // Conversions
      if (conversions && conversions.length > 0) {
        html += '<div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px 0">Rank Conversions</div>';
        html += '<div style="display:flex;flex-direction:column;gap:6px">';
        for (const c of conversions) {
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-sm)">
            <div style="font-size:0.85rem">
              <span style="color:${App.escapeHtml(c.from_rank_color || '#888')}">${App.escapeHtml(c.from_rank_name || '?')}</span>
              <span style="color:var(--text-muted);margin:0 6px">→</span>
              <span style="color:${App.escapeHtml(c.to_rank_color || 'var(--neon-cyan)')}">${App.escapeHtml(c.to_rank_name || '?')}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${new Date(c.converted_at).toLocaleDateString()}</div>
          </div>`;
        }
        html += '</div>';
      }

      // Update modal body
      const modalBody = document.querySelector('#app-modal-overlay .modal-body');
      if (modalBody) modalBody.innerHTML = html;
    } catch (err) {
      const modalBody = document.querySelector('#app-modal-overlay .modal-body');
      if (modalBody) modalBody.innerHTML = '<p style="color:var(--neon-magenta);text-align:center">Failed to load donation history.</p>';
    }
  },

  // ──────────────────────────────────────────────
  //  Friend Actions
  // ──────────────────────────────────────────────

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
    var confirmed = await App.confirm('Remove Friend', 'Remove this friend?');
    if (!confirmed) return;
    try { await API.removeFriend(id); App.showToast('Friend removed', 'info'); Router.navigate(window.location.hash); } catch (err) { App.showToast(err.message, 'error'); }
  },

  // ──────────────────────────────────────────────
  //  Posts
  // ──────────────────────────────────────────────

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

  // ──────────────────────────────────────────────
  //  Edit Profile Modal
  // ──────────────────────────────────────────────

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
