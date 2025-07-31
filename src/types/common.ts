// This module contains defintions for wire format interfaces used across
// multiple modules or versions of the protocol.

/**
 * A Solana account public key.
 *
 * Encoded as binary data of length 32. This just gets decoded as a Uint8Array
 * by msgpack.
 */
export type Pubkey = Uint8Array;

/**
 * Solana account metadata for an instruction.
 *
 * Has a custom encoding for
 */
export interface AccountMeta {
	/**
	 * Public key for the account.
	 */
	p: Pubkey;
	/**
	 * Whether the account is a signer on the instruction.
	 */
	s: boolean; // isSigner
	/**
	 * Whether the account is writable on the transaction.
	 */
	w: boolean; // isWritable
}

/**
 * A single instruction to be executed as part of a transaction.
 */
export interface Instruction {
	/**
	 * Public key of the program executing the transaction.
	 */
	p: Pubkey;
	/**
	 * Account metadata for the transaction.
	 */
	a: AccountMeta[];
	/**
	 * Transaction data.
	 */
	d: Uint8Array;
}

/**
 * Type of swap to perform.
 */
export enum SwapMode {
	/**
	 * Amount specifed is the exact input amount, slippage is on output.
	 */
	ExactIn = "ExactIn",
	/**
	 * Amount specified is the exact output amount, slippage is on input.
	 */
	ExactOut = "ExactOut",
}
