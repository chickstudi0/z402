import bs58 from "bs58";
import {
  PublicKey,
  Connection,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";

export interface Z402Signer {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

export interface Z402ClientInit {
  connection: Connection;
  wallet: Z402Signer;
  headers?: Record<string, string>;
}

export interface Z402PriorityOpts {
  computeUnits?: number;
  priorityMicroLamports?: number;
}

export class Z402Client {
  private connection = this.init.connection;
  private wallet = this.init.wallet;
  private defaultHeaders = this.init.headers ?? {};

  constructor(private init: Z402ClientInit) {}

  // main request method handling 402 payment flow
  async request(
    method: string,
    url: string,
    opts: RequestInit = {},
    priority?: Z402PriorityOpts
  ): Promise<Response> {
    const first = await fetch(url, {
      ...opts,
      method,
      headers: { ...this.defaultHeaders, ...(opts.headers || {}) },
    });

    if (first.status !== 402) return first;

    const payload = await first.json().catch(() => {
      throw new Error("402 did not contain valid JSON");
    });

    if (!payload?.payment?.destination || !payload?.payment?.amount) {
      throw new Error("Invalid 402 payment quote");
    }

    const destination = new PublicKey(payload.payment.destination);
    const mint = payload.payment.mint ? new PublicKey(payload.payment.mint) : null;

    const tx = await buildPaymentTx(
      this.connection,
      this.wallet.publicKey,
      destination,
      payload.payment.amount,
      mint,
      priority
    );

    const signed = await this.wallet.signTransaction(tx);
    const encoded = bs58.encode(signed.serialize());

    return fetch(url, {
      ...opts,
      method,
      headers: {
        ...this.defaultHeaders,
        ...(opts.headers || {}),
        "x-payment": encoded,
      },
    });
  }

  get(url: string, opts?: RequestInit, priority?: Z402PriorityOpts) {
    return this.request("GET", url, opts, priority);
  }
  post(url: string, body?: any, opts?: RequestInit, priority?: Z402PriorityOpts) {
    return this.request("POST", url, { ...(opts || {}), body }, priority);
  }
  put(url: string, body?: any, opts?: RequestInit, priority?: Z402PriorityOpts) {
    return this.request("PUT", url, { ...(opts || {}), body }, priority);
  }
  patch(url: string, body?: any, opts?: RequestInit, priority?: Z402PriorityOpts) {
    return this.request("PATCH", url, { ...(opts || {}), body }, priority);
  }
  delete(url: string, opts?: RequestInit, priority?: Z402PriorityOpts) {
    return this.request("DELETE", url, opts, priority);
  }
}

// build sol/spl payment transaction (with optional priority/cu limit)
async function buildPaymentTx(
  connection: Connection,
  payer: PublicKey,
  destination: PublicKey,
  amount: string,
  mint: PublicKey | null,
  priority?: Z402PriorityOpts
): Promise<Transaction> {
  const tx = new Transaction();
  tx.feePayer = payer;

  // priority fees
  if (priority?.computeUnits && priority.computeUnits > 0) {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: Math.floor(priority.computeUnits) }));
  }
  if (priority?.priorityMicroLamports && priority.priorityMicroLamports > 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(priority.priorityMicroLamports),
      })
    );
  }

  if (!mint) {
    // SOL
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: destination,
        lamports: Number(BigInt(amount)),
      })
    );
  } else {
    // SPL TOKEN
    const sourceAta = await getAssociatedTokenAddress(mint, payer, false);
    const destAta = await getAssociatedTokenAddress(mint, destination, true);

    // Create ATAs if missing
    const [srcInfo, dstInfo] = await Promise.all([
      connection.getAccountInfo(sourceAta),
      connection.getAccountInfo(destAta),
    ]);

    if (!srcInfo) tx.add(createAssociatedTokenAccountInstruction(payer, sourceAta, payer, mint));
    if (!dstInfo) tx.add(createAssociatedTokenAccountInstruction(payer, destAta, destination, mint));

    tx.add(
      createTransferInstruction(sourceAta, destAta, payer, BigInt(amount), [], TOKEN_PROGRAM_ID)
    );
  }

  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  return tx;
}
