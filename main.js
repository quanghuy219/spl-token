import fs from 'fs';
import bs58 from 'bs58';
import { clusterApiUrl, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, VersionedTransaction, TransactionMessage, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import {
    AccountLayout,
    createInitializeMint2Instruction,
    MINT_SIZE,
    createMintToInstruction,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync,
    createMint
} from '@solana/spl-token';

import {
    PROGRAM_ID as METADATA_PROGRAM_ID,
    createCreateMetadataAccountV3Instruction,
    Metadata,
} from '@metaplex-foundation/mpl-token-metadata';
import { Metaplex } from "@metaplex-foundation/js";

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const keyFile = '2qKBZdLFoXKRkMxUmrEyFqTUvu2ktd4fND7AgHNh8ViE.txt';


const keyPairFromFile = (filename) => {
    const prvKey = fs.readFileSync(filename, 'utf8');
    return Keypair.fromSecretKey(bs58.decode(prvKey));
}

const generateKeyPair = async (filename) => {
    const keypair = Keypair.generate();
    if (filename != "") {
        fs.writeFileSync(filename, bs58.encode(keypair.secretKey));
    }
    return keypair;
}

const airDropSol = async () => {
    const payer = keyPairFromFile('key.txt');
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const airdropSignature = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);

    const latestBlockHash = await connection.getLatestBlockhash();

    const tx = await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        signature: airdropSignature,
    });
    console.log(tx.signature);
}

const createToken = async () => {
    const payer = keyPairFromFile(keyFile);
    console.log(payer.publicKey.toBase58());
    const tokenConfig = {
        decimals: 9,
        name: "My USD",
        symbol: "mUSD",
    }
    const mint = Keypair.generate();
    console.log("Mint address:", mint.publicKey.toBase58());

    const createMintInstruction = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
    });

    const initializeMintInstruction = createInitializeMint2Instruction(
        mint.publicKey,
        tokenConfig.decimals,
        payer.publicKey,
        payer.publicKey,
    );

    const tokenAccount = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey);

    const createATAInstruction = createAssociatedTokenAccountInstruction(payer.publicKey, tokenAccount, payer.publicKey, mint.publicKey);

    const mintToInstruction = createMintToInstruction(
        mint.publicKey,
        tokenAccount,
        payer.publicKey,
        1000 * LAMPORTS_PER_SOL
    );

    /*
    Build instruction to store token metadata
    - derive the pda for the metadata account
    - create the instruction with the actual metadata
    */
    const metadataAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.publicKey.toBuffer()],
        METADATA_PROGRAM_ID
    )[0];

    console.log("Metadata address:", metadataAccount.toBase58());

    const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
            metadata: metadataAccount,
            mint: mint.publicKey,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
        },
        {
            createMetadataAccountArgsV3: {
                data: {
                    creators: null,
                    name: tokenConfig.name,
                    symbol: tokenConfig.symbol,
                    sellerFeeBasisPoints: 0,
                    collection: null,
                    uri: '',
                    uses: null,
                },
                // `collectionDetails` - for non-nft type tokens, normally set to `null` to not have a value set
                collectionDetails: null,
                // should the metadata be updatable?
                isMutable: true,
            },
        }
    );

    const instructions = [createMintInstruction, initializeMintInstruction, createATAInstruction, mintToInstruction, createMetadataInstruction];
    const tx = await buildTransaction({
        connection: connection,
        payer: payer.publicKey,
        signers: [payer, mint],
        instructions,
    })

    try {
        const sig = await connection.sendTransaction(tx);
        console.log(sig);
    } catch (error) {
        console.error(error);
    }

    // const mint = await createMint(connection, payer, payer.publicKey, null, 9);
    // console.log("mint address: ", mint.toBase58());
    // const mintInfo = await getMint(connection, mint);
    // console.log("mintInfo ", mintInfo);

    // const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    // console.log("tokenAccount: ", tokenAccount.address.toBase58());

    // const tx = await mintTo(connection, payer, mint, tokenAccount.address, payer.publicKey, 100 * LAMPORTS_PER_SOL);
    // console.log("tx: ", tx);
}

const getBalances = async () => {
    const payer = keyPairFromFile('2qKBZdLFoXKRkMxUmrEyFqTUvu2ktd4fND7AgHNh8ViE.txt');
    const tokenAccounts = await connection.getTokenAccountsByOwner(payer.publicKey, {
        mint: new PublicKey('2g1D3kQQZuvZwvvPLdXqcLUzXP7LcyVw6kq8tP8dwWYh'),
    })

    tokenAccounts.value.forEach(tokenAccount => {
        const accountData = AccountLayout.decode(tokenAccount.account.data);
        console.log(`${accountData.mint}   ${accountData.amount}`)
    });
}

export async function buildTransaction({
    connection,
    payer,
    signers,
    instructions,
}) {
    let blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);

    const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);

    signers.forEach(s => tx.sign([s]));

    return tx;
}


const getToken = async () => {
    const mintAddress = new PublicKey("25kfHeSEf17rGJSYsUoqArHcSqP9xDx65yLpPaMtcKxQ");
    const metaplex = new Metaplex(connection);
    const metadata = metaplex.nfts().pdas().metadata({mint: mintAddress});
    console.log(metadata.toBase58());

    const metadataAccountInfo = await connection.getAccountInfo(metadata);
    if (metadataAccountInfo) {
        const token = await metaplex.nfts().findByMint({mintAddress: mintAddress});
        console.log(token.name);
        console.log(token.symbol);
    }
}

(async () => {
    await getToken();
})()
