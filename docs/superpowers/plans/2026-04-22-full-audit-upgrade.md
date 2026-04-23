# Venary Full Audit & Upgrade — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perform a balanced security-first + performance audit of all Venary subsystems using 6 parallel agents, then deploy to production VPS.

**Architecture:** 6 subsystem agents run in parallel, each owning a non-overlapping file set. Agent 7 (Verification) runs after all complete. Each agent maintains a living checklist plan file that it updates as it works. Schema compatibility with existing PostgreSQL is mandatory — no destructive SQL.

**Tech Stack:** Node.js, Express.js, PostgreSQL (via sqlite/postgres dual adapter), Socket.io, JWT, bcrypt, vanilla JS SPA, Helmet, HPP, express-rate-limit, express-slow-down

---

## Schema Compatibility Contract

Every agent must obey these rules — no exceptions:

- No `DROP TABLE`, `DROP COLUMN`, `RENAME TABLE`, `RENAME COLUMN`
- New columns must have `DEFAULT` values
- New tables and indices are freely permitted
- Always use `db.run()`, `db.get()`, `db.all()` — never raw `pg.query()`
- Use `?` placeholders (the db adapter normalizes to `$1..$N` for PostgreSQL)

---

## Agent Dispatch

### Task 1: Dispatch Agent 1 — Auth + Admin

- [ ] Launch Agent 1 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-1-auth-admin.md`
- [ ] Agent reads plan, executes all checklist items, commits, updates plan file with findings

### Task 2: Dispatch Agent 2 — Core Social

- [ ] Launch Agent 2 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-2-core-social.md`
- [ ] Agent reads plan, executes all checklist items, commits, updates plan file with findings

### Task 3: Dispatch Agent 3 — Messenger

- [ ] Launch Agent 3 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-3-messenger.md`
- [ ] Agent reads plan, executes all checklist items, commits, updates plan file with findings

### Task 4: Dispatch Agent 4 — Donations + Crypto

- [ ] Launch Agent 4 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-4-donations-crypto.md`
- [ ] Agent reads plan, executes all checklist items, commits, updates plan file with findings

### Task 5: Dispatch Agent 5 — Forum + Minecraft + Pterodactyl + Images

- [ ] Launch Agent 5 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-5-forum-minecraft-pterodactyl.md`
- [ ] Agent reads plan, executes all checklist items, commits, updates plan file with findings

### Task 6: Dispatch Agent 6 — Frontend SPA

- [ ] Launch Agent 6 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-6-frontend-spa.md`
- [ ] Agent reads plan, executes all checklist items, commits, updates plan file with findings

### Task 7: Dispatch Agent 7 — Verification + Deploy

- [ ] Launch Agent 7 with plan file: `docs/superpowers/plans/agents/2026-04-22-agent-7-verification.md`
- [ ] Agent verifies all changes, deploys to VPS, confirms production health

---

## Commit Convention

Every agent uses: `git add <specific files> && git commit -m "[type](scope): description"`

Types: `fix`, `perf`, `refactor`, `security`

Push after each commit: `git push`
