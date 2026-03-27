# Design Document: Guest Mode

## Overview

Guest Mode allows unauthenticated visitors to browse the platform when an admin enables it. Without Guest Mode, the router unconditionally redirects any unauthenticated request to `/login`. With it enabled, guests can read public pages (feed, forum, profiles, donations) while write actions are replaced with contextual login prompts.

The feature touches four layers:

1. **Config** — a new `guestModeEnabled` boolean in `config.json`, exposed via `/api/settings`.
2. **Router / App bootstrap** — conditional routing logic and a new `App.isGuest()` helper.
3. **Frontend pages** — conditional rendering in feed, forum, profile, and donations pages.
4. **Backend** — a new unauthenticated `POST /api/ext/donations/guest-donate` endpoint; existing authenticated endpoints already return 401 when no token is present.

---

## Architecture

```mermaid
flowchart TD
    A[Browser loads SPA] --> B[App.applySettings\nfetches /api/settings]
    B --> C{guestModeEnabled?}
    C -- false --> D[Router: redirect unauthenticated\nrequests to /login]
    C -- true --> E[Router: allow public routes\nblock /admin /mod /chat]
    E --> F[Page renders]
    F --> G{App.isGuest?}
    G -- true --> H[Replace write controls\nwith login prompts]
    G -- false --> I[Normal authenticated UI]

    J[Admin saves settings] --> K[POST /api/admin/settings\nguestModeEnabled=true/false]
    K --> L[Config.set in config.json]
    L --> M[/api/settings reflects change\non next client boot]
```

The design is intentionally additive — no existing authenticated flows are changed. Guest-mode logic is gated behind `App.isGuest()` checks inserted into existing render functions.

---

## Components and Interfaces

### 1. Config (`server/config.js`)

Add `guestModeEnabled: false` to the `DEFAULTS` object and include it in `getPublicSettings()`.

```js
// DEFAULTS addition
guestModeEnabled: false,

// getPublicSettings() addition
guestModeEnabled: !!cfg.guestModeEnabled,
```

No other changes to Config are needed — `Config.set('guestModeEnabled', value)` and `Config.get('guestModeEnabled', false)` already work via the existing dot-path API.

---

### 2. Admin Settings Panel (`public/js/pages/admin.js`)

The existing `loadSettings()` method renders a "Community" section. A new toggle row is added there:

```html
<!-- inside the Community settings card -->
<label>Guest Mode</label>
<input type="checkbox" id="guestModeEnabled" ${s.community.guestModeEnabled ? 'checked' : ''}>
<p class="hint">Allow unauthenticated visitors to browse public pages.</p>
```

The existing `saveSection('community', [...])` call is extended to include `'guestModeEnabled'`.

The server-side `PUT /api/admin/settings` route (in `server/routes/`) already handles arbitrary key updates via `Config.update()`; no backend change is needed beyond adding the key to `DEFAULTS` and `getPublicSettings`.

---

### 3. `App.isGuest()` Helper (`public/js/app.js`)

```js
isGuest() {
    return !this.currentUser && !!(this.siteSettings && this.siteSettings.guestModeEnabled);
}
```

This is the single source of truth used by all pages and extensions. It is safe to call before `applySettings()` completes because `siteSettings` defaults to `undefined` and the `!!` coercion returns `false`.

---

### 4. Router (`public/js/router.js`)

The current auth guard in `navigate()`:

```js
if (!API.token && !isAuthPage) {
    window.location.hash = '#/login';
    return;
}
```

Is replaced with:

```js
const guestAllowed = App.siteSettings && App.siteSettings.guestModeEnabled;
const blockedForGuest = ['/admin', '/mod', '/chat'].includes('/' + segments[0]);

if (!API.token && !isAuthPage) {
    if (!guestAllowed || blockedForGuest) {
        window.location.hash = guestAllowed ? '#/feed' : '#/login';
        return;
    }
}
```

This preserves the existing redirect-to-login behavior when Guest Mode is off, and redirects guests away from privileged routes to `/feed` when it is on.

---

### 5. Navigation Bar (`public/index.html` / `App.onLogin`)

When `App.isGuest()` is true after `applySettings()`:

- The `#main-nav` sidebar is shown (so guests can navigate).
- Authenticated-only controls (`#logout-btn`, `#notification-badge`, `#friend-request-badge`, `#unread-badge`) are hidden.
- A "Login / Register" link is injected into the nav.

This is handled in a new `App.onGuestMode()` method called from `App.init()` when no token is present but guest mode is enabled.

