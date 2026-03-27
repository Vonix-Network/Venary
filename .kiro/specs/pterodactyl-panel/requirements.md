# Requirements Document

## Introduction

The Pterodactyl Panel extension adds a game server management panel to the Venary platform. It integrates with the Pterodactyl API to provide real-time console output, server power controls (start, stop/kill, restart), and access-gated visibility. The extension follows the existing extension architecture (manifest.json, public/, server/) and integrates with the admin dashboard for per-user access control and extension-level settings configuration. The Pterodactyl API key is stored exclusively server-side and is never transmitted to clients.

## Glossary

- **Panel**: The Pterodactyl Panel extension UI page accessible to authorized users.
- **Extension**: A self-contained module under `extensions/pterodactyl-panel/` following the Venary extension system conventions.
- **Pterodactyl_API**: The external Pterodactyl v1 REST and WebSocket API used to communicate with the game server panel.
- **Panel_Server**: The server/routes.js backend of the extension that proxies requests to the Pterodactyl_API.
- **Console_Stream**: The real-time WebSocket connection between the Panel_Server and the Pterodactyl_API that forwards console output to the client.
- **Power_Action**: One of the three server control operations: `start`, `stop` (or `kill`), or `restart`.
- **Panel_Access**: A boolean permission flag stored per user in the extension's database table that grants or revokes access to the Panel page.
- **Admin_Dashboard**: The existing admin UI at `public/js/pages/admin.js`, specifically the Users tab.
- **Extension_Settings**: The configuration UI rendered when an admin clicks "Manage" on the pterodactyl-panel extension card in the Extensions tab.
- **API_Key**: The Pterodactyl application or client API key stored server-side only, never returned in any HTTP response or logged to the browser console.
- **Base_URL**: The base URL of the Pterodactyl panel instance (e.g., `https://panel.example.com`), stored in extension settings.
- **Server_ID**: The Pterodactyl server identifier used to target a specific game server via the Pterodactyl_API.
- **Superadmin**: A user role above `admin` that inherits all admin capabilities and additionally holds extension-granted privileges such as managing Panel_Access for other users. The `superadmin` role can only be assigned via the server-side CLI tool (`admin_menu.js`) and cannot be assigned or revoked through the web UI by any role including `admin`.

---

## Requirements

### Requirement 1: Extension Registration

**User Story:** As a platform administrator, I want the Pterodactyl Panel to be a proper extension, so that it integrates cleanly with the existing extension system and can be enabled or disabled like any other extension.

#### Acceptance Criteria

1. THE Extension SHALL provide a `manifest.json` file that declares its `id`, `name`, `version`, `description`, `routes`, `pages`, `css`, `nav`, and `admin_route` fields consistent with the existing extension manifest format.
2. THE Extension SHALL register a navigation entry visible only to users who have Panel_Access granted.
3. WHEN the Extension is disabled via the Extensions tab, THE Panel_Server SHALL stop serving all extension routes and THE Panel page SHALL become inaccessible.
4. THE Extension SHALL provide an `admin_route` value so that the "Manage" button in the Extensions tab navigates to the Extension_Settings page.

---

### Requirement 2: Extension Settings Configuration

**User Story:** As a platform administrator, I want to configure the Pterodactyl base URL, API key, and target server ID from the extension management UI, so that the extension connects to the correct panel instance without requiring server restarts.

#### Acceptance Criteria

1. THE Extension_Settings page SHALL render a form with fields for Base_URL, API_Key, and Server_ID.
2. WHEN an administrator submits the settings form with a valid Base_URL, API_Key, and Server_ID, THE Panel_Server SHALL persist these values in the extension's database table.
3. WHEN the settings form is loaded, THE Extension_Settings page SHALL display the currently saved Base_URL and Server_ID values but SHALL NOT populate or display the API_Key field value.
4. IF the Base_URL field is empty when the settings form is submitted, THEN THE Panel_Server SHALL return a 400 error with a descriptive message.
5. IF the Server_ID field is empty when the settings form is submitted, THEN THE Panel_Server SHALL return a 400 error with a descriptive message.
6. THE Panel_Server SHALL store the API_Key in the extension database and SHALL NOT include the API_Key value in any HTTP response body or HTTP response header sent to the client.

---

### Requirement 3: Access Control — Panel Permission Flag

