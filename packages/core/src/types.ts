import type { Connection } from '@solana/web3.js';

/**
 * Z402 middleware context parameters.
 */
export interface Z402Params {
  /** Solana RPC connection */
  connection: Connection;
  /**
   * Optional storage adapter (preferred).
   * Pass an adapter from z402-storage-… packages (sqlite/postgres/libsql/redis).
   */
  db?: DbApi;
  /** Milliseconds to treat a pending tx before retry/refresh (default 60000) */
  pendingTimeoutMs?: number;
  /** Optional milliseconds between resend attempts (default 600) */
  retryEveryMs?: number;
}

/**
 * Parameters for defining a payment route on your server.
 *
 * @example
 * app.post("/buy", z.route({
 *   destination: "Fj9...wallet",
 *   amount: "1000000", // 1 token in raw units
 *   mint: { address: "So111...", decimals: 9 } // SPL token
 * }));
 */
export interface CreatePaymentRouteParams {
  /** Amount in lamports (SOL) or raw units (SPL token) */
  amount: string;
  /** Receiving wallet (for SPL, ATA is auto-derived) */
  destination: string;
  /** Optional SPL mint; if omitted, route accepts SOL */
  mint?: string;
}

/** Result of a successful payment processing */
export interface PaymentResult {
  /** Transaction signature */
  signature: string;
  /** Payer / transaction signer */
  signer: string;
  /** Receiving wallet */
  destination: string;
  /** Payment amount in lamports (SOL) or raw units (SPL token) */
  amount: string;
  /** Mint address for SPL tokens; null for SOL */
  mint: string | null;
  /** True if we short-circuited on a prior finalization */
  alreadySettled: boolean;
}

export interface DecodedInstruction {
  from: string;  // SOL: payer; SPL: source ATA (intent key only)
  to: string;    // SOL: wallet; SPL: destination wallet (owner)
  amount: string;
  mint: string | null;
  signer: string;
  // tx omitted from external type on purpose
}

export interface PaymentRecord {
  signature: string;
  from: string;
  to: string;
  amount: string;
  mint: string | null;
  route: string;
  status: 'pending';
  created_at: number;
}

export interface Z402Context {
  connection: Connection;
  db?: DbApi;
  pendingTimeoutMs: number;
  retryEveryMs: number;
}

export type CoreOutcome =
  | { type: 'respond'; status: number; body: any }
  | { type: 'proceed'; payment: PaymentResult };

export interface CoreInputs {
  /** raw header value of x-payment (or undefined if absent) */
  paymentHeader?: string;
  /** the route/path used in db intent (e.g. req.originalUrl / c.req.path) */
  routePath: string;
}

export interface BroadcastOk { ok: true; signature: string }
export type BroadcastFailReason = 'timeout' | 'final_error';
export interface BroadcastFail { ok: false; reason: BroadcastFailReason; signature: string }
export type BroadcastOutcome = BroadcastOk | BroadcastFail;
export type MaybePromise<T> = T | Promise<T>;

export interface DbApi {
  insert: {
    insertPending: {
      run: (
        signature: string,
        from: string,
        to: string,
        amount: string,
        mint: string | null,
        route: string
      ) => MaybePromise<void>;
    };
    remove: {
      run: (signature: string) => MaybePromise<void>;
    };
  };
  read: {
    raw: unknown; // backend handle if users want to cast
    get: {
      get: (signature: string) => MaybePromise<PaymentRecord | undefined>;
    };
    getFromToMintRoute: {
      all: (from: string, to: string, mint: string | null, route: string) => MaybePromise<PaymentRecord[]>;
    };
    getPending: {
      all: () => MaybePromise<PaymentRecord[]>;
    };
    getAll: {
      all: () => MaybePromise<PaymentRecord[]>;
    };
  };
}