```js
onGuestMode() {
    const nav = document.getElementById('main-nav');
    const page = document.getElementById('page-container');
    if (nav) nav.classList.remove('hidden');
    if (page) page.classList.remove('full-width');

    // Hide auth-only controls
    ['logout-btn', 'notification-badge', 'friend-request-badge', 'unread-badge']
        .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    // Inject login CTA
    const navContainer = document.getElementById('ext-nav-links');
    if (navContainer) {
        navContainer.insertAdjacentHTML('beforeend',
            '<a href="#/login" class="nav-link" id="guest-login-cta">🔑 <span>Login / Register</span></a>'
        );
    }
}
```

---

### 6. Feed Page (`public/js/pages/feed.js`)

In `FeedPage.render()`, the post-composer block is conditionally replaced:

```js
const composerHtml = App.isGuest()
    ? `<div class="card guest-prompt">
           You must be logged in to post.
           <a href="#/login" onclick="App.showAuthModal('login')">Log in</a>
       </div>`
    : `<div class="post-composer">...</div>`;
```

In `createPostElement()`, like buttons and comment inputs are hidden for guests:

- Like button: wrapped in `App.isGuest() ? '' : '<button ...>'`
- Comment input: replaced with the standard login prompt string.

---

### 7. Forum Page (`extensions/forum/public/pages/forum.js`)

In `renderCategory()`, the "+ New Thread" button is replaced:

```js
const newThreadBtn = App.isGuest()
    ? `<span class="guest-prompt">You must be logged in to create a thread.
           <a href="#/login" onclick="App.showAuthModal('login')">Log in</a></span>`
    : `<button class="btn btn-primary" onclick="ForumPage.showNewThreadModal()">+ New Thread</button>`;
```

In `renderThread()`, the Quick Reply composer is replaced:

```js
const replySection = App.isGuest()
    ? `<div class="card guest-prompt">
           You must be logged in to post a reply.
           <a href="#/login" onclick="App.showAuthModal('login')">Log in</a>
       </div>`
    : `<div class="card forum-composer">...</div>`;
```

---

### 8. Profile Page (`public/js/pages/profile.js`)

In `render()`, the `actionsHtml` block for non-own profiles is extended:

```js
} else {
    if (App.isGuest()) {
        actionsHtml = '<span class="guest-prompt">Login to Add Friend</span>';
        // Message button is omitted entirely
    } else {
        actionsHtml = this.renderFriendButton(profile) +
            ' <button ...>Message</button>';
    }
}
```

The "Edit Profile" button is already gated on `isOwnProfile`, which is `false` for guests (since `App.currentUser` is null), so no change is needed there.

---

### 9. Donations Page (`extensions/donations/public/pages/donations.js`)

`_renderPurchaseButton()` gains a guest branch:

```js
_renderPurchaseButton(rank, isCurrent) {
    if (isCurrent) return `<button class="donate-rank-btn current" disabled>Current Rank</button>`;
    if (App.isGuest()) {
        return `<button class="donate-rank-btn" disabled title="Login required">
                    You must be logged in to purchase a rank
                </button>`;
    }
    if (!App.currentUser) return `<button ... onclick="App.showAuthModal('login')">Login to Purchase</button>`;
    // ... existing convert / purchase logic
}
```

A new `renderGuestDonationForm()` method renders below the ranks grid when `App.isGuest()` is true:

```js
renderGuestDonationForm() {
    const mcEnabled = App.extensions && App.extensions.some(e => e.id === 'minecraft' && e.enabled);
    return `
        <div class="card guest-donate-form">
            <h3>One-Time Donation</h3>
            <div class="preset-amounts">
                <button onclick="DonationsPage.setAmount(5)">$5</button>
                <button onclick="DonationsPage.setAmount(10)">$10</button>
                <button onclick="DonationsPage.setAmount(25)">$25</button>
            </div>
            <input type="number" id="guest-amount" min="1" placeholder="Custom amount ($)">
            ${mcEnabled ? `<input type="text" id="guest-mc-username" placeholder="Minecraft username (optional)">` : ''}
            <button class="btn btn-primary" onclick="DonationsPage.submitGuestDonation()">Donate</button>
        </div>`;
}
```

`submitGuestDonation()` posts to `POST /api/ext/donations/guest-donate`.

---

### 10. Guest Donate Endpoint (`extensions/donations/server/routes.js`)

A new unauthenticated route is added inside the existing router factory:

