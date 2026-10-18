import { IERC3156FlashBorrower, ERC3156_CALLBACK_SUCCESS } from "./types.js";

export abstract class BaseFlashBorrower implements IERC3156FlashBorrower {
  public readonly address: string;
  protected allowedInitiators: Set<string> = new Set();

  constructor(address: string = "0xFlashBorrower") {
    this.address = address;
  }

  public allowInitiator(initiator: string): void {
    this.allowedInitiators.add(initiator.toLowerCase());
  }

  public async onFlashLoan(
    initiator: string,
    token: string,
    amount: bigint,
    fee: bigint,
    data: string
  ): Promise<string> {
    if (this.allowedInitiators.size > 0 && !this.allowedInitiators.has(initiator.toLowerCase())) {
      throw new Error(`Untrusted initiator: ${initiator}`);
    }

    // Execute user-defined arbitrary execution (e.g. arbitrage, liquidation, collateral swap)
    await this.executeOperation(initiator, token, amount, fee, data);

    // Standard ERC-3156 callback return value
    return ERC3156_CALLBACK_SUCCESS;
  }

  public abstract executeOperation(
    initiator: string,
    token: string,
    amount: bigint,
    fee: bigint,
    data: string
  ): Promise<void>;
}
