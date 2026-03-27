# Requirements Document

## Introduction

Guest Mode allows unauthenticated visitors to browse the website without logging in. When enabled by an admin, the site becomes publicly accessible — but write actions (posting, purchasing, friending, etc.) are replaced with contextual prompts to log in. Guest-aware behavior must be applied consistently across all core pages and enabled extensions (donations, forum, images, minecraft).

The feature is toggled from the Admin Dashboard Settings panel and stored in the existing `config.json` via the `Config` module. The client-side router and `App` bootstrap must respect the setting so that unauthenticated users are routed to the feed (or any public page) rather than always being redirected to `/login`.

---

## Glossary

- **Guest**: An unauthenticated visitor — a browser session with no valid JWT token.
- **Guest Mode**: A site-wide setting that, when enabled, permits Guests to access public pages.
- **Guest_Mode_Setting**: The boolean configuration value `guestModeEnabled` stored in `config.json` and exposed via `/api/settings`.
- **Router**: The client-side SPA router defined in `public/js/router.js`.
- **App**: The main application bootstrap object in `public/js/app.js`.
- **Admin_Dashboard**: The admin panel rendered by `public/js/pages/admin.js`, Settings tab.
- **Config**: The server-side configuration manager in `server/config.js`.
- **Auth_Middleware**: `server/middleware/auth.js` — provides `authenticateToken` and `optionalAuth`.
- **Donations_Page**: The frontend page at `extensions/donations/public/pages/donations.js`.
- **Forum_Page**: The frontend page at `extensions/forum/public/pages/forum.js`.
- **Profile_Page**: The frontend page at `public/js/pages/profile.js`.
- **MC_Heads**: The external avatar service at `https://mc-heads.net/avatar/{username}/64` used for Minecraft player avatars.
- **Guest_Donation**: A one-time donation submitted by a Guest (no rank purchase), optionally including a Minecraft username.

---

## Requirements

### Requirement 1: Admin Control — Enable / Disable Guest Mode

**User Story:** As an admin, I want to toggle Guest Mode on or off from the Admin Dashboard Settings panel, so that I can control whether unauthenticated visitors can access the site.

#### Acceptance Criteria

1. THE Admin_Dashboard Settings panel SHALL include a "Guest Mode" toggle (boolean on/off control) within the Community section.
2. WHEN an admin saves the Community settings section with Guest Mode toggled, THE Admin_Dashboard SHALL send the updated `guestModeEnabled` value to `POST /api/admin/settings`.
3. THE Config SHALL persist `guestModeEnabled` as a boolean in `config.json` alongside existing settings.
4. THE Config SHALL default `guestModeEnabled` to `false` when the key is absent from `config.json`.
5. THE `/api/settings` public endpoint SHALL include `guestModeEnabled` in its response so the client can read it on boot.
6. WHEN `guestModeEnabled` is `false`, THE Router SHALL redirect unauthenticated requests for non-auth pages to `/login`, preserving existing behavior.

---

### Requirement 2: Client-Side Routing for Guests

**User Story:** As a Guest, when Guest Mode is enabled, I want to be able to navigate to public pages without being forced to the login screen, so that I can browse the site freely.

#### Acceptance Criteria

1. WHEN `guestModeEnabled` is `true` and no JWT token is present, THE Router SHALL permit navigation to all non-admin, non-chat, non-mod pages without redirecting to `/login`.
2. WHEN `guestModeEnabled` is `true` and a Guest navigates to `/admin`, `/mod`, or `/chat`, THE Router SHALL redirect the Guest to `/feed`.
3. WHEN `guestModeEnabled` is `true`, THE App SHALL hide the navigation sidebar's authenticated-only controls (logout button, notification bell, friend-request badge, unread-message badge) for Guests.
4. WHEN `guestModeEnabled` is `true`, THE App SHALL display a persistent "Login / Register" call-to-action link in the navigation bar for Guests.
5. WHEN `guestModeEnabled` is `false` and no JWT token is present, THE Router SHALL redirect all non-auth routes to `/login` (unchanged behavior).

---

### Requirement 3: Donations Page — Guest Behavior

**User Story:** As a Guest, when Guest Mode is enabled, I want to see donation ranks and make a one-time donation without needing an account, so that I can support the community without registering.

#### Acceptance Criteria

1. WHEN a Guest views the Donations_Page and Guest Mode is enabled, THE Donations_Page SHALL display all available ranks with purchase buttons labeled "You must be logged in to purchase a rank" that are disabled (non-clickable).
2. WHEN a Guest views the Donations_Page and Guest Mode is enabled, THE Donations_Page SHALL display a "One-Time Donation" section below the ranks, containing an amount selector with preset values and a custom amount input field.
3. WHEN the Minecraft extension is enabled and a Guest is submitting a one-time donation, THE Donations_Page SHALL display an optional Minecraft username input field within the one-time donation form.
4. WHEN a Guest submits a one-time donation with a Minecraft username, THE Donations_Page SHALL send the username to the server alongside the donation amount.
5. WHEN a Guest's one-time donation is recorded and a Minecraft username was provided, THE `/api/ext/donations/recent` endpoint SHALL return the MC_Heads avatar URL (`https://mc-heads.net/avatar/{username}/64`) as the `avatar` field for that donation entry.
6. WHEN a Guest's one-time donation is recorded and no Minecraft username was provided, THE `/api/ext/donations/recent` endpoint SHALL return `null` as the `avatar` field for that donation entry.
7. WHEN a logged-in user's donation is displayed in the recent donations list, THE `/api/ext/donations/recent` endpoint SHALL return the user's profile avatar if set, or `null` if not set.

