# z402 - Zero-trust x402 payments for Solana

z402 is a fully self-hosted, zero-trust payment verification layer for Solana-based apps and services.

It lets servers protect any route using the standard HTTP `402 Payment Required` response.
Clients detect 402, automatically build-and-sign a Solana tx, resend with the `x-payment` header, and receive access.


| Feature                                | Description                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Self-Sufficient**                    | No external facilitator, relay, custodian, oracle, or hosted service required.                  |
| **Zero-Trust**                         | Payments settle **directly on-chain** no off-chain balances or IOUs.                          |
| **Crash-Proof Idempotency (Optional)** | Add a DB so failed or duplicate payment attempts **never result in accidental double charges**. |
| **Supports SOL & SPL Tokens**          | You choose the mint. Works for any token.                                                       |
| **Minimal & Infrastructure-Friendly**  | Works with any framework that can read HTTP headers.                                            |
| **Simple Semantics**                   | Just `402 + x-payment` no complex protocol layer.                                                |

Unlike earlier x402-style drafts, **z402 does not require any external facilitator**
Your server verifies, retries, and finalizes payments by itself.

## Packages

| Package | Description |
|--------|-------------|
| [`z402`](https://github.com/chickstudi0/z402/tree/main/packages/core) | Core code & middleware for Express and Hono (server-side) |
| [`z402-client`](https://github.com/chickstudi0/z402/tree/main/packages/client) | Client helper for browsers / Node / wallets |
| [`z402-storage-sqlite	`](https://github.com/chickstudi0/z402/tree/main/packages/storage-sqlite	) | Local SQLite persistence (recommended dev) |
| [`z402-storage-postgres	`](https://github.com/chickstudi0/z402/tree/main/packages/storage-postgres) | Postgres persistence (Neon, Vercel, RDS, etc) |
| [`z402-storage-libsql`](https://github.com/chickstudi0/z402/tree/main/packages/storage-libsql) | LibSQL / Turso persistence |
| [`examples`](https://github.com/chickstudi0/z402/tree/main/examples) | Usage demos |

---

## Minimal Usage Example

### Server (Express)
```ts
import express from "express";
import { createPaymentContext } from "z402/express";
import { Connection } from "@solana/web3.js";

const app = express();

(async () => {
  const z402 = await createPaymentContext({connection: new Connection("https://api.devnet.solana.com")});

  // Require 0.0001 SOL before returning content
  app.get("/premium", z402.route("DESTINATION_WALLET_PUBLIC_KEY", "100000000"), (req, res) => {
    res.send({"message": "Paid content unlocked!", payment: res.locals.payment});
  });

  app.listen(3000, () => console.log("Server running at http://localhost:3000"));
})();
```

### Server (Hono)
```ts
import { Hono } from "hono";
import { createPaymentContext } from "z402/hono";
import { Connection } from "@solana/web3.js";

const app = new Hono();

(async () => {
  const z402 = await createPaymentContext({connection: new Connection("https://api.devnet.solana.com")});

  app.get("/paid", z402.route("DestinationWalletPubkeyHere", "1000000"), (c) => 
      c.json({"message": "Paid content unlocked!", payment: c.get("payment")})
  );
})();
```

### Client
```ts
import { Z402Client } from "z402-client";
import { Connection, Keypair } from "@solana/web3.js";

  const connection = new Connection("https://api.devnet.solana.com");
  const wallet = Keypair.generate(); // or wallet adapter

  const client = new Z402Client({ connection, wallet });

  client.get("http://localhost:3000/premium").then(async (res) => {
    console.log(await res.text());
  });

```

On 402, the client automatically:

- Parses the payment quote
- Builds the SOL/SPL transfer
- Signs it locally
- Resends request with x-payment
No UI or wallet pop-up required. You decide how to show UX.

### Optional: Crash-Safe Payment Recovery (Recommended in Prod)
To avoid double-charging and handle server restarts safely:
```ts
import { initSqliteDb } from "z402-storage-sqlite";

const z402 = await createPaymentContext({
  connection,
  db: initSqliteDb("./payments.db"), // or initPostgresDb(), initLibsqlDb()
});
```
This ensures:

- Requests that crash mid-processing will retry safely
- Duplicate signatures are never charged twice
- Pending payments resume on restart/retry

### Philosophy
> Payments should work like HTTP authentication - not like Web3 UX pain.

**z402** was designed based on 3 principles:

1. **No counterparty trust**
2. **No external coordination servers**
3. **No protocol complexity beyond HTTP**

This is not paywalls-by-wallet-connect.

This is resource protection via cryptographic settlement.

### Installion
```
npm install z402 z402-client
```

### License
MIT - Use freely.