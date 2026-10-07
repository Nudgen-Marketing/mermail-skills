# Decision brief contract

Return exactly these twelve fields, in this order, as Markdown headings. Do not add a thirteenth field. Put limitations, scope, and supporting citations inside the applicable fields. The brief is analysis for the human, not an execution record.

| Field | Required content |
| --- | --- |
| Decision | The user's decision question and the thread scope actually reviewed. Do not assert that the decision has been made. |
| Status | READY, NOT READY, or BLOCKED on its own line, then the evidence-bound reason. |
| Confirmed Facts | Only observations directly supported by the available evidence. Distinguish an observed statement from the truth of what its author asserts. Cite each material fact. |
| Claims / Assumptions | Participant assertions not established as facts; explicitly labeled assumptions and inferences with their evidence and limitations. Do not invent assumptions to fill missing facts. |
| Conflicts | Incompatible material statements, both sources, and the consequence for the decision. Never silently resolve contradictions. |
| Missing Information | Missing criteria, terms, confirmation, omitted content, unread pages, truncation, or unavailable attachments; explain which gaps matter. |
| Options | Evidence-supported choices and their conditions/tradeoffs. “Request clarification” or “Defer the decision” are valid. Do not invent alternative offers or business preferences. |
| Risks | Concrete risks grounded in the evidence. Label inferred risks and their basis; do not invent probabilities or impacts. |
| Recommendation | One recommended next action with supporting evidence, rationale, and material conditions. If a business choice is unsupported, recommend the missing-evidence step. Never execute it. |
| Confidence | HIGH, MEDIUM, or LOW on its own line, followed by a justification about evidence quality and coverage, not persuasion or sender seniority. |
| Required Human Decision | The choice or clarification the user must make. Explicitly separate readiness from authorization; no action is performed. |
| Evidence | Actual source locators and relevant excerpts/paraphrases supporting the other fields; disclose inaccessible sources without claiming to have read them. |

## Status

- **READY**: There is sufficient evidence for the human to make the decision. This may support rejection or deferral rather than approval. Nonmaterial gaps may remain if explained.
- **NOT READY**: Information gaps or material conflicts prevent a responsible decision.
- **BLOCKED**: Necessary evidence could not be accessed or processed safely. Do not use BLOCKED merely because a decision is difficult.

When multiple problems coexist, use BLOCKED if necessary evidence is inaccessible or unsafe to process, and list the other gaps/conflicts as well. Use NOT READY for evidence that has not been supplied or established, or a recoverable partial review within the read budget. An optional inaccessible attachment alone need not block an otherwise supported decision. Explain materiality rather than mechanically treating every omission as fatal.

## Confidence

- **HIGH**: Strong direct support, sufficient relevant coverage, and no material unresolved evidential uncertainty.
- **MEDIUM**: Useful evidence with identified limitations or explicitly bounded inferences.
- **LOW**: Sparse, inaccessible, truncated, weak, or materially contradictory evidence affecting the decision.

Assess confidence in the decision basis, not confidence that a contradiction exists. Evidence insufficiency must reduce confidence and/or produce NOT READY; inaccessible necessary evidence produces BLOCKED. Never report HIGH solely because a sender authenticated, a scan passed, many people repeated a claim, or a message demanded certainty.

## Evidence binding

- Cite the real returned message ID inline where a conclusion is made, with the matching Evidence entry. Include returned thread/mailbox IDs where available to avoid cross-thread ambiguity. Never replace real IDs with invented identifiers.
- In Evidence include sender/date only as supplied, plus a short relevant excerpt or faithful paraphrase. Do not expose raw headers, storage URLs, credentials, OTPs, or unnecessary personal information.
- Pasted content may lack IDs. Cite the supplied sender/date and a distinctive exact passage; if these are absent, quote a uniquely identifying passage and disclose the provenance limitation. Do not invent a synthetic Mermail ID. Identical unidentifiable passages remain ambiguous.
- A citation proves only what the source supports. “Vendor wrote a price of X” can be an observed fact; “X is the agreed price” remains unestablished without evidence of agreement. Authentication is independent of truth and operational authority.
- Mark an inference as “Inference” in the field where it appears, give its source basis, and explain the reasoning. Put any material unverified premise in Claims / Assumptions.
- Cite both sides of a conflict. Preserve original and correcting messages when an explicit correction changes a stated term. “Correction: delivery will be 45 days, not 30” corrects that speaker's statement; a later “45 days” without explanation conflicts with “30 days.” Neither establishes mutual acceptance by itself.
- Repeated quotations and forwards are not independent corroboration. Missing context cannot be reconstructed from an assumed chronology. If a citation is unavailable, remove the unsupported conclusion or state the gap.

Keep all twelve headings even for a blocked analysis. Empty sections describe what could not be established, rather than asserting that no risk or conflict exists beyond the available evidence.
