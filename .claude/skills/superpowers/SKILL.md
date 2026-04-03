---
name: superpowers
description: Complete software development workflow for coding agents. Use before any coding task — brainstorm first, plan tasks, TDD, code review, finish branch. MANDATORY workflow, not optional.
---

# Superpowers — Complete Development Workflow

## The Basic Workflow (Run In Order)

1. **brainstorming** — BEFORE writing any code. Refine the idea, explore alternatives, validate design.
2. **using-git-worktrees** — After design approval. Create isolated workspace on a new branch.
3. **writing-plans** — Break design into bite-sized tasks (2–5 min each). Every task has exact file paths, complete code, verification steps.
4. **subagent-driven-development / executing-plans** — Dispatch subagents per task or execute in batches with human checkpoints.
5. **test-driven-development** — During implementation. Enforce RED-GREEN-REFACTOR.
6. **requesting-code-review** — Between tasks. Review against plan, report issues by severity.
7. **finishing-a-development-branch** — When tasks complete. Verify tests, present merge/PR/keep/discard options.

> **The agent checks for relevant skills before any task. These are MANDATORY workflows, not suggestions.**

---

## SKILL: Brainstorming

**Trigger:** MUST use before any creative work — features, components, functionality changes.

**Hard Gate:** Do NOT write code, scaffold projects, or take implementation action until design is approved.

### Checklist (in order)
1. Explore project context — check files, docs, recent commits
2. Ask clarifying questions — ONE at a time, understand purpose/constraints/success criteria
3. Propose 2–3 approaches with trade-offs and your recommendation
4. Present design in sections scaled to complexity, get user approval after each section
5. Write design doc → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
6. Spec self-review — scan for placeholders, contradictions, ambiguity
7. User reviews written spec
8. Transition → invoke `writing-plans` skill (ONLY this skill, nothing else)

### Key Principles
- One question at a time — never overwhelm
- Multiple choice preferred
- YAGNI ruthlessly — remove unnecessary features
- Explore 2–3 alternatives before settling
- Incremental validation — present design, get approval, then move forward
- For large projects: decompose into sub-projects first

---

## SKILL: Test-Driven Development (TDD)

**Trigger:** Always — new features, bug fixes, refactoring, behavior changes.

### The Iron Law
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```
Write code before the test? Delete it. Start over. No exceptions.

### RED-GREEN-REFACTOR

**RED — Write Failing Test**
- One behavior, clear name, tests real behavior (not mocks unless unavoidable)
- Run test: MUST fail for expected reason (feature missing, not typos)

**GREEN — Minimal Code**
- Write simplest code to pass the test
- No features, no refactoring, no "while I'm here" improvements — only pass the test

**VERIFY GREEN**
- Run: all tests pass, output pristine (no errors, warnings)

**REFACTOR — Clean Up**
- After green ONLY: remove duplication, improve names, extract helpers
- Keep tests green, don't add behavior

### Red Flags — STOP and Start Over
- Code written before test
- Test passes immediately (means it's not testing the right thing)
- "I'll write tests after to verify it works"
- "Just this once" rationalization
- "I already manually tested it"

### Verification Checklist
- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass, output pristine
- [ ] Edge cases and errors covered

---

## SKILL: Systematic Debugging

**Trigger:** ANY technical issue — test failure, bug, unexpected behavior, build failure.

### The Iron Law
```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

### Four Phases (MUST complete each before proceeding)

**Phase 1: Root Cause Investigation**
1. Read error messages carefully — stack traces, line numbers, file paths
2. Reproduce consistently — exact steps, every time
3. Check recent changes — git diff, new deps, config changes
4. In multi-component systems: add diagnostic logging at each component boundary BEFORE proposing fixes
5. Trace data flow to find where bad values originate

**Phase 2: Pattern Analysis**
1. Find working examples — similar working code in same codebase
2. Compare against reference implementation — read it COMPLETELY
3. Identify differences — list every difference, however small
4. Understand dependencies — settings, config, environment