```js
router.post('/guest-donate', async (req, res) => {
    const { amount, minecraft_username } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    await extDb.run(
        `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status, minecraft_username, created_at)
         VALUES (?, NULL, NULL, ?, 'usd', 'guest', 'pending', ?, ?)`,
        [id, amount, minecraft_username || null, now]
    );
    const stripe = getStripe();
    if (stripe) {
        const siteUrl = Config.get('siteUrl', 'http://localhost:3000');
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price_data: { currency: 'usd', product_data: { name: 'One-Time Donation' }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
            mode: 'payment',
            success_url: siteUrl + '/#/donate?status=success',
            cancel_url: siteUrl + '/#/donate?status=cancelled',
            metadata: { donation_id: id, minecraft_username: minecraft_username || '' }
        });
        await extDb.run('UPDATE donations SET stripe_session_id = ? WHERE id = ?', [session.id, id]);
        return res.json({ id, url: session.url });
    }
    res.json({ id, message: 'Donation recorded. Payment processing not configured.' });
});
```

---

### 11. `App.showAuthModal()` (`public/js/app.js`)

```js
showAuthModal(mode) {
    window.location.hash = '#/' + (mode || 'login');
}
```

This is a thin wrapper so extension pages can call `App.showAuthModal('login')` without knowing the routing internals. If a modal-based login is added later, only this one function needs updating.

---

## Data Models

### Config (`data/config.json`)

One new key added to the existing flat config object:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `guestModeEnabled` | `boolean` | `false` | Whether unauthenticated visitors may browse public pages |

### Donations Table (existing schema, no migration needed)

The `donations` table already has `user_id` (nullable), `payment_type` (text), `minecraft_username` (text), and `status` (text). Guest donations use:

| Column | Guest value |
|--------|-------------|
| `user_id` | `NULL` |
| `payment_type` | `'guest'` |
| `status` | `'pending'` |
| `rank_id` | `NULL` |
| `minecraft_username` | provided value or `NULL` |

The `/api/ext/donations/recent` endpoint already joins `users` for avatar lookup. For guest donations (`user_id IS NULL`), the join returns no user row; the avatar is derived from `minecraft_username` if present:

```js
d.avatar = user?.avatar || (d.minecraft_username
    ? `https://mc-heads.net/avatar/${d.minecraft_username}/64`
    : null);
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Config round-trip

*For any* boolean value written via `Config.set('guestModeEnabled', value)`, a subsequent `Config.get('guestModeEnabled', false)` should return that same value.

**Validates: Requirements 1.3**

---

### Property 2: Public settings always include guestModeEnabled

*For any* config state (including configs where the key is absent), `Config.getPublicSettings()` should include a `guestModeEnabled` field whose value equals the stored boolean, defaulting to `false` when absent.

**Validates: Requirements 1.4, 1.5**

---

### Property 3: isGuest reflects combined state

*For any* combination of `App.currentUser` (null or a user object) and `App.siteSettings.guestModeEnabled` (true or false), `App.isGuest()` should return `true` if and only if `currentUser` is `null` AND `guestModeEnabled` is `true`.

**Validates: Requirements 8.1**

---

### Property 4: Router blocks privileged routes for guests

*For any* guest session (no token, guest mode enabled), navigating to `/admin`, `/mod`, or `/chat` should result in a redirect to `/feed`, never rendering the privileged page.

**Validates: Requirements 2.2**

---

### Property 5: Router allows public routes for guests

*For any* guest session (no token, guest mode enabled) and any route that is not `/admin`, `/mod`, or `/chat`, the router should invoke the route handler rather than redirecting to `/login`.

**Validates: Requirements 2.1**

---

### Property 6: Router redirects to login when guest mode is off

*For any* unauthenticated request to any non-auth route when `guestModeEnabled` is `false`, the router should redirect to `/login`.

**Validates: Requirements 1.6, 2.5**

---

### Property 7: Guest donate rejects non-positive amounts

*For any* call to `POST /api/ext/donations/guest-donate` where `amount` is missing, zero, or negative, the endpoint should return HTTP 400.

**Validates: Requirements 7.3**

---

### Property 8: Guest donate stores correct metadata

*For any* valid guest donation request with a positive `amount` and optional `minecraft_username`, the stored donation record should have `user_id = NULL`, `payment_type = 'guest'`, `status = 'pending'`, and `minecraft_username` equal to the provided value (or `NULL` if omitted).

**Validates: Requirements 7.4, 7.5**

---

### Property 9: Recent donations avatar derivation

*For any* donation entry in the recent list, the returned `avatar` field should be: the user's profile avatar when `user_id` is non-null and the user has an avatar; the MC-Heads URL (`https://mc-heads.net/avatar/{username}/64`) when `user_id` is null and `minecraft_username` is non-null; and `null` in all other cases.

**Validates: Requirements 3.5, 3.6, 3.7**

---

### Property 10: Guest donate round trip

