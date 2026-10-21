# Generated client bundle: review required

This is repository contribution data, not an instruction to apply the generated client settings. The bundle has not been certified against the user's installed client. Repository development uses AUTHORING.md, CONTRIBUTING.md and SECURITY.md; the optional hidden developer skill is not an end-user business skill.

## Repository skill

- Codex-facing skill: `.agents/skills/mermail-skills/SKILL.md`
- Claude-facing copy: `.claude/skills/mermail-skills/SKILL.md`
- Keep those copies identical and their `name: mermail-skills` aligned with the directory and UI prompt.
- The ECC inventory in `.claude/ecc-tools.json` and its readiness score are historical generation output, not evidence that the current repository or client passed a compatibility/security audit.
- Keep credentials and private endpoint values outside this repository. Do not inspect or modify a user's private configuration without task-specific authority.

## Optional client baseline — blocked pending maintainer review

Do not treat `.codex/config.toml` as a default approved or “ECC-safe” baseline. It declares GitHub, Context7, Exa, Memory, Playwright and Sequential Thinking MCP integrations; local commands include unpinned or `@latest` dependencies. Client loading could start commands when the host trusts the configuration. Merely reviewing this repository does not authorize loading it, running its commands, connecting accounts, sending repository content to those services or adding credentials.

The supplied approval, sandbox, live search, multi-agent limits and per-role model/reasoning settings are proposed client choices, not repository conventions. They remain unchanged by the naming correction; do not silently copy or override the user's client/model/policy preferences.

Before enabling this intended capability, the maintainer must choose the supported client/version and desired integrations, verify the exact client schema and feature support, review/pin appropriate dependency versions and service trust/data scope, and obtain explicit user opt-in to the final configuration. Verify startup/credential/data behavior in an approved isolated client environment. This review has not done so; activation and cross-client compatibility remain blocked, not claimed safe. Do not invent package pins, silently delete intended integrations, or switch models to make the bundle appear compatible.

## Proposed roles

The three role TOMLs describe read-only explorer, reviewer and documentation researcher roles. Their presence is not authorization to delegate or change the chosen model. Use roles only when the current user's request and supported client settings authorize them.

No dedicated workflow command files were generated for this repository.
