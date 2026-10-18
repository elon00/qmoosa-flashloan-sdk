import {
  IERC3156FlashBorrower,
  FlashLoanReceipt,
  PoolReserveView,
  AdminActionType,
  SignedAdminIntent
} from "./types.js";
import { signAdminIntent } from "./crypto.js";

export interface EngineAdapter {
  getReserve(token: string): any;
  getAllReserves(): any[];
  maxFlashLoan(token: string): bigint;
  flashFee(token: string, amount: bigint): bigint;
  depositLiquidity(user: string, token: string, amount: bigint): { shares: bigint; totalLiquidity: bigint };
  withdrawLiquidity(user: string, token: string, shares: bigint): { amount: bigint; remainingShares: bigint };
  flashLoan(
    receiver: IERC3156FlashBorrower,
    token: string,
    amount: bigint,
    data?: string,
    options?: any
  ): Promise<FlashLoanReceipt>;
  executeAdminIntent(intent: SignedAdminIntent): void;
}

export class FlashLoanClient {
  private readonly engine: EngineAdapter;
  private readonly chainId: number;
  private lastNonce: number = 0;

  constructor(engine: EngineAdapter, chainId: number = 31337) {
    this.engine = engine;
    this.chainId = chainId;
  }

  public getReserve(token: string): PoolReserveView | undefined {
    return this.engine.getReserve(token);
  }

  public getAllReserves(): PoolReserveView[] {
    return this.engine.getAllReserves();
  }

  public getMaxFlashLoan(token: string): bigint {
    return this.engine.maxFlashLoan(token);
  }

  public getFlashFee(token: string, amount: bigint): bigint {
    return this.engine.flashFee(token, amount);
  }

  public deposit(user: string, token: string, amount: bigint): { shares: bigint; totalLiquidity: bigint } {
    return this.engine.depositLiquidity(user, token, amount);
  }

  public withdraw(user: string, token: string, shares: bigint): { amount: bigint; remainingShares: bigint } {
    return this.engine.withdrawLiquidity(user, token, shares);
  }

  public async flashLoan(
    receiver: IERC3156FlashBorrower,
    token: string,
    amount: bigint,
    data: string = "",
    options?: { initiator?: string; simulateRepayment?: (repayAmount: bigint) => Promise<boolean> | boolean }
  ): Promise<FlashLoanReceipt> {
    return this.engine.flashLoan(receiver, token, amount, data, options);
  }

  public signAndExecuteAdminIntent(
    action: AdminActionType,
    params: Record<string, any>,
    privateKeyPem: string,
    nonce?: number,
    deadline?: number
  ): SignedAdminIntent {
    const nextNonce = nonce !== undefined ? nonce : ++this.lastNonce;
    const expiry = deadline !== undefined ? deadline : Math.floor(Date.now() / 1000) + 3600;
    const domain = `QMOOSA:FLASHLOAN:${this.chainId}`;

    const intent = signAdminIntent(action, params, nextNonce, expiry, domain, privateKeyPem);
    this.engine.executeAdminIntent(intent);
    return intent;
  }
}
