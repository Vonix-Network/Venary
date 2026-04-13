# Claude Code Security Directive
## Enterprise-Grade Security for Venary Website & Messenger

This document outlines the strict security requirements and architecture that must be adhered to when developing or modifying features for the Venary platform (both the main website and the messenger extension). The goal is to achieve Discord/Fluxer-level enterprise security to prevent data breaches, API abuse, and other known exploits.

### 1. Core Infrastructure & Networking
- **Client-Server Architecture:** All communications must route through Venary servers. Never use P2P (Peer-to-Peer) connections that could expose user IP addresses.
- **Proxy Media & Links:** All external media (images, link previews) must be proxied through the server to prevent IP logging by third parties.
- **DDoS Mitigation:** Ensure the application is compatible with CDN layer protection (e.g., Cloudflare) to absorb Layer 3, 4, and 7 attacks. Rate limit all API endpoints.

### 2. Backend & API Security
- **Fault Tolerance:** Isolate microservices where possible so that a failure in one module (like the messenger socket) doesn't crash the entire Node.js server.
- **Input Validation & Sanitization:** All incoming data (REST API and WebSocket) must be strictly validated. Escape HTML aggressively before storing or rendering user-generated content to prevent XSS (Cross-Site Scripting).
- **Rate Limiting:** Implement strict rate limits on authentication endpoints, message sending, and channel creation to prevent spam and brute-force attacks.

### 3. Account & Access Control
- **Authentication:** Use secure JWTs (JSON Web Tokens) with appropriate expiration times. Tokens should never be logged or exposed in URLs.
- **Password Security:** Use `bcrypt` or `argon2` for password hashing with a high work factor. Never store plaintext passwords.
- **Session Management:** Allow users to view and revoke active sessions. Implement IP location locking to detect and verify logins from new locations or devices.
- **Role-Based Access Control (RBAC):** Strictly enforce permissions on the server-side. Do not trust the client to hide administrative actions; the server must reject unauthorized requests (e.g., deleting a channel, banning a user).

### 4. Real-Time Communication (WebSockets)
- **Authentication:** WebSocket connections must be authenticated via JWT upon connection.
- **Event Validation:** Every socket event (e.g., `channel:send_message`) must verify that the user has the required permissions and is a member of the target space/channel.
- **Rate Limiting:** Apply rate limits per socket connection to prevent flooding channels with messages or events.

### 5. Data Privacy & Encryption
- **Encryption in Transit:** All traffic must be enforced over HTTPS/WSS (TLS 1.2 or higher).
- **Data at Rest:** Sensitive user data (like email addresses) should be encrypted in the database.
- **No E2EE for Text:** Text messages are not end-to-end encrypted by default to allow for server-side moderation and search, but must be secure in transit and at rest.

### 6. Safety & Moderation
- **AutoMod System:** Implement server-side keyword filtering and spam detection.
- **Content Scanning:** Validate file uploads by checking MIME types and magic numbers. Restrict executable file uploads (`.exe`, `.bat`, etc.).
- **Permissions:** Ensure space owners have granular control over what members can do (read messages, send messages, manage channels).

### Implementation Mandate
When writing code for Venary, **Claude Code** must review these directives. Any new feature must incorporate input validation, role checks, and rate limiting by default. Security is not an afterthought; it is the foundation of the platform.