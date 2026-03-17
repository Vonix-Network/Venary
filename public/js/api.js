/* =======================================
   Venary — API Client
   ======================================= */
const API = {
    baseUrl: '',
    token: localStorage.getItem('venary_token'),

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('venary_token', token);
        } else {
            localStorage.removeItem('venary_token');
        }
    },

    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    },

    async request(method, endpoint, body = null) {
        const options = {
            method,
            headers: this.getHeaders(),
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }

        try {
            const res = await fetch(`${this.baseUrl}${endpoint}`, options);
            const data = await res.json();

            if (!res.ok) {
                throw { status: res.status, message: data.error || 'Request failed' };
            }

            return data;
        } catch (err) {
            if (err.status === 401 || err.status === 403) {
                this.setToken(null);
                var currentPath = window.location.hash.split('?')[0];
                if (currentPath !== '#/login' && currentPath !== '#/register' && currentPath !== '#/forgot-password' && currentPath !== '#/reset-password') {
                    window.location.hash = '#/login';
                }
            }
            throw err;
        }
    },

    get(endpoint) { return this.request('GET', endpoint); },
    post(endpoint, body) { return this.request('POST', endpoint, body); },
    put(endpoint, body) { return this.request('PUT', endpoint, body); },
    delete(endpoint) { return this.request('DELETE', endpoint); },

    // Auth
    register(data) { return this.post('/api/auth/register', data); },
    login(data) { return this.post('/api/auth/login', data); },
    getMe() { return this.get('/api/auth/me'); },
    forgotPassword(data) { return this.post('/api/auth/forgot-password', data); },
    resetPassword(data) { return this.post('/api/auth/reset-password', data); },

    // Users
    getUser(id) { return this.get(`/api/users/${id}`); },
    searchUsers(q) { return this.get(`/api/users/search?q=${encodeURIComponent(q)}`); },
    updateProfile(data) { return this.put('/api/users/profile', data); },

    // Friends
    getFriends() { return this.get('/api/friends'); },
    getFriendRequests() { return this.get('/api/friends/requests'); },
    sendFriendRequest(id) { return this.post(`/api/friends/request/${id}`); },
    acceptFriendRequest(id) { return this.post(`/api/friends/accept/${id}`); },
    removeFriend(id) { return this.delete(`/api/friends/${id}`); },

    // Messages
    getConversations() { return this.get('/api/messages/conversations'); },
    getMessages(userId) { return this.get(`/api/messages/${userId}`); },

    // Posts
    createPost(data) { return this.post('/api/posts', data); },
    getFeed(before) { return this.get(`/api/posts/feed${before ? `?before=${before}` : ''}`); },
    toggleLike(id) { return this.post(`/api/posts/${id}/like`); },
    toggleSubscribe(id) { return this.post(`/api/posts/${id}/subscribe`); },
    reportPost(id, reason) { return this.post(`/api/posts/${id}/report`, { reason }); },
    addComment(postId, content) { return this.post(`/api/posts/${postId}/comments`, { content }); },
    getComments(postId) { return this.get(`/api/posts/${postId}/comments`); },
    deleteComment(commentId) { return this.delete(`/api/posts/comments/${commentId}`); },
    reportComment(commentId, reason) { return this.post(`/api/posts/comments/${commentId}/report`, { reason }); },
    deletePost(id) { return this.delete(`/api/posts/${id}`); },
    updatePost(id, data) { return this.put(`/api/posts/${id}`, data); },

    // Admin
    getAdminStats() { return this.get('/api/admin/stats'); },
    getAdminUsers(page, filters = {}) {
        let qs = `page=${page || 1}`;
        if (filters.search) qs += `&search=${encodeURIComponent(filters.search)}`;
        if (filters.role) qs += `&role=${encodeURIComponent(filters.role)}`;
        if (filters.sort) qs += `&sort=${encodeURIComponent(filters.sort)}`;
        if (filters.order) qs += `&order=${encodeURIComponent(filters.order)}`;
        return this.get(`/api/admin/users?${qs}`);
    },
    getAdminReports() { return this.get('/api/admin/reports'); },
    banUser(id, reason) { return this.post(`/api/admin/users/${id}/ban`, { reason }); },
    unbanUser(id) { return this.post(`/api/admin/users/${id}/unban`); },
    deleteAdminUser(id) { return this.delete(`/api/admin/users/${id}`); },
    resolveReport(id, note) { return this.post(`/api/admin/reports/${id}/resolve`, { note }); },
    promoteUser(id, role) { return this.post(`/api/admin/users/${id}/role`, { role }); },
};
