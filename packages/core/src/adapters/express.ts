import type { Request, Response, NextFunction } from 'express';
import type { CreatePaymentRouteParams, Z402Context, PaymentResult, DbApi, Z402Params } from '../types';
import { processPaymentRequest } from '../core';

/**
 * Create a Z402 payment middleware context for Express.
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
    ) => {
      const params: CreatePaymentRouteParams =
        typeof paramsOrDestination === 'string'
          ? { destination: paramsOrDestination, amount: amount!, mint }
          : paramsOrDestination;

      return async (req: Request, res: Response, next: NextFunction) => {
        const outcome = await processPaymentRequest(params, ctx, {
          paymentHeader: req.get('x-payment') ?? undefined,
          routePath: req.originalUrl || req.url,
        });

        if (outcome.type === 'respond') {
          return res.status(outcome.status).json(outcome.body);
        }

        res.locals.payment = outcome.payment as PaymentResult;
        return next();
      };
    },

    /** read-only DB surface (if provided) */
    db: () => ctx.db?.read,
  };
};