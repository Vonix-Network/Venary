# CSS Layout Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Cyber Float (and all other layout variants) from bleeding sidebar margin into auth pages and the admin dashboard.

**Architecture:** Add two CSS override rules to `public/css/main.css` that use the existing `full-width` and `admin-fullscreen` classes already set by the router to cancel layout-driven margins. No router or JS changes needed.

**Tech Stack:** Plain CSS

---

### Task 1: Fix auth page layout bleeding

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Reproduce the bug**

  Set your layout to Cyber Float (Settings → Appearance → Layout → Cyber Float). Navigate to `/login`. Confirm the login form is offset to the right instead of centered.

- [ ] **Step 2: Locate the insertion point**

  Open `public/css/main.css`. Find the existing `html.layout-cyber-float .page-container` block around line 1066. The override rules go **after** all layout variant blocks (after the last layout rule, before the next unrelated section).

- [ ] **Step 3: Add the auth page override**

  Find the end of the layout variant section (after the last `html.layout-*` block). Add:

  ```css
  /* ─── Layout isolation: auth & admin contexts ─── */
  html[class*="layout-"] .page-container.full-width {
    margin-left: 0 !important;
    padding-top: 0 !important;
  }
  ```

- [ ] **Step 4: Verify the fix**

  With Cyber Float still active, navigate to `/login`. The login form should now be centered. Also check `/register`, `/forgot-password` — all should be centered.

- [ ] **Step 5: Check other layouts aren't broken**

  Switch to Default layout, Top Nav, and Neon Bar — navigate to `/login` in each. Confirm the login page remains centered (it already was; this rule should not affect those).

- [ ] **Step 6: Commit**

  ```bash
  git add public/css/main.css
  git commit -m "fix(css): isolate auth pages from sidebar layout classes"
  ```

---

### Task 2: Fix admin dashboard layout bleeding

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Reproduce the bug**

  With Cyber Float active, navigate to `/admin`. Confirm the entire admin dashboard UI (including its internal nav) is shifted right.

- [ ] **Step 2: Add the admin override**

  Directly below the rule added in Task 1, add:

  ```css
  html[class*="layout-"] .page-container.admin-fullscreen {
    margin-left: 0 !important;
    padding-top: 0 !important;
  }
  ```

- [ ] **Step 3: Verify the fix**

  With Cyber Float active, navigate to `/admin`. The admin dashboard should render full-width with no left offset, same as with Default layout.

- [ ] **Step 4: Check messenger (shares admin-fullscreen)**

  Navigate to `/messenger`. Confirm it also renders correctly with no offset.

- [ ] **Step 5: Verify normal pages still respect Cyber Float**

  Navigate to `/feed`, `/profile`, `/friends` with Cyber Float active. Confirm the sidebar is still offset correctly (margin-left: 280px applies as before).

- [ ] **Step 6: Commit and push**

  ```bash
  git add public/css/main.css
  git commit -m "fix(css): isolate admin dashboard from sidebar layout classes"
  git push
  ```

---

### Task 3: Deploy to production

- [ ] **Step 1: SSH to VPS and pull**

  ```bash
  ssh root@vonix.network
  cd /var/www/Venary
  git pull
  ```

- [ ] **Step 2: Restart service**

  ```bash
  sudo systemctl restart vonix
  ```

- [ ] **Step 3: Verify uptime**

  ```bash
  systemctl status vonix
  ```

  Expected: `active (running)` with no errors in the last few log lines.

- [ ] **Step 4: Smoke test on production**

  With Cyber Float active on the live site: visit `/login` (centered), `/admin` (full-width, no offset). Confirm fixes are live.
