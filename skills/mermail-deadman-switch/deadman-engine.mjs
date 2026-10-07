/**
 * Dead Man's Switch Engine
 * Autonomous contingency, digital inheritance, and asset rescue engine.
 * Periodically monitors Proof-of-Life heartbeats from the owner. If the
 * grace period expires after unacknowledged warnings, irrevocably triggers
 * the contingency protocol and releases directives/funds to authorized beneficiaries.
 */

function extractEmailAddress(sender) {
  if (!sender || typeof sender !== "string") return "";
  const match = sender.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return sender.trim().toLowerCase();
}

export class DeadMansSwitchEngine {
  constructor(config = {}) {
    this.custodianEmail = config.custodianEmail;
    this.ownerEmail = config.ownerEmail;
    this.beneficiaryEmail = config.beneficiaryEmail;
    this.beneficiarySolWallet = config.beneficiarySolWallet;

    // Contingency switch configuration and internal state
    this.state = {
      id: config.id || "DMS-VAULT-2026-XEN",
      status: config.status || "ARMED", // ARMED | WARNING_ISSUED | TRIGGERED | DISARMED
      lastHeartbeatAt: config.lastHeartbeatAt || new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // Default: simulated 35 days ago
      heartbeatIntervalDays: config.heartbeatIntervalDays ?? 30, // Mandatory check-in every 30 days
      gracePeriodHours: config.gracePeriodHours ?? 48,           // 48 hours of grace period following warning
      warningIssuedAt: config.warningIssuedAt || null,
      triggeredAt: config.triggeredAt || null,
      contingencyDirectives: {
        encryptedSecretVaultId: "VAULT_SHAMIR_SECRET_SHARE_001_AES256",
        emergencyRescueSolAmount: 0.05, // Controlled rescue micro-transfer (0.05 SOL)
        finalNoticeSubject: "[CONTINGENCY ACTIVATION] Dead Man's Switch Protocol Executed",
        warningNoticeSubject: "[URGENT] Proof of Life Check-in - Dead Man's Switch"
      }
    };
  }

  // Audits incoming email to determine if owner emitted a valid "Proof of Life"
  auditOwnerHeartbeat(email) {
    if (!email) return false;

    // CRITICAL INVARIANT: Once TRIGGERED, execution is irrevocable and cannot be re-armed
    if (this.state.status === "TRIGGERED") {
      return false;
    }

    // STRICT SENDER VERIFICATION: Prevents spoofing and substring bypasses
    const cleanSender = extractEmailAddress(email.sender);
    const expectedOwner = (this.ownerEmail || "").trim().toLowerCase();
    const isFromOwner = cleanSender.length > 0 && cleanSender === expectedOwner;
    if (!isFromOwner) return false;

    const content = `${email.subject || ""} ${email.body || email.text || ""}`;
    const isHeartbeat = /(\[check-in\]|\[heartbeat\]|\[proof-of-life\]|alive|check-in|heartbeat|active|still here|i am fine|estoy bien)/i.test(content);

    if (isHeartbeat) {
      this.state.lastHeartbeatAt = new Date().toISOString();
      this.state.warningIssuedAt = null;
      this.state.status = "ARMED";
      return true;
    }
    return false;
  }

  // Evaluates switch status against reference time using deterministic 4-state machine
  evaluateSwitchStatus(referenceDate = new Date()) {
    const now = new Date(referenceDate);
    const lastCheckin = new Date(this.state.lastHeartbeatAt);
    const daysSinceLast = (now - lastCheckin) / (1000 * 60 * 60 * 24);
    const gracePeriodDays = (this.state.gracePeriodHours || 48) / 24;
    const intervalDays = this.state.heartbeatIntervalDays;
    const triggerThresholdDays = intervalDays + gracePeriodDays;

    // If already triggered, irrevocably lock in TRIGGERED
    if (this.state.status === "TRIGGERED") {
      return {
        status: "TRIGGERED",
        isTriggered: true,
        isWarning: false,
        daysOverdue: Math.max(0, Math.round(daysSinceLast - triggerThresholdDays)),
        lastHeartbeat: this.state.lastHeartbeatAt,
        actionRequired: "EXECUTE_CONTINGENCY_PROTOCOL"
      };
    }

    // 1. Exceeded interval + entire grace period -> TRIGGERED (Irrevocable)
    if (daysSinceLast > triggerThresholdDays) {
      this.state.status = "TRIGGERED";
      if (!this.state.triggeredAt) {
        this.state.triggeredAt = now.toISOString();
      }
      return {
        status: "TRIGGERED",
        isTriggered: true,
        isWarning: false,
        daysOverdue: Math.round(daysSinceLast - triggerThresholdDays),
        lastHeartbeat: this.state.lastHeartbeatAt,
        actionRequired: "EXECUTE_CONTINGENCY_PROTOCOL"
      };
    }

    // 2. Exceeded interval but still within grace window -> WARNING_ISSUED
    if (daysSinceLast > intervalDays) {
      this.state.status = "WARNING_ISSUED";
      if (!this.state.warningIssuedAt) {
        this.state.warningIssuedAt = now.toISOString();
      }
      const graceHoursRemaining = Math.max(0, Math.round((triggerThresholdDays - daysSinceLast) * 24));
      return {
        status: "WARNING_ISSUED",
        isTriggered: false,
        isWarning: true,
        daysOverdue: Math.round(daysSinceLast - intervalDays),
        graceHoursRemaining,
        lastHeartbeat: this.state.lastHeartbeatAt,
        actionRequired: "ISSUE_WARNING_NOTICE"
      };
    }

    // 3. Regular active operation within interval -> ARMED
    this.state.status = "ARMED";
    return {
      status: "ARMED",
      isTriggered: false,
      isWarning: false,
      daysRemaining: Math.round(intervalDays - daysSinceLast),
      lastHeartbeat: this.state.lastHeartbeatAt,
      actionRequired: "STANDBY"
    };
  }
}
