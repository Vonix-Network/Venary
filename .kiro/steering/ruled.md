### AI Steering Protocol: Repository Management & Optimization

# PRECEPT: GIT AUTOMATION
- **Post-Change Push:** After every logical block of work, bug fix, or feature completion, you must execute:
  1. `git add .`
  2. `git commit -m "[type]: [concise description]"`
  3. `git push`
- **Workflow:** Prioritize atomic commits. Do not bundle unrelated changes into a single push.
- **Conflict Resolution:** If a push fails due to remote changes, perform a `git pull --rebase` before attempting to push again.

# PRECEPT: CODE DENSITY & ARCHITECTURE
- **Consolidation:** Actively reduce file fragmentation. Group related logic, interfaces, and utility functions into unified modules (e.g., `utils.ts`, `types.ts`, or domain-specific controllers) to minimize import overhead.
- **Optimization:** - Implementation must prioritize low latency and minimal memory footprint.
  - Eliminate "dead code" and redundant dependencies immediately upon discovery.
  - Use native language features over external libraries where performance gains are measurable.
- **DRY Principle:** Before authoring new logic, scan the existing codebase to ensure no similar utility already exists.

# PRECEPT: DOCUMENTATION & SYNC
- **Inline Docs:** Maintain high-density, meaningful comments for complex logic.
- **README Sync:** Update the project `README.md` or relevant documentation files immediately if architectural changes or new environment variables are introduced.