import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
    Transaction,
    SystemProgram,
    SystemInstruction,
    PublicKey,
} from '@solana/web3.js';
import { CreatePaymentRouteParams } from './types';

/** Address of the SPL Token program */
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** Address of the SPL Token 2022 program */
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/** Address of the SPL Associated Token Account program */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');


interface DecodedInstruction {
    from: string,
    to: string,
    amount: string,
    tx: Transaction
    mint: string | null,
    signer: string,
}

// sol transfer
export function decodeAndValidateSignedTransactionForSolTransfer(
    bs58Tx: string,
    route: CreatePaymentRouteParams
): DecodedInstruction {
    const tx = Transaction.from(Buffer.from(bs58.decode(bs58Tx)));

    const msg = tx.serializeMessage();
    for (const s of tx.signatures) {
        if (s.signature && !nacl.sign.detached.verify(msg, s.signature, s.publicKey.toBuffer())) {
            throw new Error('Invalid signature');
        }
    }

    for (const ix of tx.instructions) {
        if (!ix.programId.equals(SystemProgram.programId))
            continue;

        let decoded: ReturnType<typeof SystemInstruction.decodeTransfer> | undefined;
        try {
            decoded = SystemInstruction.decodeTransfer(ix);
        } catch {
            continue; // not a transfer, move on
        }

        if (!decoded.toPubkey.equals(new PublicKey(route.destination)))
            continue;
        if (decoded.lamports !== BigInt(route.amount))
            continue;

        const signerSet = new Set(tx.signatures
            .filter(s => s.signature)
            .map(s => s.publicKey.toBase58()));
        if (!signerSet.has(decoded.fromPubkey.toBase58()))
            continue;

        return {
            from: decoded.fromPubkey.toBase58(),
            to: decoded.toPubkey.toBase58(),
            amount: decoded.lamports.toString(),
            tx,
            mint: null,
            signer: tx.signatures[0].publicKey.toBase58(),
        }
    }

    throw new Error('No valid SOL transfer instruction found');
}

// token transfer
export function decodeAndValidateSignedTransactionForTokenTransfer(
    bs58Tx: string,
    route: CreatePaymentRouteParams,
): DecodedInstruction {
    if (!route.mint) {
        throw new Error('Mint parameters are required for token transfer decoding');
    }

    const tx = Transaction.from(Buffer.from(bs58.decode(bs58Tx)));

    const msg = tx.serializeMessage();
    for (const s of tx.signatures) {
        if (s.signature && !nacl.sign.detached.verify(msg, s.signature, s.publicKey.toBuffer()))
            throw new Error('Invalid signature');
    }

    const [expectedDestAta] = PublicKey.findProgramAddressSync(
        [new PublicKey(route.destination).toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), new PublicKey(route.mint).toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    for (const ix of tx.instructions) {
        if (ix.programId.equals(TOKEN_PROGRAM_ID) || ix.programId.equals(TOKEN_2022_PROGRAM_ID)) {
            // transfer or transferChecked
            const isTransfer = ix.data.length >= 9 && ix.data[0] === 3;
            const isTransferCheck = ix.data.length >= 10 && ix.data[0] === 12;
            if (!isTransfer && !isTransferCheck) continue;

            const destIndex = isTransfer ? 1 : 2; // 3 -> dest at 1, 12 -> dest at 2
            const destAta = ix.keys[destIndex].pubkey;
            if (!destAta.equals(expectedDestAta)) continue;

            const amount = ix.data.slice(1, 9).readBigUInt64LE(0);
            if (amount !== BigInt(route.amount)) continue;

            return {
                from: ix.keys[0].pubkey.toBase58(),  // source ATA (intent key only)
                to: route.destination,              // owner wallet (ATA derived)
                amount: route.amount,
                tx,
                mint: route.mint,
                signer: tx.signatures[0].publicKey.toBase58(),
            }
        }
    }

    throw new Error('No valid SPL transfer instruction found');
}