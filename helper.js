import fs from 'fs';
import bs58 from 'bs58';
import { Keypair, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

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

    signers.forEach(s => {
        tx.sign([s])
    });

    return tx;
}
