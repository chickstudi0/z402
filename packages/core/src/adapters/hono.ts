import type { MiddlewareHandler } from 'hono';
import type { CreatePaymentRouteParams, Z402Context, PaymentResult, DbApi, Z402Params } from '../types';
import { processPaymentRequest } from '../core';

declare module 'hono' {
    interface ContextVariableMap {
        payment: PaymentResult;
    }
}

/**
 * Create a Z402 payment middleware context for Hono.
 *
 * Use this once (at server init), then `.route(...)` for each protected endpoint.
 *
 * @example
 * const z = createPaymentContext({ connection, db });
 * app.post("/buy", z.route("DestinationWalletPubkeyHere", "1000000"), handler);
*/
export const createPaymentContext = async ({ connection, db, pendingTimeoutMs = 60000, retryEveryMs = 600 }: Z402Params) => {
    const resolvedDb: DbApi | undefined = db;

    const ctx: Z402Context = { connection, db: resolvedDb, pendingTimeoutMs, retryEveryMs };

    if (ctx.db) {
        let pendingPayments = await ctx.db.read.getPending.all();
        console.log(`Found ${pendingPayments.length} pending payments stuck in the database`);
    }

    return {
        /**
        * Middleware factory: accepts either an object or positional form.
        * - Object: { destination, amount, mint? }
        * - Positional : (destination, amount, mint?)
        */
        route: (
            paramsOrDestination: CreatePaymentRouteParams | string,
            amount?: string,
            mint?: string
        ): MiddlewareHandler => {
            const params: CreatePaymentRouteParams =
                typeof paramsOrDestination === 'string'
                    ? { destination: paramsOrDestination, amount: amount!, mint }
                    : paramsOrDestination;

            return async (c, next) => {
                const paymentHeader = c.req.header('x-payment') ?? undefined;
                const routePath = new URL(c.req.url).pathname;

                const outcome = await processPaymentRequest(params, ctx, { paymentHeader, routePath });

                if (outcome.type === 'respond') {
                    return c.json(outcome.body, outcome.status as any);
                }

                c.set('payment', outcome.payment);
                await next();
            };
        },

        /** read-only DB surface (if provided) */
        db: () => ctx.db?.read,
    };
};