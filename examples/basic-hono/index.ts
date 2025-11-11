import { Hono } from "hono";
import { createPaymentContext } from "z402/hono";
import { Connection, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const app = new Hono();
  const z402 = await createPaymentContext({
    connection: new Connection(clusterApiUrl("devnet")),
  });

  app.get("/hello", (c) => 
    c.text("ok")
  );

  // Example paid endpoint 0.001 SOL
  app.post("/paid", z402.route("DestinationWalletPubkeyHere", "1000000"), (c) => {
    console.log(c.get("payment"));
    return c.json({"message": "Payment accepted! here is your paid content.", payment: c.get("payment")});
  });
}

main();
