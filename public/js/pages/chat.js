/* =======================================
   Venary — Chat Page
   ======================================= */
const ChatPage = {
  activeChat: null,
  typingTimeout: null,

  async render(container, params) {
    var targetUserId = (params && params[0]) || null;
    container.innerHTML = '<div class="chat-page">' +
      '<div class="conversation-list animate-fade-up">' +
      '<div class="conversation-list-header"><h2>💬 Messages</h2></div>' +
      '<div class="conversation-items" id="conversation-items"><div class="loading-spinner"></div></div>' +
      '</div>' +
      '<div class="chat-window" id="chat-window">' +
      '<div class="empty-state" style="flex:1">' +
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<h3>Select a conversation</h3><p>Choose a friend to start chatting</p>' +
      '</div>' +
      '</div>' +
      '</div>';

    this.setupSocketListeners();
    await this.loadConversations();
    if (targetUserId) this.openChat(targetUserId);
  },

  setupSocketListeners() {
    SocketClient.off('new_message', this._onNewMessage);
    SocketClient.off('user_typing', this._onTyping);
    var self = this;
    this._onNewMessage = function (msg) {
      if (self.activeChat && (msg.sender_id === self.activeChat || msg.receiver_id === self.activeChat)) {
        self.appendMessage(msg);
        if (msg.sender_id === self.activeChat) SocketClient.markRead(msg.sender_id);
      }
      self.loadConversations();
    };
    this._onTyping = function (data) {
      if (self.activeChat === data.user_id) {
        var indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.textContent = data.is_typing ? data.username + ' is typing...' : '';
      }
    };
    SocketClient.on('new_message', this._onNewMessage);
    SocketClient.on('user_typing', this._onTyping);
  },

  async loadConversations() {
    try {
      var conversations = await API.getConversations();
      var container = document.getElementById('conversation-items');
      if (!container) return;
      if (conversations.length === 0) {
        container.innerHTML = '<div style="padding:var(--space-lg);text-align:center;color:var(--text-muted);font-size:0.85rem">No conversations yet.<br>Message a friend to start!</div>';
        return;
      }
      var self = this;
      container.innerHTML = conversations.map(function (c) {
        var initials = (c.display_name || c.username || '?').charAt(0).toUpperCase();
        var isActive = self.activeChat === c.id;
        var avatarContent = c.avatar
          ? '<img src="' + App.escapeHtml(c.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
          : initials;
        return '<div class="conversation-item ' + (isActive ? 'active' : '') + '" onclick="ChatPage.openChat(\'' + c.id + '\')" data-user-id="' + c.id + '">' +
          '<div class="avatar" style="position:relative;width:42px;height:42px;font-size:0.9rem;flex-shrink:0">' + avatarContent + '<span class="status-dot ' + (c.status || 'offline') + '"></span></div>' +
          '<div class="conversation-preview">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">' +
          '<h4 style="font-size:0.9rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.escapeHtml(c.display_name || c.username) + '</h4>' +
          '<span class="conversation-time">' + (c.last_message_time ? App.timeAgo(c.last_message_time) : '') + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
          '<p class="last-message" style="flex:1">' + App.escapeHtml(c.last_message || '') + '</p>' +
          (c.unread_count > 0 ? '<span class="unread-dot"></span>' : '') +
          '</div>' +
          '</div>' +
          '</div>';
      }).join('');
    } catch (err) { console.error('Load conversations error:', err); }
  },

  async openChat(userId) {
    this.activeChat = userId;
    document.querySelectorAll('.conversation-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.userId === userId);
    });

    // Mobile: slide to chat view
    var chatPage = document.querySelector('.chat-page');
    if (chatPage) chatPage.classList.add('chat-open');

    var chatWindow = document.getElementById('chat-window');
    chatWindow.innerHTML = '<div class="loading-spinner" style="flex:1"></div>';

    try {
      var results = await Promise.all([API.getMessages(userId), API.getUser(userId)]);
      var messages = results[0];
      var user = results[1];
      var initials = (user.display_name || user.username || '?').charAt(0).toUpperCase();
      var avatarContent = user.avatar
        ? '<img src="' + App.escapeHtml(user.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
        : initials;

      var messagesHtml = '';
      if (messages.length === 0) {
        messagesHtml = '<div class="empty-state" style="flex:1;padding:var(--space-xl)"><p style="color:var(--text-muted)">Start of your conversation with ' + App.escapeHtml(user.display_name || user.username) + '</p></div>';
      } else {
        messagesHtml = messages.map(function (m) { return ChatPage.renderMessage(m); }).join('');
      }

      chatWindow.innerHTML =
        '<div class="chat-header">' +
        '  <button class="chat-back-btn" onclick="ChatPage.closeChat()" title="Back">' +
        '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>' +
        '  </button>' +
        '  <div class="avatar" style="width:36px;height:36px;font-size:0.8rem;cursor:pointer;flex-shrink:0" onclick="window.location.hash=\'#/profile/' + userId + '\'">' + avatarContent + '</div>' +
        '  <div class="chat-header-info" style="flex:1;min-width:0">' +
        '    <h3 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.escapeHtml(user.display_name || user.username) + '</h3>' +
        '    <span id="typing-indicator" class="typing-indicator"></span>' +
        '  </div>' +
        '  <span class="badge badge-' + (user.status === 'online' ? 'online' : 'offline') + '" style="flex-shrink:0">' + (user.status || 'offline') + '</span>' +
        '</div>' +
        '<div class="chat-messages" id="chat-messages">' + messagesHtml + '</div>' +
        '<div class="chat-input-area">' +
        '  <textarea class="chat-input" id="chat-input" placeholder="Message..." rows="1"></textarea>' +
        '  <button class="chat-send-btn" id="chat-send-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>' +
        '</div>';

      var messagesEl = document.getElementById('chat-messages');
      messagesEl.scrollTop = messagesEl.scrollHeight;
      SocketClient.markRead(userId);

      var input = document.getElementById('chat-input');
      var sendBtn = document.getElementById('chat-send-btn');
      var self = this;

      sendBtn.addEventListener('click', function () { self.sendMessage(userId, input); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendMessage(userId, input); }
      });
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        SocketClient.sendTyping(userId, true);
        clearTimeout(self.typingTimeout);
        self.typingTimeout = setTimeout(function () { SocketClient.sendTyping(userId, false); }, 2000);
      });
      input.focus();
    } catch (err) {
      chatWindow.innerHTML = '<div class="empty-state" style="flex:1"><h3>Could not load chat</h3><p>' + (err.message || '') + '</p></div>';
    }
  },

  closeChat() {
    // Mobile: slide back to conversation list
    var chatPage = document.querySelector('.chat-page');
    if (chatPage) chatPage.classList.remove('chat-open');
    this.activeChat = null;
    document.querySelectorAll('.conversation-item').forEach(function (item) {
      item.classList.remove('active');
    });
  },

  renderMessage(msg) {
    var isSent = msg.sender_id === (App.currentUser ? App.currentUser.id : null);
    var time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return '<div class="message-bubble ' + (isSent ? 'sent' : 'received') + '">' +
      '<div class="message-text">' + App.escapeHtml(msg.content) + '</div>' +
      '<div class="message-time">' + time + '</div></div>';
  },

  appendMessage(msg) {
    var container = document.getElementById('chat-messages');
    if (!container) return;
    var emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    container.insertAdjacentHTML('beforeend', this.renderMessage(msg));
    container.scrollTop = container.scrollHeight;
  },

  sendMessage(userId, input) {
    var content = input.value.trim();
    if (!content) return;
    SocketClient.sendMessage(userId, content);
    this.appendMessage({ sender_id: App.currentUser.id, content: content, created_at: new Date().toISOString() });
    input.value = '';
    input.style.height = 'auto';
    SocketClient.sendTyping(userId, false);
  }
};
