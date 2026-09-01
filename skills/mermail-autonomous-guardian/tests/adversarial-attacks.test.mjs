import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  decodeBase58,
  encodeBase58,
  isValidSolanaAddress,
  canonicalizeJson,
  verifyEd25519Signature,
  encryptPayload,
  decryptPayload,
  validateRpcEndpoint,
  MermailEngine,
  MERMAIL_TOOLS,
  DEFAULT_SAFETY_POLICY,
} from '../mcp-server.mjs';

describe('⚔️ Gauntlet Adversarial & Attack Simulation Suite', () => {
  let engine;

  function generateTestEd25519Keypair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
    const pubB58 = encodeBase58(rawPub);
    return { publicKey, privateKey, rawPub, pubB58 };
  }

  beforeEach(() => {
    engine = new MermailEngine({
      safetyPolicy: {
        maxSolPerTx: 1.0,
        maxUsdcPerTx: 100.0,
        dailySpendCapSol: 5.0,
        dailySpendCapUsdc: 500.0,
      },
    });
  });

  describe('Attack Vector 1: Replay & Double-Spend Attempts', () => {
    test('intercepts and blocks duplicate signature reuse within the validity window', async () => {
      const { privateKey, pubB58 } = generateTestEd25519Keypair();
      const task = { job: 'claim_bounty_payout', bounty_id: 404, amount_usdc: 50 };
      const canonical = canonicalizeJson(task);
      const sigBuf = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey);
      const sigB58 = encodeBase58(sigBuf);
      const freshTimestamp = Date.now() - 2000;

      const legitRes = await engine.handleTaskVerify({
        task_payload: task,
        signature: sigB58,
        public_key: pubB58,
        timestamp: freshTimestamp,
      });
      assert.equal(legitRes.valid, true);

      const replayRes = await engine.handleTaskVerify({
        task_payload: task,
        signature: sigB58,
        public_key: pubB58,
        timestamp: freshTimestamp,
      });

      assert.equal(replayRes.valid, false);
      assert.equal(replayRes.freshness_check, 'REPLAY_DETECTED');
      assert.ok(replayRes.error_reason.includes('Replay attack blocked'));
    });

    test('blocks expired task envelopes with timestamp spoofing', async () => {
      const { privateKey, pubB58 } = generateTestEd25519Keypair();
      const task = { job: 'delayed_drain', amount: 100 };
      const canonical = canonicalizeJson(task);
      const sigBuf = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey);
      const sigB58 = encodeBase58(sigBuf);

      const expiredRes = await engine.handleTaskVerify({
        task_payload: task,
        signature: sigB58,
        public_key: pubB58,
        timestamp: Date.now() - 600000,
        max_age_seconds: 300,
      });

      assert.equal(expiredRes.valid, false);
      assert.equal(expiredRes.freshness_check, 'EXPIRED');
    });
  });

  describe('Attack Vector 2: Balance Drain & Overspending Exploits', () => {
    test('blocks single transactions exceeding per-tx safety ceiling', async () => {
      const recipient = '7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A';

      const drainAttempt = await engine.handleWalletTransfer({
        recipient_address: recipient,
        amount: 250.0,
        token: 'USDC',
        simulate_only: true,
      });

      assert.equal(drainAttempt.simulation_status, 'REJECTED');
      assert.equal(drainAttempt.executed, false);
      assert.equal(drainAttempt.safety_checks.within_single_tx_limit, false);
      assert.ok(drainAttempt.error.includes('exceeds per-tx limit'));
    });

    test('blocks rapid consecutive transactions that attempt to drain daily allowance', async () => {
      const recipient = '7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A';

      for (let i = 0; i < 5; i++) {
        const tx = await engine.handleWalletTransfer({
          recipient_address: recipient,
          amount: 100.0,
          token: 'USDC',
          simulate_only: false,
        });
        assert.equal(tx.simulation_status, 'SUCCESS');
      }

      const overCapAttempt = await engine.handleWalletTransfer({
        recipient_address: recipient,
        amount: 1.0,
        token: 'USDC',
        simulate_only: false,
      });

      assert.equal(overCapAttempt.simulation_status, 'REJECTED');
      assert.equal(overCapAttempt.executed, false);
      assert.equal(overCapAttempt.safety_checks.within_daily_limit, false);
      assert.ok(overCapAttempt.error.includes('exceeds daily cap'));
    });
  });

  describe('Attack Vector 3: Numeric Overflow, Negative Amount & NaN Injections', () => {
    test('rejects negative transfer amount exploits', async () => {
      const recipient = '7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A';

      const negativeAttempt = await engine.handleWalletTransfer({
        recipient_address: recipient,
        amount: -100.0,
        token: 'USDC',
      });

      assert.equal(negativeAttempt.simulation_status, 'REJECTED');
      assert.ok(negativeAttempt.error.includes('positive finite number'));
    });

    test('rejects zero amount transfers', async () => {
      const recipient = '7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A';

      const zeroAttempt = await engine.handleWalletTransfer({
        recipient_address: recipient,
        amount: 0,
        token: 'SOL',
      });

      assert.equal(zeroAttempt.simulation_status, 'REJECTED');
    });

    test('rejects NaN and Infinity injections without throwing unhandled exceptions', async () => {
      const recipient = '7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A';

      const nanRes = await engine.handleWalletTransfer({
        recipient_address: recipient,
        amount: NaN,
        token: 'SOL',
      });
      assert.equal(nanRes.simulation_status, 'REJECTED');

      const infRes = await engine.handleWalletTransfer({
        recipient_address: recipient,
        amount: Infinity,
        token: 'SOL',
      });
      assert.equal(infRes.simulation_status, 'REJECTED');
    });
  });

  describe('Attack Vector 4: Cryptographic Forgery & Corrupted Signatures', () => {
    test('detects single-bit signature corruption and rejects authorization', () => {
      const { privateKey, pubB58 } = generateTestEd25519Keypair();
      const payload = { task: 'authorized_operation', level: 'admin' };
      const canonical = canonicalizeJson(payload);
      const sigBuf = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey);

      sigBuf[0] ^= 0xff;
      const corruptedSigB58 = encodeBase58(sigBuf);

      const isValid = verifyEd25519Signature(payload, corruptedSigB58, pubB58);
      assert.equal(isValid, false);
    });

    test('rejects forged public keys claiming ownership of signatures', () => {
      const legitimate = generateTestEd25519Keypair();
      const attacker = generateTestEd25519Keypair();

      const payload = { task: 'transfer_ownership' };
      const canonical = canonicalizeJson(payload);
      const sigBuf = crypto.sign(null, Buffer.from(canonical, 'utf8'), attacker.privateKey);
      const attackerSigB58 = encodeBase58(sigBuf);

      const isForgedValid = verifyEd25519Signature(payload, attackerSigB58, legitimate.pubB58);
      assert.equal(isForgedValid, false);
    });
  });

  describe('Attack Vector 5: Phishing Addresses & Malformed Base58 Inputs', () => {
    test('rejects addresses containing non-Base58 characters (0, O, I, l)', () => {
      assert.equal(isValidSolanaAddress('0OIl111111111111111111111111111111111111111'), false);
      assert.equal(isValidSolanaAddress('7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC90'), false);
      assert.equal(isValidSolanaAddress('7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9O'), false);
      assert.equal(isValidSolanaAddress('7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9I'), false);
    });

    test('rejects truncated or oversized public key strings', () => {
      assert.equal(isValidSolanaAddress('short'), false);
      assert.equal(isValidSolanaAddress('A'.repeat(100)), false);
      assert.equal(isValidSolanaAddress(''), false);
    });
  });

  describe('Attack Vector 6: Prototype Pollution & Injection Attacks', () => {
    test('canonicalizeJson strips dangerous __proto__, constructor, and prototype keys', () => {
      const maliciousPayload = JSON.parse(
        '{"__proto__": {"admin": true}, "constructor": {"prototype": {"polluted": true}}, "task": "safe_task"}'
      );

      const canonical = canonicalizeJson(maliciousPayload);
      assert.ok(!canonical.includes('__proto__'));
      assert.ok(!canonical.includes('constructor'));
      assert.ok(canonical.includes('"task":"safe_task"'));

      const cleanObj = {};
      assert.equal(cleanObj.admin, undefined);
      assert.equal(cleanObj.polluted, undefined);
    });
  });

  describe('Attack Vector 7: Mass Concurrency & Race Condition Stress', () => {
    test('handles 50 parallel requests cleanly without race condition data corruption', async () => {
      const recipient = '7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A';

      const parallelPromises = [];
      for (let i = 0; i < 50; i++) {
        parallelPromises.push(
          engine.handleWalletTransfer({
            recipient_address: recipient,
            amount: 1.0,
            token: 'USDC',
            simulate_only: true,
          })
        );
      }

      const results = await Promise.all(parallelPromises);
      assert.equal(results.length, 50);
      results.forEach((res) => {
        assert.equal(res.simulation_status, 'SUCCESS');
        assert.ok(res.audit_trail_id);
      });
    });
  });

  describe('Attack Vector 8: SSRF (Server-Side Request Forgery) & Cloud Metadata Defense', () => {
    test('blocks AWS cloud metadata (169.254.169.254) in public network modes', () => {
      assert.throws(
        () => validateRpcEndpoint('http://169.254.169.254/latest/meta-data', 'devnet'),
        /SSRF Blocked/
      );
      assert.throws(
        () => validateRpcEndpoint('http://169.254.169.254/latest/meta-data', 'mainnet-beta'),
        /SSRF Blocked/
      );
    });

    test('blocks internal RFC 1918 private IP subnets and localhost in devnet mode', () => {
      assert.throws(() => validateRpcEndpoint('http://10.0.0.1:8899', 'devnet'), /SSRF Blocked/);
      assert.throws(() => validateRpcEndpoint('http://172.16.0.5:8899', 'devnet'), /SSRF Blocked/);
      assert.throws(() => validateRpcEndpoint('http://192.168.1.1:8899', 'devnet'), /SSRF Blocked/);
      assert.throws(() => validateRpcEndpoint('http://localhost:8899', 'devnet'), /SSRF Blocked/);
      assert.throws(() => validateRpcEndpoint('http://127.0.0.1:8899', 'devnet'), /SSRF Blocked/);
    });

    test('allows localhost specifically when network is localnet', () => {
      const allowed = validateRpcEndpoint('http://127.0.0.1:8899', 'localnet');
      assert.equal(allowed, 'http://127.0.0.1:8899');
    });

    test('rejects non-HTTP protocols (file://, gopher://, ftp://)', () => {
      assert.throws(() => validateRpcEndpoint('file:///etc/passwd', 'devnet'), /Invalid RPC URL protocol/);
      assert.throws(() => validateRpcEndpoint('gopher://127.0.0.1:70', 'devnet'), /Invalid RPC URL protocol/);
    });
  });

  describe('Attack Vector 9: GCM Cryptographic Nonce & Tag Tampering Defense', () => {
    test('rejects corrupted or truncated 96-bit nonce in AES-256-GCM envelope', () => {
      const secret = 'institutional-master-key-32-bytes!';
      const encrypted = encryptPayload({ data: 'top_secret' }, secret);

      const badEnvelope = {
        ...encrypted,
        iv: Buffer.from(crypto.randomBytes(8)).toString('base64'),
      };

      assert.throws(
        () => decryptPayload(badEnvelope, secret),
        /Invalid GCM nonce length/
      );
    });

    test('rejects corrupted auth tag in AES-256-GCM envelope', () => {
      const secret = 'institutional-master-key-32-bytes!';
      const encrypted = encryptPayload({ data: 'top_secret' }, secret);

      const badEnvelope = {
        ...encrypted,
        tag: Buffer.from(crypto.randomBytes(16)).toString('base64'),
      };

      assert.throws(
        () => decryptPayload(badEnvelope, secret),
        /Unsupported state or unable to authenticate data/
      );
    });
  });
});