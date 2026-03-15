/* =======================================
   Venary — Auth Pages (Login / Register)
   ======================================= */
const AuthPage = {
  render(container, mode) {
    let formHtml = '';
    if (mode === 'register') formHtml = this.registerForm();
    else if (mode === 'forgot') formHtml = this.forgotForm();
    else if (mode === 'reset') formHtml = this.resetForm();
    else formHtml = this.loginForm();

    container.innerHTML = '<div class="auth-page"><div class="auth-container">' +
      '<div class="auth-logo">' +
      '<svg width="64" height="64" viewBox="0 0 64 64" fill="none">' +
      '<path d="M32 4L56 18V46L32 60L8 46V18L32 4Z" stroke="url(#auth-grad)" stroke-width="2.5" fill="none"/>' +
      '<path d="M32 12L48 21V43L32 52L16 43V21L32 12Z" fill="url(#auth-grad)" opacity="0.2"/>' +
      '<path d="M32 20L40 25V35L32 40L24 35V25L32 20Z" fill="url(#auth-grad)" opacity="0.5"/>' +
      '<defs><linearGradient id="auth-grad" x1="8" y1="4" x2="56" y2="60">' +
      '<stop stop-color="#00f0ff"/><stop offset="1" stop-color="#b026ff"/>' +
      '</linearGradient></defs>' +
      '</svg>' +
      '<h1>VENARY</h1>' +
      '<p>Next Generation Gaming Social Platform</p>' +
      '</div>' +
      '<div class="auth-card" id="auth-card">' +
      formHtml +
      '</div>' +
      '</div></div>';
    this.bindEvents(container, mode);
  },

  loginForm() {
    return '<h2>SIGN IN</h2>' +
      '<div id="auth-error" class="auth-error hidden"></div>' +
      '<form class="auth-form" id="login-form">' +
      '<div class="input-group">' +
      '<label for="login-username">Username or Email</label>' +
      '<input type="text" id="login-username" class="input-field" placeholder="Enter your username" required autocomplete="username">' +
      '</div>' +
      '<div class="input-group">' +
      '<label for="login-password">Password</label>' +
      '<input type="password" id="login-password" class="input-field" placeholder="Enter your password" required autocomplete="current-password">' +
      '<div style="text-align:right; margin-top:8px; font-size:0.85rem;"><a href="#/forgot-password">Forgot password?</a></div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-lg" id="login-btn">ENTER THE ARENA</button>' +
      '</form>' +
      '<div class="auth-toggle">New to Venary? <a href="#/register">Create Account</a></div>';
  },

  registerForm() {
    return '<h2>JOIN THE ARENA</h2>' +
      '<div id="auth-error" class="auth-error hidden"></div>' +
      '<form class="auth-form" id="register-form">' +
      '<div class="input-group">' +
      '<label for="reg-username">Username</label>' +
      '<input type="text" id="reg-username" class="input-field" placeholder="Choose your gamertag" required minlength="3" maxlength="20" autocomplete="username">' +
      '</div>' +
      '<div class="input-group">' +
      '<label for="reg-email">Email</label>' +
      '<input type="email" id="reg-email" class="input-field" placeholder="your@email.com" required autocomplete="email">' +
      '</div>' +
      '<div class="input-group">' +
      '<label for="reg-display">Display Name</label>' +
      '<input type="text" id="reg-display" class="input-field" placeholder="How others see you" autocomplete="name">' +
      '</div>' +
      '<div class="input-group">' +
      '<label for="reg-password">Password</label>' +
      '<input type="password" id="reg-password" class="input-field" placeholder="Min 6 characters" required minlength="6" autocomplete="new-password">' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-lg" id="register-btn">CREATE ACCOUNT</button>' +
      '</form>' +
      '<div class="auth-toggle">Already a warrior? <a href="#/login">Sign In</a></div>';
  },

  forgotForm() {
    return '<h2>RESET PASSWORD</h2>' +
      '<div id="auth-error" class="auth-error hidden"></div>' +
      '<div id="auth-success" class="auth-success hidden" style="color:var(--neon-green); margin-bottom:16px;"></div>' +
      '<form class="auth-form" id="forgot-form">' +
      '<div class="input-group">' +
      '<label for="forgot-email">Email</label>' +
      '<input type="email" id="forgot-email" class="input-field" placeholder="your@email.com" required autocomplete="email">' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-lg" id="forgot-btn">SEND RESET LINK</button>' +
      '</form>' +
      '<div class="auth-toggle"><a href="#/login">Back to Sign In</a></div>';
  },

  resetForm() {
    return '<h2>NEW PASSWORD</h2>' +
      '<div id="auth-error" class="auth-error hidden"></div>' +
      '<form class="auth-form" id="reset-form">' +
      '<div class="input-group">' +
      '<label for="reset-password">New Password</label>' +
      '<input type="password" id="reset-password" class="input-field" placeholder="Min 6 characters" required minlength="6" autocomplete="new-password">' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-lg" id="reset-btn">UPDATE PASSWORD</button>' +
      '</form>' +
      '<div class="auth-toggle"><a href="#/login">Back to Sign In</a></div>';
  },

  bindEvents(container, mode) {
    let formId = '#login-form';
    if (mode === 'register') formId = '#register-form';
    else if (mode === 'forgot') formId = '#forgot-form';
    else if (mode === 'reset') formId = '#reset-form';

    var form = container.querySelector(formId);
    if (!form) return;
    var errorEl = container.querySelector('#auth-error');
    var successEl = container.querySelector('#auth-success');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var originalText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> Processing...';
      btn.disabled = true;
      if (errorEl) errorEl.classList.add('hidden');
      if (successEl) successEl.classList.add('hidden');

      try {
        var result;
        if (mode === 'register') {
          result = await API.register({
            username: document.getElementById('reg-username').value,
            email: document.getElementById('reg-email').value,
            display_name: document.getElementById('reg-display').value || undefined,
            password: document.getElementById('reg-password').value,
          });
          API.setToken(result.token);
          App.currentUser = result.user;
          App.onLogin();
          window.location.hash = '#/feed';
        } else if (mode === 'login') {
          result = await API.login({
            username: document.getElementById('login-username').value,
            password: document.getElementById('login-password').value,
          });
          API.setToken(result.token);
          App.currentUser = result.user;
          App.onLogin();
          window.location.hash = '#/feed';
        } else if (mode === 'forgot') {
          result = await API.forgotPassword({
            email: document.getElementById('forgot-email').value,
          });
          if (successEl) {
            successEl.textContent = 'If the email exists, a password reset link has been sent.';
            successEl.classList.remove('hidden');
          }
        } else if (mode === 'reset') {
          const urlParams = new URL(window.location.href.replace('#', '?')).searchParams;
          const token = urlParams.get('token');
          const uid = urlParams.get('id');
          if (!token || !uid) throw new Error('Invalid reset link.');

          result = await API.resetPassword({
            id: uid,
            token: token,
            newPassword: document.getElementById('reset-password').value,
          });
          App.showToast('Password updated successfully. Please log in.', 'success');
          window.location.hash = '#/login';
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Something went wrong';
          errorEl.classList.remove('hidden');
        }
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });

    if (mode === 'reset') {
      const urlParams = new URL(window.location.href.replace('#', '?')).searchParams;
      const token = urlParams.get('token');
      const uid = urlParams.get('id');
      if (!token || !uid) {
        if (errorEl) {
          errorEl.textContent = 'Invalid or missing password reset link.';
          errorEl.classList.remove('hidden');
        }
        form.querySelector('button').disabled = true;
      }
    }
  }
};
