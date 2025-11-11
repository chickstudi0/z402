import { Z402Client } from "z402-client";
import { Connection, Keypair, clusterApiUrl, Transaction } from "@solana/web3.js";

const kp = Keypair.generate();

const wallet = {
  publicKey: kp.publicKey,
  signTransaction: async (tx: Transaction) => {
    tx.sign(kp);
    return tx;
  },
};

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"));

  //request airdrop to fund the wallet
  const sig = await connection.requestAirdrop(wallet.publicKey, 2e9);
  await connection.confirmTransaction(sig, "finalized");

  //build the Z402 client
  const client = new Z402Client({ connection, wallet });

  // call the paywalled endpoint. if it returns 402 the client auto builds, signs, and retries with x-payment header
  const res = await client.post("http://localhost:3000/paid", JSON.stringify({ any: "payload" }), {
    headers: { "content-type": "application/json" },
  }, {
    computeUnits: 300_000,
    priorityMicroLamports: 200_000,
  });

  console.log("status:", res.status);
  const txt = await res.text();
  console.log("body:", txt);
}

main();