*For any* valid guest donation submission, the `id` returned in the response should correspond to a record retrievable from the `donations` table with matching `amount` and `minecraft_username`.

**Validates: Requirements 7.6**

---

### Property 11: Unauthenticated POST to protected endpoints returns 401

*For any* POST request to `/api/ext/forum/categories/:id/threads`, `/api/ext/forum/threads/:id/posts`, `/api/posts`, `/api/posts/:id/comments`, `/api/posts/:id/like`, or any authenticated profile-mutation endpoint, when no valid JWT token is present, the server should return HTTP 401.

**Validates: Requirements 4.5, 5.5, 6.5**

---

### Property 12: Forum write controls replaced for guests

*For any* forum page rendered when `App.isGuest()` is `true`, the rendered HTML should not contain the Quick Reply composer textarea or the "+ New Thread" button, and should instead contain a login prompt with the text "You must be logged in to".

**Validates: Requirements 4.3, 4.4**

---

### Property 13: Feed write controls replaced for guests

*For any* feed page rendered when `App.isGuest()` is `true`, the rendered HTML should not contain the post-composer textarea, comment input fields, or like buttons, and should instead contain login prompts with the text "You must be logged in to".

**Validates: Requirements 6.2, 6.3, 6.4**

---

### Property 14: Profile auth actions replaced for guests

*For any* profile page rendered for a non-own profile when `App.isGuest()` is `true`, the rendered HTML should not contain the "Message" button or friend-action buttons, and should instead contain a "Login to Add Friend" label.

**Validates: Requirements 5.2, 5.3**

---

### Property 15: Rank purchase buttons disabled for guests

*For any* donation rank rendered when `App.isGuest()` is `true`, the rendered purchase button should have the `disabled` attribute and should not trigger a checkout flow.

**Validates: Requirements 3.1**

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| `POST /api/ext/donations/guest-donate` — missing or invalid `amount` | HTTP 400 with `{ error: 'amount must be a positive number' }` |
| `POST /api/ext/donations/guest-donate` — Stripe not configured | HTTP 200 with `{ id, message: 'Donation recorded...' }` (no URL) |
| `POST /api/ext/donations/guest-donate` — Stripe error | HTTP 500 with `{ error: 'Payment error: ...' }` |
| Guest navigates to `/admin`, `/mod`, `/chat` | Client-side redirect to `#/feed` |
| Guest calls authenticated API endpoint | Server returns HTTP 401 (existing `authenticateToken` middleware) |
| `guestModeEnabled` absent from config | `Config.get` returns `false` (default) |
| `App.isGuest()` called before `applySettings()` completes | Returns `false` (safe default — `siteSettings` is undefined) |

---

## Testing Strategy

### Unit Tests

Unit tests focus on specific examples, integration points, and edge cases:

- `Config.getPublicSettings()` includes `guestModeEnabled: false` when key is absent (edge case for Property 2).
- `Config.getPublicSettings()` includes `guestModeEnabled: true` after `Config.set('guestModeEnabled', true)`.
- Admin settings panel renders a guestModeEnabled toggle in the Community section.
- `POST /api/ext/donations/guest-donate` with `amount: 10` and no Stripe config returns 200 with `id`.
- `POST /api/ext/donations/guest-donate` with Stripe configured returns a session URL.
- `App.showAuthModal('login')` sets `window.location.hash` to `#/login`.
- Guest donation form renders MC username field when Minecraft extension is enabled.
- Guest donation form omits MC username field when Minecraft extension is disabled.

### Property-Based Tests

Each property test runs a minimum of 100 iterations. The property-based testing library is **fast-check** (`npm install --save-dev fast-check`).

**Property 1 — Config round-trip**
```js
// Feature: guest-mode, Property 1: Config round-trip
fc.assert(fc.property(fc.boolean(), (value) => {
    Config.set('guestModeEnabled', value);
    return Config.get('guestModeEnabled', false) === value;
}));
```

**Property 2 — Public settings always include guestModeEnabled**
```js
// Feature: guest-mode, Property 2: Public settings always include guestModeEnabled
fc.assert(fc.property(fc.option(fc.boolean(), { nil: undefined }), (value) => {
    if (value !== undefined) Config.set('guestModeEnabled', value);
    const settings = Config.getPublicSettings();
    return 'guestModeEnabled' in settings && typeof settings.guestModeEnabled === 'boolean';
}));
```

