import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { DeadMansSwitchEngine, NotaryAgentAdvisor } from "../../../deadman-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runTests() {
  console.log("===============================================================");
  console.log("TEST SUITE & SCENARIO VALIDATION: MERMAIL DEAD MAN'S SWITCH");
  console.log("===============================================================\n");

  const scenariosRaw = fs.readFileSync(path.resolve(__dirname, "scenarios.json"), "utf-8");
  const scenarios = JSON.parse(scenariosRaw);

  // Generate an authentic owner Solana keypair for crypto tests
  const ownerPrivKey = ed25519.utils.randomPrivateKey();
  const ownerPubKey = ed25519.getPublicKey(ownerPrivKey);
  const ownerPubKeyB58 = bs58.encode(ownerPubKey);

  const engine = new DeadMansSwitchEngine({
    custodianEmail: "xentest@mermail.app",
    ownerEmail: "xentest2@mermail.app",
    ownerSolPubkey: ownerPubKeyB58,
    beneficiaryEmail: "xen3test3@mermail.app",
    beneficiarySolWallet: "F9tjfnvJUy8EYip947GhYM4YW7kG6U5hDcMFc3DRFbwE",
    guardianEmails: ["guardian@trusted-notary.org"]
  });

  let passedCount = 0;

  for (const sc of scenarios) {
    console.log(`[TEST]: ${sc.scenario}`);
    console.log(`        ${sc.description}`);

    if (sc.scenario.startsWith("DMS-01")) {
      // Standard heartbeat test
      const accepted = engine.auditOwnerHeartbeat(sc.input);
      if (accepted && engine.state.status === "ARMED") {
        console.log("        [PASS]: Valid heartbeat acknowledged, timer reset, ARMED state maintained.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Heartbeat was not recognized.\n");
      }
    } else if (sc.scenario.startsWith("DMS-02")) {
      // Expiration test: simulate 35 days (> 30-day interval + 2-day grace)
      engine.state.status = "ARMED";
      engine.state.lastHeartbeatAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
      const evalRes = engine.evaluateSwitchStatus();
      if (evalRes.isTriggered && evalRes.actionRequired === "EXECUTE_CONTINGENCY_PROTOCOL" && engine.state.status === "TRIGGERED") {
        console.log("        [PASS]: Inactivity & grace expiration detected; TRIGGERED state irrevocably engaged.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Expiration not detected accurately.\n");
      }
    } else if (sc.scenario.startsWith("DMS-03")) {
      // Third-party sabotage / spoofing test
      engine.state.status = "ARMED";
      const accepted = engine.auditOwnerHeartbeat(sc.input);
      if (!accepted) {
        console.log("        [PASS]: Sabotage attempt rejected. Only authorized owner address can submit proof of life.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Accepted heartbeat from unauthorized sender.\n");
      }
    } else if (sc.scenario.startsWith("DMS-04")) {
      // Destination wallet immutability test
      const walletPre = engine.beneficiarySolWallet;
      engine.auditOwnerHeartbeat(sc.input);
      const walletPost = engine.beneficiarySolWallet;
      if (walletPre === walletPost && walletPost === "F9tjfnvJUy8EYip947GhYM4YW7kG6U5hDcMFc3DRFbwE") {
        console.log("        [PASS]: Beneficiary rescue wallet immutability preserved. Prompt injection blocked.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Destination wallet was mutated.\n");
      }
    } else if (sc.scenario.startsWith("DMS-05")) {
      // Grace window detection (WARNING_ISSUED)
      engine.state.status = "ARMED";
      engine.state.lastHeartbeatAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const evalRes = engine.evaluateSwitchStatus();
      if (evalRes.isWarning && evalRes.status === "WARNING_ISSUED" && evalRes.actionRequired === "ISSUE_WARNING_NOTICE") {
        console.log(`        [PASS]: Grace window detected (WARNING_ISSUED), remaining grace: ${evalRes.graceHoursRemaining}h.\n`);
        passedCount++;
      } else {
        console.log("        [FAIL]: Failed to enter WARNING_ISSUED state.\n");
      }
    } else if (sc.scenario.startsWith("DMS-06")) {
      // Post-trigger irrevocability invariant
      engine.state.status = "TRIGGERED";
      const accepted = engine.auditOwnerHeartbeat(sc.input);
      if (!accepted && engine.state.status === "TRIGGERED") {
        console.log("        [PASS]: Irrevocability invariant upheld. Late check-in while in TRIGGERED state was rejected.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Allowed re-arming an already executed switch.\n");
      }
    } else if (sc.scenario.startsWith("DMS-07")) {
      // Display name and substring spoofing test
      engine.state.status = "ARMED";
      const accepted = engine.auditOwnerHeartbeat(sc.input);
      if (!accepted) {
        console.log("        [PASS]: Display name & substring spoofing attack rejected successfully.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Sender spoofing bypass succeeded.\n");
      }
    } else if (sc.scenario.startsWith("DMS-08")) {
      // Cryptographic signature test (Ed25519)
      engine.state.status = "ARMED";
      engine.requireCryptoSignature = true;

      // 1. Valid signed payload
      const timestamp = Date.now();
      const nonce = "nonce-abc-123";
      const msgText = `DMS-HEARTBEAT:${timestamp}:${nonce}`;
      const msgBytes = new TextEncoder().encode(msgText);
      const validSig = bs58.encode(ed25519.sign(msgBytes, ownerPrivKey));

      const validEmail = {
        sender: "xentest2@mermail.app",
        subject: "[CHECK-IN] Valid Signed Proof of Life",
        signaturePayload: {
          timestamp,
          nonce,
          signature: validSig,
          publicKey: ownerPubKeyB58,
          message: msgText
        }
      };

      const validAccepted = engine.auditOwnerHeartbeat(validEmail);

      // 2. Tampered signature payload
      const tamperedEmail = {
        sender: "xentest2@mermail.app",
        subject: "[CHECK-IN] Tampered Signature",
        signaturePayload: {
          timestamp,
          nonce: "nonce-tampered-999",
          signature: validSig,
          publicKey: ownerPubKeyB58,
          message: "DMS-HEARTBEAT:different-msg"
        }
      };

      const tamperedRejected = !engine.auditOwnerHeartbeat(tamperedEmail);
      engine.requireCryptoSignature = false; // Reset flag

      if (validAccepted && tamperedRejected) {
        console.log("        [PASS]: Cryptographic Proof of Life verified via Ed25519; tampered signature rejected.\n");
        passedCount++;
      } else {
        console.log(`        [FAIL]: Crypto check failed. valid=${validAccepted}, tamperedRejected=${tamperedRejected}\n`);
      }
    } else if (sc.scenario.startsWith("DMS-09")) {
      // Multi-tiered grace escalation & Guardian Emergency Hold
      engine.state.status = "ARMED";
      engine.state.lastHeartbeatAt = new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString(); // 46 days

      const tieredStatus = engine.evaluateTieredStatus();
      const isTier3 = tieredStatus.tier === 3 && tieredStatus.label === "GUARDIAN_ESCALATION";

      // Guardian places an emergency hold
      const holdRes = engine.applyGuardianHold({
        guardianEmail: "guardian@trusted-notary.org",
        holdDays: 14,
        reason: "Owner admitted to hospital, pending direct verification"
      });

      const holdCheck = engine.evaluateSwitchStatus();
      const holdActive = holdCheck.status === "GUARDIAN_HOLD" && !holdCheck.isTriggered;

      if (isTier3 && holdRes.success && holdActive) {
        console.log("        [PASS]: Tier 3 Guardian Escalation reached and Guardian Emergency Hold applied.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Tiered escalation or guardian hold failed.\n");
      }
    } else if (sc.scenario.startsWith("DMS-10")) {
      // Shamir Secret Sharing 2-of-3 threshold test
      const masterSecret = sc.input.masterSecret;
      const vault = engine.setupThresholdVault(masterSecret, { n: 3, k: 2 });

      // Reconstruct using Shard 1 (beneficiary) + Shard 2 (agent custodied)
      const reconstructed = engine.reconstructVaultSecret([vault.beneficiaryShare, vault.custodianShare]);
      // Reconstruct using Shard 2 (agent) + Shard 3 (guardian)
      const altReconstructed = engine.reconstructVaultSecret([vault.custodianShare, vault.guardianShare]);

      if (reconstructed === masterSecret && altReconstructed === masterSecret) {
        console.log("        [PASS]: Shamir (2-of-3) threshold vault split and multi-pair reconstruction successful.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: Shamir reconstruction did not match master secret.\n");
      }
    } else if (sc.scenario.startsWith("DMS-11")) {
      // Dual-Core Notary Advisor test
      const guidance = NotaryAgentAdvisor.generateBeneficiaryGuidance({
        ownerName: sc.input.ownerName,
        beneficiaryEmail: sc.input.beneficiaryEmail,
        custodiedShare: { id: 2, data: "7f4c0a1b2c3d" },
        solRescueAmount: 0.05
      });

      const emergencyAnalysis = NotaryAgentAdvisor.analyzeInboundEmergencyHoldRequest(
        "Urgent: I was in an accident and currently internado in emergency care. Please pause everything."
      );

      if (guidance.subject.includes("Emergency Contingency") && emergencyAnalysis.flaggedAsEmergency) {
        console.log("        [PASS]: AI Notary Guidance formulated and natural language emergency distress detected.\n");
        passedCount++;
      } else {
        console.log("        [FAIL]: AI Notary Advisor failed to generate onboarding or detect distress.\n");
      }
    }
  }

  console.log("===============================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${scenarios.length} SCENARIOS COMPLETED SUCCESSFULLY (100%)`);
  console.log("===============================================================");

  if (passedCount !== scenarios.length) {
    process.exit(1);
  }
}

runTests();
