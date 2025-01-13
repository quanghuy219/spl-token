import fs from 'fs';
import bs58 from 'bs58';
import { Keypair, TransactionMessage, VersionedTransaction, TransactionInstruction, PublicKey } from '@solana/web3.js';

export const keyPairFromFile = (filename) => {
    const prvKey = fs.readFileSync(filename, 'utf8');
    return Keypair.fromSecretKey(bs58.decode(prvKey));
}

export const generateKeyPair = async (filename) => {
    const keypair = Keypair.generate();
    if (filename != "") {
        fs.writeFileSync(filename, bs58.encode(keypair.secretKey));
    }

    return keypair;
}

export async function buildTransaction({
    connection,
    payer,
    signers,
    instructions,
    lookupTableAccounts = [],
}) {
    let blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);

    const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message(lookupTableAccounts);

    const tx = new VersionedTransaction(messageV0);

    if (signers.length > 0) {
        signers.forEach(s => {
            tx.sign([s])
        });
    }

    return tx;
}

export function toTransactionInstruction(instruction) {
    return new TransactionInstruction({
        keys: instruction.accounts.map(acc => {
            return {
                pubkey: new PublicKey(acc.pubkey),
                isSigner: acc.isSigner,
                isWritable: acc.isWritable,
            }
        }),
        data: Buffer.from(instruction.data, 'base64'),
        programId: new PublicKey(instruction.programId),
    });
}

export const wait = (msec) => new Promise((resolve, _) => {
    setTimeout(resolve, msec)
});