**Phase 3: Hypothesis and Testing**
1. State hypothesis clearly: "I think X is root cause because Y"
2. Make SMALLEST possible change to test hypothesis
3. One variable at a time
4. If wrong: form NEW hypothesis, don't stack more fixes

**Phase 4: Implementation**
1. Create failing test first (use TDD skill)
2. ONE fix addressing root cause — no "while I'm here" changes
3. Verify: test passes, no regressions

**If 3+ fixes failed:** Question the architecture — don't attempt Fix #4.

### Red Flags
- "Quick fix for now, investigate later"
- "Just try changing X and see"
- Proposing solutions before tracing data flow
- "One more fix attempt" when already tried 2+

---

## SKILL: Writing Plans

**Trigger:** When you have a spec/requirements for a multi-step task, before touching code.

### Plan Document Header (REQUIRED)
```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED: Use subagent-driven-development or executing-plans task-by-task.

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
---
```

### Task Structure
```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] Step 1: Write the failing test
  [actual test code]
- [ ] Step 2: Run test — verify it FAILS
  Run: `pytest tests/path/test.py::test_name -v`
  Expected: FAIL with "feature not defined"
- [ ] Step 3: Write minimal implementation
  [actual implementation code]
- [ ] Step 4: Run test — verify it PASSES
- [ ] Step 5: Commit
```

### No Placeholders Rule
Never write: "TBD", "TODO", "implement later", "add appropriate error handling", "write tests for the above"
Every step must contain the ACTUAL content an engineer needs.

### Granularity
Each step = one action (2–5 minutes). Be specific: "Write the failing test" is a step. "Run it to see it fail" is a separate step.

### After Plan
Save to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

Offer execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — execute in session with checkpoints

---

## SKILL: Verification Before Completion

**Trigger:** Before claiming work is complete, fixed, or passing — before committing.

### Required Checks
- [ ] Run the actual tests (don't assume they pass)
- [ ] Read the output completely
- [ ] No errors, warnings, or unexpected output
- [ ] The specific behavior requested actually works
- [ ] Edge cases verified
- [ ] No regressions introduced

**Evidence before assertions. Never claim "it's fixed" without running the verification.**

---

## SKILL: Requesting Code Review

**Trigger:** Between tasks, before merging, after completing features.

### Pre-Review Checklist
- [ ] All tests pass
- [ ] No linting errors
- [ ] Implementation matches the plan
- [ ] No unnecessary code/complexity added
- [ ] Commit messages are clear

### Review Focus Areas
1. Does it match spec requirements?
2. Are there security vulnerabilities?
3. Is the code readable and maintainable?
4. Are edge cases handled?
5. Are tests meaningful (not just coverage numbers)?

### Issue Severity
- **Critical** — must fix before continuing (security, crashes, wrong behavior)
- **Major** — should fix before merge
- **Minor** — suggestions, nice-to-haves

---

## SKILL: Using Git Worktrees

**Trigger:** After design approval, before starting implementation.

### When to Use
- Feature work needing isolation from current workspace
- Running parallel branches
- Before executing implementation plans

### Workflow
```bash
# Create worktree for new feature
git worktree add ../project-feature-name feature/feature-name

# Verify clean test baseline
cd ../project-feature-name && npm test

# Work in isolated environment
# When done: finishing-a-development-branch skill
```

---

## SKILL: Finishing a Development Branch

**Trigger:** When all tasks complete.

### Steps
1. Verify all tests pass (`npm test` / `pytest` — full suite)
2. Review changes against original plan
3. Present options:
   - **Merge** — merge to main/trunk
   - **PR** — create pull request for review
   - **Keep** — leave branch for later
   - **Discard** — delete branch (with confirmation)
4. Clean up worktree if used

---

## Philosophy

| Principle | Practice |
|-----------|----------|
| Test-Driven Development | Write tests first, always |
| Systematic over ad-hoc | Process over guessing |
| Complexity reduction | Simplicity as primary goal |
| Evidence over claims | Verify before declaring success |
| YAGNI | You Aren't Gonna Need It — don't build what's not asked |
| DRY | Don't Repeat Yourself |
| Frequent commits | Small, atomic, meaningful commits |