**User Story:** As a platform administrator, I want to grant or revoke panel access per user from the admin dashboard, so that only authorized users can view and interact with the game server panel.

#### Acceptance Criteria

1. THE Extension SHALL create a database table `pterodactyl_access` with columns `user_id` (TEXT, primary key, foreign key to `users.id`) and `granted_at` (TEXT).
2. WHEN an administrator toggles the panel access switch for a user in the Admin_Dashboard Users tab, THE Panel_Server SHALL insert or delete the corresponding row in `pterodactyl_access`.
3. THE Admin_Dashboard Users tab SHALL render a toggle control per user row labeled "Panel Access" when the pterodactyl-panel extension is enabled.
4. WHEN the Admin_Dashboard Users tab loads, THE Admin_Dashboard SHALL fetch the current Panel_Access state for all listed users from the Panel_Server and reflect it in each toggle's initial state.
5. IF a user does not have a row in `pterodactyl_access`, THEN THE Panel_Server SHALL treat that user as having Panel_Access denied.

---

### Requirement 4: Access Control — Route Enforcement

**User Story:** As a security-conscious developer, I want all panel routes to enforce the Panel_Access permission, so that unauthorized users cannot access console output or trigger power actions even via direct API calls.

#### Acceptance Criteria

1. WHEN a request arrives at any Panel_Server route without a valid JWT, THE Panel_Server SHALL return a 401 response.
2. WHEN a request arrives at any Panel_Server route with a valid JWT but the requesting user does not have Panel_Access, THE Panel_Server SHALL return a 403 response.
3. WHEN a user without Panel_Access navigates to the Panel page route, THE Panel page SHALL display an access-denied message and SHALL NOT render the console or control buttons.
4. THE Panel page SHALL check Panel_Access on load by calling a Panel_Server status endpoint and redirect or show an error if access is denied.

---

### Requirement 5: Real-Time Console Output

**User Story:** As an authorized user, I want to see live console output from the game server, so that I can monitor server activity without needing direct server access.

#### Acceptance Criteria

1. WHEN an authorized user opens the Panel page, THE Panel page SHALL establish a Socket.IO connection to the Panel_Server console namespace.
2. WHEN the Panel_Server receives a console log line from the Pterodactyl_API WebSocket, THE Panel_Server SHALL emit the line to all connected clients in the console namespace.
3. THE Panel page SHALL append each received console line to a scrollable console output area without clearing previous lines during the session.
4. THE Panel page SHALL auto-scroll the console output area to the bottom when a new line is appended, unless the user has manually scrolled up.
5. WHEN the Pterodactyl_API WebSocket connection is lost, THE Panel_Server SHALL attempt to reconnect with exponential backoff up to a maximum of 5 retry attempts.
6. IF the Pterodactyl_API WebSocket connection cannot be re-established after 5 attempts, THEN THE Panel_Server SHALL emit a connection-error event to connected clients.
7. WHEN a connection-error event is received, THE Panel page SHALL display a visible error banner indicating the console stream is unavailable.
8. THE Console_Stream SHALL buffer up to 500 lines of recent console output so that newly connected clients receive recent history on connect.

---

### Requirement 6: Server Power Controls

**User Story:** As an authorized user, I want to start, stop (or kill), and restart the game server from the panel, so that I can manage server state without needing direct access to the hosting panel.

#### Acceptance Criteria

1. THE Panel page SHALL render three power control buttons: Start, Stop, and Restart.
2. WHEN an authorized user clicks the Start button, THE Panel page SHALL send a POST request to the Panel_Server power endpoint with action `start`.
3. WHEN an authorized user clicks the Stop button, THE Panel page SHALL send a POST request to the Panel_Server power endpoint with action `stop`.
4. WHEN an authorized user clicks the Restart button, THE Panel page SHALL send a POST request to the Panel_Server power endpoint with action `restart`.
5. WHEN the Panel_Server receives a valid power action request, THE Panel_Server SHALL forward the action to the Pterodactyl_API power endpoint using the stored API_Key and Server_ID.
6. WHEN a power action is successfully forwarded, THE Panel_Server SHALL return a 200 response and THE Panel page SHALL display a success toast notification.
7. IF the Pterodactyl_API returns an error for a power action, THEN THE Panel_Server SHALL return a 502 response with a descriptive error message and THE Panel page SHALL display an error toast notification.
8. WHILE a power action request is in flight, THE Panel page SHALL disable all three power control buttons to prevent duplicate submissions.
9. THE Panel page SHALL display a "Kill" option as a secondary action on the Stop button (e.g., a dropdown or secondary button) that sends action `kill` to the Panel_Server power endpoint.

