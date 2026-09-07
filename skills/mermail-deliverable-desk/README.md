# Skill template

Copy this folder to `skills/<your-skill-name>/`, then:

1. Delete this copied `README.md`; it belongs only to the template
2. Rename files' skill id in `SKILL.md` frontmatter and `agents/openai.yaml` `default_prompt`
3. Fill tools ownership and risk classification into root `tool-coverage.json`
4. Update `skills/mermail/references/routing.md` and `tests/scenarios.json`
5. Add the skill to the README included-skills table and update `compatibility.json` counts
6. Run `npm test`

This template directory is **not** validated as a live skill (it is not under `skills/`).

See [`CONTRIBUTING_A_SKILL.md`](../../CONTRIBUTING_A_SKILL.md) for the complete worked workflow, scenario example, client smoke test, and versioning rules.
