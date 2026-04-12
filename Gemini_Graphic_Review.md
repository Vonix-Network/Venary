# Gemini Graphic Review — Messenger UI Rebuild Directive

You are tasked with a full visual and structural review of the Venary Messenger extension.
Rebuild, redesign, or polish **any portion of the UI you judge to be suboptimal**.
Your authority is total — replace entire sections if needed. The goal is a polished,
production-quality Discord/Fluxer-level experience on both desktop and mobile.

---

## Codebase Locations

| Asset | Path |
|---|---|
| Main page JS | `extensions/messenger/public/pages/messenger.js` |
| Stylesheet | `extensions/messenger/public/css/messenger.css` |
| Manifest | `extensions/messenger/manifest.json` |
| Socket server | `extensions/messenger/server/socket.js` |
| Route factory | `extensions/messenger/server/routes.js` |
| Sub-routes | `extensions/messenger/server/routes/*.js` |
| DB schema | `extensions/messenger/server/schema.sql` |

Global declaration: `var MessengerPage = { ... }` (must stay `var`, not `const`/`let`)

---

## Full Element Inventory — Review Every Item

### Panel 1 — Space Strip (72px left column)
- `.msn-space-list` — vertical icon strip
- `.msn-space-icon` — individual space button (48×48, pill on hover/active)
- `.msn-space-icon img` — space avatar image
- `.msn-unread-badge` — red dot badge on space icon
- `.msn-space-separator` — thin horizontal rule between DM and spaces
- `.msn-dm-btn` — Home/DM button at top of strip
- `.msn-add-space-btn` — green + button to create a space

### Panel 2 — Channel Sidebar (240px)
- `.msn-channel-sidebar` — the whole panel
- `.msn-sidebar-header` — top area (space name + description, or "Direct Messages")
- `.msn-sidebar-header h2` — title text
- `.msn-sidebar-header p` — subtitle/description
- `.msn-channel-scroll` — scrollable body of sidebar
- `.msn-category` — category group wrapper
- `.msn-category-header` — collapsible row with caret and + button
- `.msn-category-header .msn-caret` — collapse arrow
- `.msn-category-header .msn-add-channel-btn` — hover-reveal add channel button
- `.msn-channel-item` — individual channel row (text, voice, etc.)
- `.msn-channel-item.active` — selected state
- `.msn-channel-item.has-unread` — bold unread state
- `.msn-channel-icon` — # or 🔊 prefix icon
- `.msn-channel-name` — channel label
- `.msn-channel-unread` — red pill badge
- `.msn-dm-item` — DM conversation row
- `.msn-dm-item.active` — selected DM
- `.msn-dm-avatar` — 32×32 circle avatar with status dot
- `.msn-dm-status-dot` — online/offline/idle/dnd dot
- `.msn-sidebar-footer` — bottom user info bar
- `.msn-user-tag` — username + discriminator stack
- `.msn-footer-btn` — settings/mute/deafen icon buttons
- `.msn-search-input` — search/filter input used throughout sidebar
- `.msn-sidebar-empty` — empty state message
- `.msn-friends-section` — friends list section at bottom of DM sidebar
- `.msn-friends-section-label` — collapsible header with online count
- `.msn-friend-item` — individual friend row
- `.msn-friend-name` — friend display name
- `.msn-friend-msg-btn` — hover-reveal message button

### Panel 3 — Message Area (flex fill)
- `.msn-message-area` — main content column
- `.msn-channel-header` — 48px top bar
- `.msn-channel-header .msn-ch-icon` — channel type icon
- `.msn-channel-header .msn-ch-name` — channel name in header
- `.msn-channel-header .msn-ch-topic` — channel topic (truncated)
- `.msn-header-actions` — right-side header icon buttons
- `.msn-header-btn` — individual header action button
- `.msn-messages` — scrollable message list
- `.msn-empty-channel` — welcome/empty state for new channels
- `.msn-empty-channel .msn-ch-welcome-icon` — large icon
- `.msn-date-divider` — date separator line with centered label
- `.msn-load-more-btn` — "Load earlier messages" button
- `.msn-msg-group` — message group (avatar + body)
- `.msn-msg-group.msn-msg-new-author` — first message in a group (extra top padding)
- `.msn-msg-avatar` — 40×40 author avatar (clickable → popout)
- `.msn-msg-avatar-spacer` — 40px blank when continuing same author
- `.msn-msg-body` — text content wrapper
- `.msn-msg-header` — author name + timestamp row
- `.msn-msg-author` — bold author name (clickable)
- `.msn-msg-timestamp` — small muted time
- `.msn-msg-content` — message body text
- `.msn-msg-content.msn-msg-deleted` — italic deleted placeholder
- `.msn-msg-edited` — "(edited)" suffix
- `.msn-msg-reply` — reply reference bar above message
- `.msn-msg-reply .msn-reply-author` — name in reply bar
- `.msn-msg-reactions` — reaction pill row
- `.msn-reaction` — individual reaction pill
- `.msn-reaction.msn-reacted` — highlighted when current user reacted
- `.msn-reaction-count` — count label in pill
- `.msn-msg-actions` — hover action bar (react, reply, pin, edit, delete)
- `.msn-msg-action-btn` — individual action button
- `.msn-msg-action-btn.danger` — red hover for delete
- `.msn-msg-system` — italic system/join message
- `.msn-badge-bot` — inline BOT tag on webhook messages

