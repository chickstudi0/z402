import bs58 from 'bs58';
import { Connection, Transaction } from '@solana/web3.js';
import type { BroadcastOutcome } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function broadcastWithRetry(
  connection: Connection,
  rawTxBase58: string,
  timeoutMs: number,
  resendEveryMs = 600,
): Promise<BroadcastOutcome> {
  const start = Date.now();
  const wire = Buffer.from(bs58.decode(rawTxBase58));
  const tx = Transaction.from(wire);
  const sigBytes = tx.signatures[0]?.signature;
  if (!sigBytes) return { ok: false, reason: 'final_error', signature: '' };
  const signature = bs58.encode(sigBytes);

  //simulation pass
  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      return { ok: false, reason: 'final_error', signature };
    }
  } catch (e: any) {
    return { ok: false, reason: 'final_error', signature };
  }

  // first send (skip preflight, we just simulated)
  let lastSendErrMsg: string | undefined;
  try {
    await connection.sendRawTransaction(wire, { skipPreflight: true, maxRetries: 0 });
  } catch (e: any) {
    lastSendErrMsg = e?.message || String(e);
  }

  // poll + controlled resends
  while (Date.now() - start < timeoutMs) {
    try {
      const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true } as any);
      const st = value[0];

      if (st?.err) {
        return { ok: false, reason: 'final_error', signature };
      }
      if (st && st.confirmationStatus === 'finalized') {
        return { ok: true, signature };
      }
    } catch (e: any) {
    }

    const alreadyProcessed =
      lastSendErrMsg &&
      /already processed|recently finalized|transaction precompile verification failure/i.test(lastSendErrMsg);

    if (!alreadyProcessed) {
      try {
        await connection.sendRawTransaction(wire, { skipPreflight: true, maxRetries: 0 });
        lastSendErrMsg = undefined;
      } catch (e: any) {
        lastSendErrMsg = e?.message || String(e);
      }
    }

    await sleep(resendEveryMs);
  }

  return { ok: false, reason: 'timeout', signature };
}
