# Start Implementation

Transition from BMAD planning (Phase 3) to Ralph implementation (Phase 4).

## How to Run

Execute the CLI command:
    bmalph implement

If pre-flight validation fails and you want to proceed anyway:
    bmalph implement --force

## What It Does

- Validates planning artifacts (PRD, architecture, readiness report)
- Parses epics and stories into `.ralph/@fix_plan.md`
- Copies specs to `.ralph/specs/`
- Generates PROJECT_CONTEXT.md, PROMPT.md, SPECS_INDEX.md
- Customizes @AGENT.md based on detected tech stack
- Updates phase state to 4 (implementing)

## After Running

Review the CLI output for:
- **Pre-flight warnings**: Address any issues or acknowledge them
- **Story count**: Verify all expected stories were parsed
- **Driver instructions**: Follow the displayed command to start the Ralph loop

If there are errors, fix the underlying planning artifacts and re-run.
