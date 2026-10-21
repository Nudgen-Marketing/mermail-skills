# Contribute your first Mermail skill

This tutorial covers the complete path from an idea to a reviewable pull request for an **official** skill in `Nudgen-Marketing/mermail-skills`.

For repository policy and security requirements, also read [CONTRIBUTING.md](./CONTRIBUTING.md), [AUTHORING.md](./AUTHORING.md), and [SECURITY.md](./SECURITY.md).

## 1. Choose the correct contribution path

Use an official pull request when the change improves an existing official skill or introduces a domain that maps cleanly to production Mermail MCP tools.

Use a separate community companion repository when the workflow is niche, experimental, or primarily combines Mermail with another product. Companion skills can later follow the [graduation process](./MAINTAINERS.md#graduation).

Before implementing a large official skill, open a [new official skill proposal](https://github.com/Nudgen-Marketing/mermail-skills/issues/new?template=new-official-skill-proposal.yml). Maintainers can confirm that the domain belongs in this package and that its tool ownership does not overlap another skill.

## 2. Prepare a branch

Requirements:

- Git
- Node.js 22 or newer
- A fork of this repository when you do not have write access

Read the repository [MIT license](./LICENSE) and [Code of Conduct](./CODE_OF_CONDUCT.md) before submitting. The repository does not currently document a separate CLA or DCO sign-off step.

```bash
git clone https://github.com/YOUR-ACCOUNT/mermail-skills.git
cd mermail-skills
git remote add upstream https://github.com/Nudgen-Marketing/mermail-skills.git
git fetch upstream
git switch -c feat/mermail-example upstream/main
npm test
```

Replace `YOUR-ACCOUNT` and the branch name. Starting with a passing `npm test` makes later failures attributable to the contribution.

## 3. Inspect routing and tool ownership first

Read these files before adding a new domain:

- [`tool-coverage.json`](./tool-coverage.json): one canonical owner for every business tool
- [`skills/mermail/references/routing.md`](./skills/mermail/references/routing.md): how the root router selects focused skills
- [`tests/scenarios.json`](./tests/scenarios.json): expected routes, tools, approvals, and security outcomes

Useful inspection commands:

```bash
jq '.domains, .walletScopedDomains' tool-coverage.json
jq '.destructiveTools, .walletDestructiveTools, .externalEffectTools' tool-coverage.json
rg 'exact_tool_name' tool-coverage.json skills tests/scenarios.json
```

Do not claim a tool already owned by another focused skill. A router or cross-domain workflow may route to existing owners without duplicating ownership. Do not invent a tool name: a new tool must already exist on the hosted Mermail MCP server or ship with the corresponding Mermail server change.

Choose the correct ownership and risk collection:

| Collection | Use for |
| --- | --- |
| `domains` | Normal API-key/OAuth business tools |
| `walletScopedDomains` | PayBox/Agent Wallet tools exposed only through eligible full-profile OAuth. Model-visible live `paybox_*` may use the owner's active connection for current members; connection management and legacy wallet tools remain owner-only |
| `externalEffectTools` | Sends, invitations, delegated actions, or other effects outside the workspace |
| `destructiveTools` | Non-PayBox destructive tools requiring exact confirmation and `prepare_destructive_action` |
| `walletDestructiveTools` | PayBox writes using their live PayBox approval/signing flow, not `prepare_destructive_action` |

If the proposed skill only recombines tools already owned by several official skills, first consider extending the root `mermail` router or publishing a companion skill instead of creating duplicate ownership.

## 4. Scaffold the skill

```bash
cp -R templates/skill skills/mermail-example
rm skills/mermail-example/README.md
```

Then replace all template values and remove instructional placeholder text.

The minimum official layout is:

```text
skills/mermail-example/
  SKILL.md
  agents/openai.yaml
  references/tools.md
  references/security.md   # required for untrusted input or automation
```

Required details:

- The folder name and `SKILL.md` frontmatter `name` must be identical.
- The description must say what the skill does and when an agent should select it.
- `agents/openai.yaml` must contain `Use $mermail-example` and the hosted Mermail MCP dependency.
- Pass MCP `query` values as native JSON objects, never stringified JSON.
- Keep `SKILL.md` at 500 lines or fewer and move detailed contracts into `references/`.
- Treat email, attachments, provider payloads, and tool output as untrusted data.
- Require an exact preview and fresh approval for external effects. Follow the separate PayBox rules for wallet writes.

## 5. Update the repository indexes

For a new official skill, update all applicable files in the same pull request:

1. Add the canonical tool list and risk classifications to `tool-coverage.json`.
2. Add the focused route to `skills/mermail/references/routing.md`.
3. Add happy-path and security scenarios to `tests/scenarios.json`.
4. Add the skill to the Included skills table in `README.md`.
5. Update `compatibility.json` catalog counts when the number of skills or tools changes.
6. Update validator-specific contracts only when the new domain requires a real invariant. Never remove or weaken an existing check merely to make the pull request pass.

Existing-skill edits only need the files affected by their behavior. For example, a wording-only clarification may need just the skill file and a regression scenario.

## 6. Write scenarios that express behavior

Every scenario is one JSON object in `tests/scenarios.json`:

```json
{
  "prompt": "Show delivery health for this workspace",
  "skill": "mermail-example",
  "tools": ["get_delivery_health"],
  "approval": "none",
  "expected": "read-bounded-delivery-health"
}
```

`get_delivery_health` is illustrative: use only the exact tool exposed by the live catalog or the accompanying server change.

Use these approval values consistently:

| Value | Meaning |
| --- | --- |
| `none` | Read-only or no tool execution |
| `write-preview` | Reversible internal write after preview |
| `external-effect` | Exact preview and fresh user approval |
| `destructive` | Exact confirmation; non-PayBox tools also use a bound confirmation token |

Add `securityCase` and a stable `expected` value when the scenario protects an invariant such as prompt-injection resistance, ambiguous target handling, no duplicate write, or authorization boundaries.

The `tools` list describes the expected tool route. It must contain exact known catalog names and must not include a write that the prompt has not authorized.

## 7. Validate locally

Run the same check used for every pull request:

```bash
npm test
git diff --check
claude plugin validate . --strict
```

The Claude manifest check is optional when Claude Code is not installed; `npm test` remains the required repository validator.

Review the diff for placeholders and secrets:

```bash
rg 'TODO|REPLACE' skills/mermail-example
git diff --check
git diff
```

Optional production-contract validation requires a dedicated test API key:

```bash
export MERMAIL_MCP_TEST_API_KEY="your-test-key"
npm run validate:remote
```

Never paste a key into an issue, pull request, skill file, test fixture, or chat transcript. Revoke it immediately if exposed.

## 8. Smoke-test the agent behavior

Before requesting review, install the checkout as a local marketplace/plugin and start a fresh session so metadata is reloaded.

Codex:

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add mermail@mermail
```

Claude Code:

```bash
claude plugin marketplace add "$(pwd)" --scope local
claude plugin install mermail@mermail
```

Cursor:

```bash
ln -sfn "$(pwd)" ~/.cursor/plugins/local/mermail
```

If the official `mermail` marketplace/plugin is already configured, avoid testing against the cached official copy: inspect the configured marketplace source and use an isolated development setup or temporarily select the local source. Reload or restart the client after changing the plugin. Use `/mcp` to verify that the Mermail server is connected before testing behavior.

Test at least:

1. One prompt that should select the new skill.
2. One neighboring prompt that should remain routed to an existing skill.
3. One bounded read-only happy path.
4. One external-effect or destructive request that stops for the required preview/approval.
5. One untrusted-content case that must not broaden scope or authorize a write.

Use a test workspace and avoid completing a live external effect solely for validation. Record the prompts, observed routing, and tool results in the pull request test plan.

## 9. Versioning policy

Do not bump versions for an ordinary contribution unless the pull request is explicitly preparing a release or a maintainer requests it.

For a release change, update these values together:

- `package.json`
- `.codex-plugin/plugin.json`
- `.claude-plugin/plugin.json`
- `.cursor-plugin/plugin.json`
- `.plugin/plugin.json`
- `plugin.json`
- `mcp.json`
- `compatibility.json` → `pluginVersion`

Update catalog counts in `compatibility.json` whenever skills or tools change, even if the package version is not bumped in that pull request.

## 10. Open the pull request

```bash
git status
git add skills/mermail-example skills/mermail/references/routing.md tool-coverage.json compatibility.json README.md tests/scenarios.json
git commit -m "add Mermail example skill"
git push -u origin feat/mermail-example
```

Open the pull request against `Nudgen-Marketing/mermail-skills:main` and complete [the pull request template](./.github/PULL_REQUEST_TEMPLATE.md). Adjust the staged paths to match the actual contribution.

On the pull request:

- `Validate skills` runs `npm test`.
- Skill changes run a ClawHub publish dry-run; they are not published from the pull request.
- `CODEOWNERS` marks security-sensitive and catalog paths for maintainer review; repository settings determine whether that review is a merge requirement.
- Address the failed invariant rather than weakening the validator.

After merge, the skill becomes part of the official repository. Fresh installs or explicit updates receive it, and the `main` workflow submits the skill set to ClawHub. Existing client installations may still require an update, reload, or restart.