---

### Requirement 7: Server Status Display

**User Story:** As an authorized user, I want to see the current server status (online/offline/starting) on the panel, so that I understand the server state at a glance.

#### Acceptance Criteria

1. WHEN the Panel page loads, THE Panel page SHALL fetch the current server status from the Panel_Server status endpoint.
2. THE Panel_Server status endpoint SHALL query the Pterodactyl_API for the current server resource state and return a normalized status value of `running`, `offline`, `starting`, or `stopping`.
3. THE Panel page SHALL display the current status with a color-coded indicator consistent with the site's existing badge/status styling.
4. WHEN the Panel_Server receives a server state change event from the Pterodactyl_API WebSocket, THE Panel_Server SHALL emit a status-update event to connected clients.
5. WHEN a status-update event is received, THE Panel page SHALL update the displayed status indicator without requiring a page reload.

---

### Requirement 8: API Key Security

**User Story:** As a security-conscious administrator, I want the Pterodactyl API key to be stored and used exclusively server-side, so that it is never exposed to end users through any client-facing channel.

#### Acceptance Criteria

1. THE Panel_Server SHALL retrieve the API_Key exclusively from the extension database at request time and SHALL NOT cache it in any client-accessible location.
2. THE Panel_Server SHALL NOT include the API_Key in any JSON response body, HTTP header, WebSocket message, or Socket.IO event payload sent to clients.
3. THE Extension_Settings page SHALL NOT display the current API_Key value in any input field, placeholder, or page element after it has been saved.
4. THE Panel_Server SHALL NOT log the API_Key value to any console output or log file.
5. WHEN the API_Key is transmitted from the Extension_Settings form to the Panel_Server, THE Panel_Server SHALL accept it only over an authenticated admin-only POST/PUT endpoint.

---

### Requirement 9: UI Design Consistency

**User Story:** As a user, I want the panel UI to look and feel consistent with the rest of the Venary platform, so that the experience is cohesive and professional.

#### Acceptance Criteria

1. THE Panel page SHALL use the existing CSS custom properties (`--neon-cyan`, `--bg-primary`, `--bg-secondary`, `--text-primary`, `--font-mono`, etc.) for all styling.
2. THE Panel page SHALL use the existing `btn`, `badge`, `input-field`, and `admin-settings-card` CSS classes where applicable.
3. THE Console_Stream output area SHALL use `var(--font-mono)` for font rendering and a dark background consistent with `var(--bg-tertiary)`.
4. THE Panel page SHALL be responsive and remain usable at viewport widths down to 360px.
5. THE Panel page SHALL use `animate-fade-up` entry animations consistent with other extension pages.

---

### Requirement 10: Superadmin Role & Panel Access Gating

**User Story:** As a platform owner, I want a superadmin role that inherits all admin capabilities and exclusively controls extension-level permissions like Panel_Access, so that regular admins cannot grant or revoke panel access.

#### Acceptance Criteria

1. THE platform SHALL recognise `superadmin` as a valid role value in the `users.role` column, sitting above `admin` in the privilege hierarchy.
2. THE `superadmin` role SHALL only be assignable via the server-side CLI tool (`admin_menu.js`) and SHALL NOT be assignable or revokable through any web UI endpoint by any role including `admin`.
3. WHEN a request to toggle Panel_Access for a user arrives at the Panel_Server, THE Panel_Server SHALL return a 403 response if the requesting user's role is not `superadmin`.
4. THE Admin_Dashboard Users tab SHALL render the "Panel Access" toggle as visible but disabled (non-interactive) for users whose role is `admin` or `moderator`, and as interactive only for users whose role is `superadmin`.
5. THE Panel_Server `requireAdmin` middleware SHALL grant access to users with role `admin`, `superadmin`, or `moderator`, so that superadmins retain full access to all existing admin routes.
6. WHEN a `superadmin` is the target of a ban or role-change request via the web UI, THE Panel_Server SHALL return a 403 response, preventing any web-based demotion or banning of superadmins.
