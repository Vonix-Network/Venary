/* =======================================
   Venary — Feed Page
   ======================================= */
const FeedPage = {
  posts: [],
  loading: false,

  async render(container) {
    container.innerHTML = `
      <div class="feed-page">
        <div class="page-header animate-fade-up">
          <h1>⚡ BATTLE FEED</h1>
          <p>Share your victories, strategies, and gaming moments</p>
        </div>
        <div class="post-composer animate-fade-up" style="animation-delay: 0.1s">
          <div class="composer-input">
            <div class="avatar">${App.currentUser && App.currentUser.avatar ? `<img src="${App.escapeHtml(App.currentUser.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : App.getInitials()}</div>
            <textarea class="composer-textarea input-field" id="post-content" placeholder="Share your latest achievement, strategy, or gaming moment..." maxlength="1000"></textarea>
          </div>
          <div class="composer-actions">
            <span class="char-count" id="char-count">0 / 1000</span>
            <button class="btn btn-primary" id="post-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Post
            </button>
          </div>
        </div>
        <div id="feed-posts" class="stagger-children"></div>
        <div id="feed-loader" class="loading-spinner hidden"></div>
        <div id="feed-empty" class="empty-state hidden">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <h3>No posts yet</h3>
          <p>Be the first to share something with the community!</p>
        </div>
      </div>
    `;
    this.bindEvents(container);
    await this.loadFeed();

    // Dispatch event for extensions to hook into
    document.dispatchEvent(new CustomEvent('feed:rendered', { detail: { container } }));
  },

  bindEvents(container) {
    const textarea = container.querySelector('#post-content');
    const charCount = container.querySelector('#char-count');
    const postBtn = container.querySelector('#post-btn');
    textarea.addEventListener('input', function () {
      var len = textarea.value.length;
      charCount.textContent = len + ' / 1000';
      charCount.className = 'char-count' + (len > 900 ? ' at-limit' : len > 750 ? ' near-limit' : '');
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    });
    postBtn.addEventListener('click', function () { FeedPage.createPost(textarea); });
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) FeedPage.createPost(textarea);
    });
  },

  async createPost(textarea) {
    var content = textarea.value.trim();
    if (!content) return;
    var postBtn = document.getElementById('post-btn');
    var composer = textarea.closest('.post-composer');
    postBtn.disabled = true;
    postBtn.innerHTML = '<span class="spinner"></span>';

    // IMAGE EXTENSION HOOK: Get images if available
    var image = null;
    if (typeof ImagesHook !== 'undefined') {
      image = await ImagesHook.getImages(composer);
    }

    try {
      var post = await API.createPost({ content: content, image: image });
      textarea.value = '';
      textarea.style.height = 'auto';
      document.getElementById('char-count').textContent = '0 / 1000';

      // Reset image hook if exists
      if (typeof ImagesHook !== 'undefined') {
        ImagesHook.reset(composer);
      }

      var container = document.getElementById('feed-posts');
      container.insertAdjacentHTML('afterbegin', this.createPostElement(post));
      var empty = document.getElementById('feed-empty');
      if (empty) empty.classList.add('hidden');
      App.showToast('Post shared!', 'success');
    } catch (err) {
      App.showToast(err.message || 'Failed to create post', 'error');
    } finally {
      postBtn.disabled = false;
      postBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post';
    }
  },

  async loadFeed() {
    if (this.loading) return;
    this.loading = true;
    var loader = document.getElementById('feed-loader');
    if (loader) loader.classList.remove('hidden');
    try {
      var posts = await API.getFeed();
      this.posts = posts;
      var container = document.getElementById('feed-posts');
      if (!container) return;
      if (posts.length === 0) {
        var empty = document.getElementById('feed-empty');
        if (empty) empty.classList.remove('hidden');
      } else {
        container.innerHTML = posts.map(function (p, i) { return FeedPage.createPostElement(p, i); }).join('');
      }
    } catch (err) {
      App.showToast('Failed to load feed', 'error');
    } finally {
      this.loading = false;
      if (loader) loader.classList.add('hidden');
    }
  },

  createPostElement(post, index) {
    index = index || 0;
    var liked = post.liked > 0;
    var timeAgo = App.timeAgo(post.created_at);
    var initials = (post.display_name || post.username || '?').charAt(0).toUpperCase();
    var avatarContent = post.avatar
      ? '<img src="' + App.escapeHtml(post.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
      : initials;
    var isOwn = post.user_id === (App.currentUser ? App.currentUser.id : null);
    var deleteBtn = isOwn ? '<button class="btn btn-ghost btn-sm" onclick="FeedPage.deletePost(\'' + post.id + '\')" title="Delete post"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '';
    var fill = liked ? 'currentColor' : 'none';
    var likedClass = liked ? 'liked' : '';

    var imageHtml = '';
    if (post.image) {
      try {
        const media = JSON.parse(post.image);
        if (Array.isArray(media) && media.length > 0) {
          const count = media.length;
          const gridClass = count === 1 ? 'one-img' : count === 2 ? 'two-imgs' : count === 3 ? 'three-imgs' : 'four-plus-imgs';
          imageHtml = '<div class="post-gallery ' + gridClass + '">';

          media.slice(0, 4).forEach((item, i) => {
            const overlay = (i === 3 && count > 4) ? '<div class="gallery-overlay">+' + (count - 4) + '</div>' : '';
            const src = typeof item === 'string' ? item : item.url;
            const type = (typeof item === 'object' && item.type) || 'image';

            if (type === 'youtube') {
              imageHtml += '<div class="gallery-item youtube-embed">' +
                '<iframe src="https://www.youtube.com/embed/' + src + '" frameborder="0" allowfullscreen></iframe>' +
                '</div>';
            } else if (type === 'video') {
              imageHtml += '<div class="gallery-item">' +
                '<video src="' + App.escapeHtml(src) + '" controls style="width:100%;height:100%;object-fit:cover"></video>' +
                '</div>';
            } else {
              imageHtml += '<div class="gallery-item" onclick="window.open(\'' + App.escapeHtml(src) + '\')">' +
                '<img src="' + App.escapeHtml(src) + '" loading="lazy">' + overlay + '</div>';
            }
          });
          imageHtml += '</div>';
        } else if (typeof media === 'string') {
          imageHtml = '<div class="post-image"><img src="' + App.escapeHtml(media) + '" loading="lazy" onclick="window.open(this.src)"></div>';
        }
      } catch (e) {
        imageHtml = '<div class="post-image"><img src="' + App.escapeHtml(post.image) + '" loading="lazy" onclick="window.open(this.src)"></div>';
      }
    }

    return '<div class="post-card" style="animation-delay: ' + (index * 0.05) + 's" data-post-id="' + post.id + '">' +
      '<div class="post-header">' +
      '<div class="avatar" onclick="window.location.hash=\'#/profile/' + post.user_id + '\'" style="cursor:pointer">' + avatarContent + '</div>' +
      '<div class="post-user-info">' +
      '<span class="username" onclick="window.location.hash=\'#/profile/' + post.user_id + '\'">' + App.escapeHtml(post.display_name || post.username) + '</span> ' +
      App.renderRankBadge(post.donation_rank) +
      '<span class="badge badge-level">LVL ' + (post.level || 1) + '</span>' +
      '<div class="post-time">' + timeAgo + '</div>' +
      '</div>' + deleteBtn +
      '</div>' +
      '<div class="post-content">' + App.renderContent(post.content, true) + '</div>' +
      imageHtml +
      '<div class="post-actions">' +
      '<button class="post-action-btn ' + likedClass + '" onclick="FeedPage.toggleLike(\'' + post.id + '\', this)">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + fill + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
      '<span class="like-count">' + (post.like_count || 0) + '</span></button>' +
      '<button class="post-action-btn" onclick="FeedPage.toggleComments(\'' + post.id + '\')">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<span>' + (post.comment_count || 0) + '</span></button>' +
      '</div>' +
      '<div class="comments-section hidden" id="comments-' + post.id + '"></div>' +
      '</div>';
  },

  async toggleLike(postId, btn) {
    try {
      var result = await API.toggleLike(postId);
      var countEl = btn.querySelector('.like-count');
      var count = parseInt(countEl.textContent);
      if (result.liked) {
        btn.classList.add('liked');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
        countEl.textContent = count + 1;
        btn.style.transform = 'scale(1.2)';
        setTimeout(function () { btn.style.transform = ''; }, 200);
      } else {
        btn.classList.remove('liked');
        btn.querySelector('svg').setAttribute('fill', 'none');
        countEl.textContent = Math.max(0, count - 1);
      }
    } catch (err) {
      App.showToast('Failed to like post', 'error');
    }
  },

  async toggleComments(postId) {
    var section = document.getElementById('comments-' + postId);
    if (!section) return;
    if (!section.classList.contains('hidden')) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    section.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var comments = await API.getComments(postId);
      var html = comments.map(function (c) {
        var cInitials = (c.display_name || c.username || '?').charAt(0).toUpperCase();
        var cAvatar = c.avatar
          ? '<img src="' + App.escapeHtml(c.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
          : cInitials;
        return '<div class="comment"><div class="avatar">' + cAvatar + '</div>' +
          '<div class="comment-body"><span class="username">' + App.escapeHtml(c.display_name || c.username) + '</span>' +
          '<div class="content">' + App.renderContent(c.content, true) + '</div></div></div>';
      }).join('');
      html += '<div class="comment-input-wrapper">' +
        '<input type="text" class="comment-input input-field" placeholder="Write a comment..." id="comment-input-' + postId + '">' +
        '<button class="btn btn-primary btn-sm" onclick="FeedPage.addComment(\'' + postId + '\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>';
      section.innerHTML = html;
      var input = document.getElementById('comment-input-' + postId);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') FeedPage.addComment(postId);
      });
    } catch (err) {
      section.innerHTML = '<p style="color: var(--text-muted); padding: 8px;">Failed to load comments</p>';
    }
  },

  async addComment(postId) {
    var input = document.getElementById('comment-input-' + postId);
    if (!input) return;
    var content = input.value.trim();
    if (!content) return;
    try {
      await API.addComment(postId, content);
      input.value = '';
      this.toggleComments(postId);
      this.toggleComments(postId);
    } catch (err) {
      App.showToast('Failed to add comment', 'error');
    }
  },

  async deletePost(postId) {
    if (!confirm('Delete this post?')) return;
    try {
      await API.deletePost(postId);
      var el = document.querySelector('[data-post-id="' + postId + '"]');
      if (el) {
        el.style.transform = 'scale(0.95)';
        el.style.opacity = '0';
        setTimeout(function () { el.remove(); }, 300);
      }
      App.showToast('Post deleted', 'success');
    } catch (err) {
      App.showToast('Failed to delete post', 'error');
    }
  }
};