---

### Requirement 4: Forum — Guest Behavior

**User Story:** As a Guest, when Guest Mode is enabled, I want to read forum threads and categories, so that I can follow community discussions without an account.

#### Acceptance Criteria

1. WHEN a Guest views the Forum_Page categories or thread list and Guest Mode is enabled, THE Forum_Page SHALL render the full category and thread listing without modification.
2. WHEN a Guest views a forum thread and Guest Mode is enabled, THE Forum_Page SHALL render all existing posts in the thread.
3. WHEN a Guest views a forum thread and Guest Mode is enabled, THE Forum_Page SHALL replace the "Quick Reply" composer textarea and submit button with a notice reading "You must be logged in to post a reply" and a login link.
4. WHEN a Guest views a forum category and Guest Mode is enabled, THE Forum_Page SHALL replace the "+ New Thread" button with a notice reading "You must be logged in to create a thread" and a login link.
5. IF a Guest attempts to call `POST /api/ext/forum/categories/:id/threads` or `POST /api/ext/forum/threads/:id/posts` without a valid token, THEN THE Forum routes SHALL return HTTP 401 with an error message.

---

### Requirement 5: Profile Page — Guest Behavior

**User Story:** As a Guest, when Guest Mode is enabled, I want to view user profiles, so that I can learn about community members without an account.

#### Acceptance Criteria

1. WHEN a Guest views a Profile_Page and Guest Mode is enabled, THE Profile_Page SHALL render the full profile including avatar, bio, stats, and posts.
2. WHEN a Guest views another user's Profile_Page and Guest Mode is enabled, THE Profile_Page SHALL display a "Login to Add Friend" label in place of the "Send Friend Request" / friend action buttons.
3. WHEN a Guest views another user's Profile_Page and Guest Mode is enabled, THE Profile_Page SHALL hide the "Message" button (which requires authentication).
4. WHEN a Guest views a Profile_Page and Guest Mode is enabled, THE Profile_Page SHALL hide the "Edit Profile" button (own-profile editing requires authentication).
5. IF a Guest attempts to call any authenticated profile-mutation endpoint (friend request, profile update) without a valid token, THEN THE server SHALL return HTTP 401.

---

### Requirement 6: Feed Page — Guest Behavior

**User Story:** As a Guest, when Guest Mode is enabled, I want to read the community feed, so that I can see what members are sharing.

#### Acceptance Criteria

1. WHEN a Guest views the feed and Guest Mode is enabled, THE Feed_Page SHALL render all public posts.
2. WHEN a Guest views the feed and Guest Mode is enabled, THE Feed_Page SHALL replace the post-composer (new post input area) with a notice reading "You must be logged in to post" and a login link.
3. WHEN a Guest views a post and Guest Mode is enabled, THE Feed_Page SHALL replace comment input fields with a notice reading "You must be logged in to comment" and a login link.
4. WHEN a Guest views a post and Guest Mode is enabled, THE Feed_Page SHALL hide like/reaction buttons.
5. IF a Guest attempts to call `POST /api/posts`, `POST /api/posts/:id/comments`, or `POST /api/posts/:id/like` without a valid token, THEN THE server SHALL return HTTP 401.

---

### Requirement 7: Guest One-Time Donation — Server Endpoint

**User Story:** As a developer, I want a server endpoint that accepts guest one-time donations, so that unauthenticated visitors can contribute without an account.

#### Acceptance Criteria

1. THE Donations extension SHALL expose a `POST /api/ext/donations/guest-donate` endpoint that does not require authentication.
2. WHEN a valid request is received at `POST /api/ext/donations/guest-donate`, THE endpoint SHALL accept `amount` (positive number) and optional `minecraft_username` (string) in the request body.
3. IF `amount` is missing or not a positive number, THEN THE endpoint SHALL return HTTP 400 with a descriptive error message.
4. WHEN a guest donation is stored, THE endpoint SHALL record `user_id` as `NULL`, `payment_type` as `'guest'`, and `status` as `'pending'` in the `donations` table.
5. WHEN a guest donation is stored with a `minecraft_username`, THE endpoint SHALL persist the username in the `minecraft_username` column of the `donations` table.
6. WHEN a guest donation is stored, THE endpoint SHALL return the created donation record including its `id`.
7. WHERE Stripe is configured, THE `POST /api/ext/donations/guest-donate` endpoint SHALL create a Stripe Checkout session for the specified amount and return the session URL for client-side redirect.
8. WHERE Stripe is not configured, THE `POST /api/ext/donations/guest-donate` endpoint SHALL record the donation with `status = 'pending'` and return a success acknowledgement without a payment URL.

---

### Requirement 8: Consistent Guest-Awareness Across Extensions

**User Story:** As a developer, I want all extension pages to check guest status consistently, so that no authenticated-only action is accidentally exposed to guests.

#### Acceptance Criteria

1. THE App SHALL expose a boolean helper `App.isGuest()` that returns `true` when `App.currentUser` is `null` and `App.siteSettings.guestModeEnabled` is `true`.
2. WHEN any extension page renders interactive controls that require authentication, THE extension page SHALL call `App.isGuest()` to determine whether to render the action or a login prompt.
3. THE login prompt rendered by extension pages SHALL be consistent in wording: "You must be logged in to [action]" with a clickable link that calls `App.showAuthModal('login')`.
4. WHEN `App.showAuthModal('login')` is called, THE App SHALL navigate to `#/login` (existing behavior is sufficient; no modal is required if the route redirect handles it).