### Markdown Elements (rendered inside `.msn-msg-content`)
- `.msn-code-block` — fenced code block with `<pre><code>`
- `.msn-inline-code` — backtick inline code
- `.msn-blockquote` — `> quote` line with left accent bar
- `.msn-spoiler` — hidden spoiler (click to reveal)
- `.msn-spoiler.revealed` — revealed spoiler state

### Attachments
- `.msn-attachment-img` — image attachment wrapper
- `.msn-attachment-img img` — image (clickable → lightbox)
- `.msn-attachment-file` — non-image file attachment row
- `.msn-attachment-file a` — filename link
- `.msn-attachment-file-size` — file size label

### Input Area
- `.msn-input-area` — outer padding wrapper
- `.msn-reply-preview` — reply context bar (above input, hidden by default)
- `.msn-reply-cancel` — × button to cancel reply
- `.msn-input-box` — inner flex container
- `.msn-input-attach` — paperclip attachment button
- `.msn-chat-input` — auto-growing textarea
- `.msn-input-emoji` — emoji trigger button
- `.msn-send-btn` — send button (disabled when empty)
- `.msn-typing-indicator` — "X is typing…" line below input box

### Panel 4 — Member List (240px right column)
- `.msn-member-list` — panel wrapper (hidden on ≤900px)
- `.msn-member-list.hidden` — explicitly hidden state
- `.msn-member-role-header` — role group header
- `.msn-member-item` — individual member row
- `.msn-member-avatar` — 32×32 avatar with status dot
- `.msn-member-status-dot` — online/offline indicator
- `.msn-member-info` — name + status text stack
- `.msn-member-name` — display name
- `.msn-member-name.offline` — muted when offline
- `.msn-member-sub` — subtitle (role or status text)

### Modals & Overlays
- `.msn-modal-overlay` — full-screen dark backdrop
- `.msn-modal` — generic modal card
- `.msn-modal h2`, `.msn-modal p` — modal headings
- `.msn-modal label`, `.msn-modal input`, `.msn-modal textarea`, `.msn-modal select` — form fields
- `.msn-modal-actions` — button row at bottom of modal
- `.msn-btn` — base button
- `.msn-btn-primary` — accent-coloured CTA
- `.msn-btn-secondary` — ghost/text button
- `.msn-btn-danger` — red destructive button

### Space Settings Modal (two-column)
- `.msn-settings-modal` — wide flex container
- `.msn-settings-sidebar` — left nav column
- `.msn-settings-sidebar h3` — section label in sidebar
- `.msn-settings-tab` — sidebar nav button
- `.msn-settings-tab.active` — selected tab
- `.msn-settings-pane` — right content area
- `.msn-settings-pane.hidden` — non-active pane
- `.msn-settings-close` — × close button (top-right)
- `.msn-role-row` — role list item
- `.msn-role-row .msn-role-dot` — coloured role circle
- `.msn-invite-row` — invite list item
- `.msn-member-settings-row` — member management list item

### Browse Spaces
- `.msn-browse-card` — space discovery card
- `.msn-browse-icon` — 56×56 space icon with rounded corners
- `.msn-browse-info` — text block (name + description + member count)
- `.msn-browse-name` — space name
- `.msn-browse-desc` — truncated description
- `.msn-browse-meta` — member count / category

