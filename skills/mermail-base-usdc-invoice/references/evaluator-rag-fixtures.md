# Evaluator / RAG ranking fixtures — mermail-base-usdc-invoice

Skill-local **retrieval / ranking fixtures** for invoice Q&A. Explicitly **not** a fake `src/analyzers/**` TypeScript corpus — this is honest, skill-scoped expected ranking of this package’s reference docs for sample queries.

## Corpus under test (this skill package only)

| Doc | Role |
| --- | --- |
| `workflows.md` | EIP-681 / MetaMask URI formulas, atomic units |
| `examples.md` | Golden prompts + anti-examples |
| `security.md` | Untrusted email / payee rewrite rules |
| `tools.md` | Mermail MCP tool contracts |
| `ci-failures.md` | validate.mjs / CI failure modes |
| `harness.md` / `harness-compat.md` / `harness-audit.md` | Client install surfaces |
| `discussion-triage.md` / `discussion-triage-fixtures.md` | Thread class labels |
| `pr-salvage.md` / `pr-salvage-corpus.md` | Stale-PR salvage |
| `analyzer-fixtures.md` | Behavioral golden traces F1–F4 |

## Ranking fixtures (query → expected top docs)

### RAG-F1 — “How do I build the Base USDC EIP-681 transfer URI?”

| Rank | Expected doc | Why |
| --- | --- | --- |
| 1 | `workflows.md` | Canonical URI formulas + 6-decimal math |
| 2 | `examples.md` | Concrete invoice prompts with amounts |
| 3 | `analyzer-fixtures.md` | F1 preview fields (atomic, chainId, URI) |

### RAG-F2 — “Payer emailed a different payee address — should I switch?”

| Rank | Expected doc | Why |
| --- | --- | --- |
| 1 | `security.md` | Inbound mail cannot change payee |
| 2 | `analyzer-fixtures.md` | F3 reject inbound rewrite |
| 3 | `discussion-triage-fixtures.md` | Dispute ≠ informational “fix” |

### RAG-F3 — “validate.mjs says compatibility skill count must be 18”

| Rank | Expected doc | Why |
| --- | --- | --- |
| 1 | `ci-failures.md` | Verbatim failure matrix + fix |
| 2 | `pr-salvage-corpus.md` | Review-thread salvage after CI red |
| 3 | `SKILL.md` | Frontmatter / wiring context |

### RAG-F4 — “Install this skill in Claude Code / Zed / dmux”

| Rank | Expected doc | Why |
| --- | --- | --- |
| 1 | `harness-audit.md` | Adapter matrix + audit checklist |
| 2 | `harness-compat.md` | Same matrix twin |
| 3 | `harness.md` | Narrative per-client notes |

### RAG-F5 — “Thread silent 3 days after invoice send”

| Rank | Expected doc | Why |
| --- | --- | --- |
| 1 | `discussion-triage-fixtures.md` | FIX-DT-3 no-response |
| 2 | `discussion-triage.md` | Label table |
| 3 | `examples.md` | Anti-spam / approval norms |

## Evaluator pass criteria

- Top-1 doc for each fixture matches the table (ties OK if both listed in top-2).
- No retrieval result may invent wallet-broadcast tools or claim Mermail send ≡ on-chain receipt.
- Fixtures stay inside `skills/mermail-base-usdc-invoice/`; do **not** add a fabricated `src/analyzers/fixtures/evaluator-rag-corpus.ts`.

## Out of scope

Repo-host deep analyzer / TypeScript RAG evaluator trees belong in analyzer hosts, not this Mermail skill. Inventing them would not validly exercise invoice behavior and is omitted on purpose.
