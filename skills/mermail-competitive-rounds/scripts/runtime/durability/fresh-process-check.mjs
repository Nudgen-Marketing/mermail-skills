import { verifyJournal } from "./verifier.mjs";
import { readOnlyState } from "./journal.mjs";
import { canonicalize } from "./canonical.mjs";

const root = process.argv[2];
const sourcing_id = process.argv[3];
if (!root || !sourcing_id) process.exit(2);
const verification = await verifyJournal(root, { sourcing_id });
const current = verification.outcome === "VALID_CURRENT_HEAD" || verification.outcome === "CHECKPOINT_LAG"
  ? await readOnlyState(root, { sourcing_id })
  : null;
process.stdout.write(canonicalize({
  verification: {
    outcome: verification.outcome,
    event_count: verification.event_count ?? current?.events.length ?? null,
    head_event_digest: verification.head_event_digest ?? verification.journal_head_event_digest ?? current?.state.journal.head_event_digest ?? null,
    state_digest: verification.state_digest ?? current?.state.state_digest ?? null,
  },
  state: current ? current.state : null,
}));
