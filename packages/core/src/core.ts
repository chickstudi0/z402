import { decodeAndValidateSignedTransactionForTokenTransfer, decodeAndValidateSignedTransactionForSolTransfer } from './decode';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { broadcastWithRetry } from './broadcast';
import { CoreInputs, CoreOutcome, CreatePaymentRouteParams, PaymentRecord, Z402Context } from './types';

/** Middleware to create a payment route
   - expects base58 signed transaction in x-payment header
   - decodes + verifies transaction for the given route params
   - if no db: broadcasts + confirms with retry/poll
   - if db: checks existing payments; inserts pending; broadcasts + confirms with retry/poll;
            updates db accordingly
*/
export const processPaymentRequest = async (params: CreatePaymentRouteParams, ctx: Z402Context, { paymentHeader, routePath }: CoreInputs): Promise<CoreOutcome> => {

    //base58 encoded signed transaction in x-payment header
    if (!paymentHeader) {
        return {
            type: 'respond',
            status: 402,
            body: {
                error: 'payment_required',
                payment: {
                    destination: params.destination,
                    amount: params.amount,
                    mint: params.mint ?? null,
                },
                instructions: {
                    header: 'x-payment',
                    description:
                        'Retry this request with a base58-encoded signed transaction paying the above amount',
                },
            },
        };
    }

    //verify and decode transaction
    const signature = extractSignature(paymentHeader);
    let instruction;
    try {
        instruction = params.mint
            ? decodeAndValidateSignedTransactionForTokenTransfer(paymentHeader, params)
            : decodeAndValidateSignedTransactionForSolTransfer(paymentHeader, params);
    } catch (error) {
        return { type: 'respond', status: 400, body: { error: 'Invalid payment transaction' } };
    }

    //if no db, just broadcast and confirm
    if (!ctx.db) {
        const outcome = await broadcastWithRetry(
            ctx.connection,
            paymentHeader,
            ctx.pendingTimeoutMs ?? 60_000,
            ctx.retryEveryMs ?? 600
        );

        if (outcome.ok) {
            return {
                type: 'proceed',
                payment: {
                    signature: outcome.signature,
                    signer: instruction.signer,
                    destination: params.destination,
                    amount: params.amount,
                    mint: params.mint ?? null,
                    alreadySettled: false,
                },
            };
        } if (outcome.reason === 'timeout') {
            return { type: 'respond', status: 202, body: { status: 'pending', signature } };
        }
        return { type: 'respond', status: 500, body: { error: 'Payment transaction failed', signature } };
    } else {

        // with db, check existing payments
        const existingPayment = await ctx.db.read.get.get(signature)
        if (existingPayment) {
            const state = await checkTransaction(existingPayment, ctx);
            if (state === 'complete') {
                return {
                    type: 'proceed',
                    payment: {
                        signature,
                        signer: instruction.signer,
                        destination: params.destination,
                        amount: params.amount,
                        mint: params.mint ?? null,
                        alreadySettled: true,
                    },
                };
            }
            if (state === 'pending') return { type: 'respond', status: 400, body: { error: 'Payment transaction is already pending' } };
            //if failed, we allow retry below
        } else {
            const dupIntents = await ctx.db.read.getFromToMintRoute.all(
                instruction.from, instruction.to, instruction.mint, routePath
            )

            if (dupIntents.length > 0) {
                for (const payment of dupIntents) {
                    const state = await checkTransaction(payment, ctx);
                    if (state === 'complete') { //after ctx.pendingTimeoutMs seconds, if still not complete, we allow retry
                        return {
                            type: 'proceed',
                            payment: {
                                signature,
                                signer: instruction.signer,
                                destination: params.destination,
                                amount: params.amount,
                                mint: params.mint ?? null,
                                alreadySettled: true,
                            },
                        };
                    }
                }
            }

            await ctx.db.insert.insertPending.run(
                signature, instruction.from, instruction.to, instruction.amount, instruction.mint, routePath
            );
        }

        const outcome = await broadcastWithRetry(
            ctx.connection,
            paymentHeader,
            ctx.pendingTimeoutMs ?? 60_000,
            ctx.retryEveryMs ?? 600
        );

        if (outcome.ok) {
            await ctx.db.insert.remove.run(signature);      // success, remove row
            return {
                type: 'proceed',
                payment: {
                    signature: outcome.signature,
                    signer: instruction.signer,
                    destination: params.destination,
                    amount: params.amount,
                    mint: params.mint ?? null,
                    alreadySettled: false,
                },
            };
        }
        if (outcome.reason === 'timeout') {
            // keep pending so next request continues the spam / check flow
            return {
                type: 'respond',
                status: 202,
                body: { status: 'pending', signature, message: 'Payment transaction is still pending, try again with same signature.' },
            };
        }
        // final error or clear failure. drop the row so client can rebuild a fresh tx
        await ctx.db.insert.remove.run(signature);
        return { type: 'respond', status: 500, body: { error: 'Payment transaction failed', signature } };
    }
}

//Utils 
function extractSignature(bs58Tx: string): string {
    const tx = Transaction.from(Buffer.from(bs58.decode(bs58Tx)));
    return tx.signatures[0].signature
        ? bs58.encode(tx.signatures[0].signature)
        : (() => { throw new Error("Transaction not signed") })();
}

const checkTransaction = async (
    payment: PaymentRecord,
    ctx: Z402Context
): Promise<'pending' | 'complete' | 'failed' | undefined> => {
    if (payment.status !== 'pending') return undefined;

    const ageMs = Date.now() - payment.created_at * 1000;
    if (ageMs < (ctx.pendingTimeoutMs ?? 60000)) {
        return 'pending';
    }

    const st = await ctx.connection.getSignatureStatuses([payment.signature], { searchTransactionHistory: true } as any);
    const status = st?.value?.[0];
    if (status && !status.err && status.confirmationStatus === 'finalized') {
        ctx.db!.insert.remove.run(payment.signature);

        return 'complete';
    } else {
        ctx.db!.insert.remove.run(payment.signature);
        return 'failed';
    }
};
