---
name: awesome-patterns
description: Best practices, slash commands, hooks, and workflow patterns from the awesome-claude-code community. Use for code quality, security audits, effective prompting, and development workflows.
---

# Awesome Claude Code Patterns

## Overview

Curated best practices for AI-assisted development from the awesome-claude-code community collection. These patterns improve code quality, security, and development efficiency.

Source: https://github.com/hesreallyhim/awesome-claude-code

---

## CLAUDE.md File Best Practices

Your `CLAUDE.md` (or `AGENTS.md`) is the foundation of AI-assisted development. Make it comprehensive:

### Must-Have Sections
```markdown
# Project Context
Brief description of what this project does.

# Tech Stack
- Language/runtime versions
- Key frameworks and libraries
- Database and storage providers

# Commands
Essential commands for build, test, deploy — always include these.

# Architecture
Key files, folder structure, design decisions.

# Conventions
- Code style preferences
- Naming conventions
- File organization rules
- Git commit message format

# Known Issues / Gotchas
Quirks, workarounds, things to avoid.
```

### CLAUDE.md Anti-Patterns
- ❌ Too generic (applies to any project, not this one)
- ❌ Missing test/build commands
- ❌ No architecture context
- ❌ Stale — not updated as the project evolves
- ❌ No conventions documented

---

## Security Best Practices

### OWASP Top 10 — Always Check
When writing or reviewing code, verify these automatically:

1. **Injection** — Parameterize all DB queries, never string-concatenate SQL
2. **Broken Authentication** — Check token expiry, secure storage of secrets
3. **Sensitive Data Exposure** — Never log secrets, use env vars, encrypt at rest
4. **XXE / XML** — Disable external entity processing
5. **Broken Access Control** — Row-level security (RLS) in Supabase, check ownership
6. **Security Misconfiguration** — Disable debug mode in production, remove defaults
7. **XSS** — Sanitize all user input, use CSP headers
8. **Insecure Deserialization** — Validate all incoming data shapes
9. **Known Vulnerabilities** — Keep dependencies updated, audit regularly
10. **Insufficient Logging** — Log security events, not just errors

### Quick Security Checklist
- [ ] No secrets in code or git history
- [ ] Environment variables used for all credentials
- [ ] User input validated at system boundaries
- [ ] Auth checked before data access
- [ ] RLS enabled on Supabase tables with user data
- [ ] CORS configured restrictively
- [ ] Rate limiting in place for public endpoints

---

## Effective Prompting Patterns

### For Complex Features
```
I need to implement [feature].

Context:
- Current behavior: [what happens now]
- Expected behavior: [what should happen]
- Constraints: [performance, compatibility, etc.]
- Files involved: [list key files]

Please:
1. Ask clarifying questions if needed
2. Propose an approach before implementing
3. Use TDD (write tests first)
```

### For Debugging
```
I'm encountering [specific error/behavior].

Error message:
[paste exact error]

Context:
- Where it occurs: [file:line or user flow]
- What I've tried: [list attempts]
- What I expect: [desired behavior]

Please investigate root cause before proposing fixes.
```

### For Code Review
```
Please review this code for:
1. Security vulnerabilities (OWASP Top 10)
2. Performance issues
3. Correctness
4. Maintainability

[paste code]
```

---

## Slash Command Patterns

### Commonly Useful Custom Commands

**/review** — Trigger thorough code review
```
Review the changes since last commit for security issues, correctness, and code quality.
Report by severity: Critical / Major / Minor.
```

**/explain** — Get explanation of complex code
```
Explain this code section line by line, including why each design decision was made.
```

**/test** — Generate comprehensive tests
```
Write comprehensive tests for [function/module] following TDD principles.
Include: unit tests, edge cases, error cases, and integration tests.
```

**/refactor** — Refactor without changing behavior
```
Refactor this code to improve readability and reduce complexity.
Do NOT change behavior. Run tests to verify nothing broke.
```

**/security** — Security audit
```
Audit this code for OWASP Top 10 vulnerabilities.
For each finding: explain the vulnerability, show the attack vector, provide the fix.
```

---

## Hook Patterns

### Pre-commit Review Hook
Use before every commit to prevent bad code reaching git:
```
Before committing any code:
1. Run all tests — if they fail, do not commit
2. Check for any console.log/print debug statements left in
3. Verify no secrets or credentials are being committed
4. Check that the change matches the intent of the task
```

### Post-edit Verification Hook
After every file edit:
```
After editing a file:
1. Check that the file still compiles/parses without errors
2. Verify that related tests still pass
3. Ensure the change doesn't break the contract of the function
```

---

## Code Quality Patterns

### Function Design
- Each function does ONE thing
- Can be understood without reading its internals
- Side effects are explicit and minimal
- Arguments are validated at system boundaries (not defensively everywhere)

### Error Handling
- Handle errors at the right level (not too high, not too low)
- Provide actionable error messages — tell the user what to do, not just what failed
- Log enough context to debug production issues
- Never swallow errors silently

### Code Comments
- Comments explain WHY, not WHAT
- If a comment explains WHAT the code does, the code should be rewritten to be self-explanatory
- TODO comments must include a ticket/issue reference or they'll never be done

---

## API Design Patterns

### REST API Best Practices
```
GET    /api/resource          — List (paginated)
POST   /api/resource          — Create
GET    /api/resource/:id       — Read
PUT    /api/resource/:id       — Replace
PATCH  /api/resource/:id       — Update partially
DELETE /api/resource/:id       — Delete
```

### Response Format (consistent across all endpoints)
```json
{
  "data": { ... },
  "error": null,
  "meta": { "page": 1, "total": 100 }
}
```

### Error Responses
```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [{ "field": "email", "issue": "invalid format" }]
  }
}
```

---

## Testing Patterns

### Test File Organization
```
tests/
  unit/        — Pure function tests (fast, no I/O)
  integration/ — Tests with real DB/APIs (slower)
  e2e/         — Full user flow tests (slowest)
```

### Test Naming Convention
```
[unit]: test_[function_name]_[scenario]_[expected_outcome]
[e2e]: test_user_can_[complete_action]
```

### Test Coverage Goals
- Unit tests: 80%+ coverage
- Critical paths (auth, payments, data writes): 100% coverage
- UI: key user flows covered by E2E

---

## Git Workflow

### Commit Message Format
```
type(scope): short description

Body explaining WHY (not what — the diff shows what)

Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Branch Strategy
- `main` — production-ready, auto-deploys
- `feature/feature-name` — new features
- `fix/bug-description` — bug fixes
- `chore/task-description` — maintenance

### PR Checklist
- [ ] Tests pass
- [ ] Covers the requirement
- [ ] No unrelated changes
- [ ] Good commit messages
- [ ] Documentation updated if needed

---

## Performance Patterns

### Database
- Add indexes on columns used in WHERE, JOIN, ORDER BY
- Use EXPLAIN ANALYZE on slow queries
- Paginate large result sets — never return unlimited rows
- Use connection pooling for production

### API / Backend
- Cache expensive computations
- Use async/await (non-blocking) for I/O operations
- Set timeouts on external API calls
- Implement circuit breakers for unreliable external services

### Frontend (Next.js)
- Use Server Components for data fetching by default
- Client Components only when you need interactivity
- Lazy load non-critical components
- Optimize images with `next/image`
- Use `loading.tsx` for streaming skeleton UIs
