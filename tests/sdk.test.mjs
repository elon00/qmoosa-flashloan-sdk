import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  FlashLoanClient,
  BaseFlashBorrower,
  generateKeyPair,
  signAdminIntent,
  ERC3156_CALLBACK_SUCCESS
} from "../dist/index.js";

class MockEngine {
  constructor() {
    this.reserves = new Map([
      ["USDC", { token: "USDC", totalLiquidity: 5_000_000n, totalShares: 5_000_000n, feeBps: 9n, isPaused: false }]
    ]);
    this.adminIntents = [];
  }

  getReserve(t) { return this.reserves.get(t); }
  getAllReserves() { return Array.from(this.reserves.values()); }
  maxFlashLoan(t) { return this.reserves.get(t)?.totalLiquidity || 0n; }
  flashFee(t, a) { return (a * 9n + 9999n) / 10000n; }
  depositLiquidity(u, t, a) {
    const r = this.reserves.get(t);
    r.totalLiquidity += a;
    r.totalShares += a;
    return { shares: a, totalLiquidity: r.totalLiquidity };
  }
  withdrawLiquidity(u, t, s) {
    const r = this.reserves.get(t);
    r.totalLiquidity -= s;
    r.totalShares -= s;
    return { amount: s, remainingShares: 0n };
  }
  async flashLoan(receiver, token, amount, data, options) {
    const fee = this.flashFee(token, amount);
    const ret = await receiver.onFlashLoan(options?.initiator || "0xInit", token, amount, fee, data);
    if (ret !== ERC3156_CALLBACK_SUCCESS) throw new Error("ERC3156_CALLBACK_FAILED");
    return {
      txId: "tx_mock_123",
      token,
      receiver: receiver.address,
      amount,
      fee,
      poolFeeAccrued: (fee * 7000n) / 10000n,
      protocolFeeAccrued: (fee * 3000n) / 10000n,
      timestamp: Date.now(),
      success: true
    };
  }
  executeAdminIntent(i) {
    this.adminIntents.push(i);
  }
}

class TestArbitrageBorrower extends BaseFlashBorrower {
  constructor() {
    super("0xArbitrageBot");
    this.executed = false;
  }

  async executeOperation(initiator, token, amount, fee, data) {
    assert.equal(token, "USDC");
    assert.equal(amount, 1_000_000n);
    this.executed = true;
  }
}

test("1. Keypair generation and signed admin intent builder", () => {
  const { publicKey, privateKey } = generateKeyPair();
  assert.ok(publicKey.includes("BEGIN PUBLIC KEY"));
  assert.ok(privateKey.includes("BEGIN PRIVATE KEY"));

  const intent = signAdminIntent(
    "SET_FEE_BPS",
    { token: "USDC", feeBps: 15 },
    1,
    Math.floor(Date.now() / 1000) + 60,
    "QMOOSA:FLASHLOAN:31337",
    privateKey
  );

  assert.equal(intent.action, "SET_FEE_BPS");
  assert.equal(intent.params.feeBps, 15);
  assert.ok(intent.signature.length > 20);
});

test("2. BaseFlashBorrower execution and callback success hash", async () => {
  const borrower = new TestArbitrageBorrower();
  const hash = await borrower.onFlashLoan("0xAllowedTrader", "USDC", 1_000_000n, 900n, "");

  assert.equal(hash, ERC3156_CALLBACK_SUCCESS);
  assert.equal(borrower.executed, true);
});

test("3. BaseFlashBorrower initiator access control", async () => {
  const borrower = new TestArbitrageBorrower();
  borrower.allowInitiator("0xWhitelistedTrader");

  // Valid initiator
  const hash = await borrower.onFlashLoan("0xWhitelistedTrader", "USDC", 1_000_000n, 900n, "");
  assert.equal(hash, ERC3156_CALLBACK_SUCCESS);

  // Untrusted initiator
  await assert.rejects(
    () => borrower.onFlashLoan("0xAttacker", "USDC", 1_000_000n, 900n, ""),
    /Untrusted initiator/
  );
});

test("4. FlashLoanClient deposit, preview, execution, and admin intents", async () => {
  const mockEngine = new MockEngine();
  const client = new FlashLoanClient(mockEngine, 31337);

  // Preview & queries
  assert.equal(client.getMaxFlashLoan("USDC"), 5_000_000n);
  assert.equal(client.getFlashFee("USDC", 1_000_000n), 900n);

  // Deposit
  const dep = client.deposit("0xLp", "USDC", 500_000n);
  assert.equal(dep.shares, 500_000n);
  assert.equal(dep.totalLiquidity, 5_500_000n);

  // Flash loan execution
  const borrower = new TestArbitrageBorrower();
  const receipt = await client.flashLoan(borrower, "USDC", 1_000_000n, "0xArbitragePayload");
  assert.equal(receipt.success, true);
  assert.equal(receipt.fee, 900n);

  // Admin intent dispatch
  const { privateKey } = generateKeyPair();
  client.signAndExecuteAdminIntent("SET_FEE_BPS", { token: "USDC", feeBps: 20 }, privateKey);
  assert.equal(mockEngine.adminIntents.length, 1);
  assert.equal(mockEngine.adminIntents[0].action, "SET_FEE_BPS");
});