**Property 3 — isGuest reflects combined state**
```js
// Feature: guest-mode, Property 3: isGuest reflects combined state
fc.assert(fc.property(
    fc.option(fc.record({ id: fc.string() }), { nil: null }),
    fc.boolean(),
    (user, enabled) => {
        App.currentUser = user;
        App.siteSettings = { guestModeEnabled: enabled };
        return App.isGuest() === (user === null && enabled === true);
    }
));
```

**Property 4 — Router blocks privileged routes for guests**
```js
// Feature: guest-mode, Property 4: Router blocks privileged routes for guests
fc.assert(fc.property(
    fc.constantFrom('/admin', '/mod', '/chat'),
    async (route) => {
        App.siteSettings = { guestModeEnabled: true };
        API.token = null;
        await Router.navigate('#' + route);
        return window.location.hash === '#/feed';
    }
));
```

**Property 5 — Router allows public routes for guests**
```js
// Feature: guest-mode, Property 5: Router allows public routes for guests
fc.assert(fc.property(
    fc.constantFrom('/feed', '/forum', '/donate', '/profile'),
    async (route) => {
        App.siteSettings = { guestModeEnabled: true };
        API.token = null;
        let handlerCalled = false;
        Router.register(route, () => { handlerCalled = true; });
        await Router.navigate('#' + route);
        return handlerCalled;
    }
));
```

**Property 6 — Router redirects to login when guest mode is off**
```js
// Feature: guest-mode, Property 6: Router redirects to login when guest mode is off
fc.assert(fc.property(
    fc.constantFrom('/feed', '/forum', '/donate', '/profile', '/admin'),
    async (route) => {
        App.siteSettings = { guestModeEnabled: false };
        API.token = null;
        await Router.navigate('#' + route);
        return window.location.hash === '#/login';
    }
));
```

**Property 7 — Guest donate rejects non-positive amounts**
```js
// Feature: guest-mode, Property 7: guest donate rejects non-positive amounts
fc.assert(fc.property(
    fc.oneof(fc.constant(0), fc.integer({ max: -1 }), fc.constant(null), fc.constant(undefined)),
    async (amount) => {
        const res = await request(app).post('/api/ext/donations/guest-donate').send({ amount });
        return res.status === 400;
    }
));
```

**Property 8 — Guest donate stores correct metadata**
```js
// Feature: guest-mode, Property 8: guest donate stores correct metadata
fc.assert(fc.property(
    fc.float({ min: 0.01, max: 10000 }),
    fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: null }),
    async (amount, mcUsername) => {
        const body = { amount };
        if (mcUsername) body.minecraft_username = mcUsername;
        const res = await request(app).post('/api/ext/donations/guest-donate').send(body);
        const row = await extDb.get('SELECT * FROM donations WHERE id = ?', [res.body.id]);
        return row.user_id === null
            && row.payment_type === 'guest'
            && row.status === 'pending'
            && row.minecraft_username === (mcUsername || null);
    }
));
```

**Property 9 — Recent donations avatar derivation**
```js
// Feature: guest-mode, Property 9: recent donations avatar derivation
fc.assert(fc.property(
    fc.record({
        user_id: fc.option(fc.uuid(), { nil: null }),
        user_avatar: fc.option(fc.webUrl(), { nil: null }),
        minecraft_username: fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: null })
    }),
    ({ user_id, user_avatar, minecraft_username }) => {
        const expected = user_id !== null
            ? (user_avatar || null)
            : (minecraft_username ? `https://mc-heads.net/avatar/${minecraft_username}/64` : null);
        return deriveAvatar(user_id, user_avatar, minecraft_username) === expected;
    }
));
```

**Property 10 — Guest donate round trip**
```js
// Feature: guest-mode, Property 10: guest donate round trip
fc.assert(fc.property(
    fc.float({ min: 0.01, max: 9999 }),
    fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: null }),
    async (amount, mcUsername) => {
        const body = { amount };
        if (mcUsername) body.minecraft_username = mcUsername;
        const res = await request(app).post('/api/ext/donations/guest-donate').send(body);
        const row = await extDb.get('SELECT * FROM donations WHERE id = ?', [res.body.id]);
        return row !== null && Math.abs(row.amount - amount) < 0.001;
    }
));
```

**Property 11 — Unauthenticated POST to protected endpoints returns 401**
```js
// Feature: guest-mode, Property 11: unauthenticated POST to protected endpoints returns 401
fc.assert(fc.property(
    fc.constantFrom(
        '/api/ext/forum/categories/test-id/threads',
        '/api/ext/forum/threads/test-id/posts',
        '/api/posts',
        '/api/posts/test-id/comments',
        '/api/posts/test-id/like'
    ),
    async (endpoint) => {
        const res = await request(app).post(endpoint).send({});
        return res.status === 401;
    }
));
```