### User Popout
- `.msn-user-popout` — floating profile card
- `.msn-popout-banner` — gradient top banner
- `.msn-popout-avatar` — avatar overlapping banner
- `.msn-popout-initials` — fallback initials in avatar
- `.msn-popout-body` — name, tag, bio, action buttons
- `.msn-popout-name`, `.msn-popout-tag`, `.msn-popout-bio`, `.msn-popout-actions`

### Emoji Picker
- `.msn-emoji-picker` — full picker (fixed positioned)
- `.msn-emoji-tabs` — category tab row
- `.msn-emoji-tab` — individual tab button
- `.msn-emoji-tab.active` — selected tab
- `.msn-emoji-body` — scrollable grid area
- `.msn-emoji-category` — grouped emoji section
- `.msn-emoji-category.hidden` — non-active category
- `.msn-emoji-category-label` — section title
- `.msn-emoji-grid` — 8-column emoji grid
- `.msn-emoji-btn` — individual emoji button
- `.msn-emoji-picker-mini` — compact 16-emoji quick reaction picker

### Context Menu
- `.msn-ctx-menu` — right-click context menu
- `.msn-ctx-item` — menu item
- `.msn-ctx-item.danger` — red destructive item
- `.msn-ctx-separator` — divider line

### Pinned Messages
- `.msn-pinned-item` — pinned message card
- `.msn-pinned-avatar` — 32×32 author avatar
- `.msn-pinned-body`, `.msn-pinned-meta`, `.msn-pinned-content`

### Miscellaneous
- `.msn-invite-code` — invite code display with copy button
- `.msn-user-result` — user search result row (New DM modal)
- `.msn-welcome` — full-panel welcome/empty state
- `.msn-toast` — bottom-center toast notification
- `.msn-toast.show` — visible state
- `.msn-lightbox` — full-screen image viewer overlay
- `.msn-lightbox img` — the zoomed image

---

## Mobile Requirements — Non-Negotiable

The messenger must be fully usable on mobile (≤640px). Implement all of the following:

### Layout Adaptation
- At ≤640px: hide `.msn-channel-sidebar` by default; show via a hamburger/back button
- At ≤640px: hide `.msn-member-list` entirely
- At ≤900px: hide `.msn-member-list`
- Space strip narrows to 48px on mobile; icons shrink to 36×36
- When a channel is open on mobile, show only the message area (panels 1 & 2 slide off screen)
- Add a `← Back` button in `.msn-channel-header` (mobile only) to return to sidebar

### Touch Targets
- All tap targets minimum 44×44px
- Context menus triggered by long-press (500ms `touchstart` timer) in addition to right-click
- Emoji picker and modals must not overflow viewport; use `max-height: 90vh; overflow-y: auto`

### Input Behaviour
- On mobile, the keyboard pushing the viewport up must not break the layout
- Input area must stay pinned at bottom even when soft keyboard is open
- Use `env(safe-area-inset-bottom)` padding on `.msn-input-area` for iPhone notch

### Sidebar on Mobile
- `.msn-channel-sidebar.msn-sidebar-open` should slide in from the left as a full-height overlay (z-index 50)
- Tap outside the sidebar to close it
- A hamburger `☰` button in `.msn-channel-header` (visible only on mobile) toggles `.msn-sidebar-open`

### Typography & Density
- Reduce font sizes slightly on mobile: messages ~0.875rem, timestamps ~0.68rem
- Increase line-height slightly for readability on small screens

---

## Quality Standards

- Dark theme variables: use `var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--accent)`, `var(--text-primary)`, `var(--text-muted)`, `var(--border)` consistently — no hardcoded hex colours in JS-generated HTML
- Scrollbars: thin, styled (`scrollbar-width: thin`), invisible on mobile
- Transitions: 100–150ms ease on all interactive elements
- Focus states: visible outline on keyboard navigation
- Empty states: every list/panel must have a non-blank empty state with icon + text
- Loading states: skeleton or spinner while data fetches
- Animations: subtle fade-in on messages (`@keyframes msn-fade-in`) — no jarring layout shifts

---

## Deliverables

1. Rewrite or patch `extensions/messenger/public/css/messenger.css` — every element above must be styled
2. Patch `extensions/messenger/public/pages/messenger.js` for any mobile interaction logic (sidebar toggle, long-press context menu, safe-area padding)
3. Commit with message: `feat(messenger): Gemini graphic review — full UI polish and mobile mode`
4. Push to remote

Do not remove any existing server-side files, routes, socket events, or DB schema.
Do not change the `var MessengerPage` global declaration.
Do not add external CSS frameworks or libraries.
