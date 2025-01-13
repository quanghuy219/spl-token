import {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
    TOKEN_PROGRAM_ID,
    createTransferCheckedInstruction,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey, Connection, Keypair, ComputeBudgetProgram } from '@solana/web3.js';
import {
    keyPairFromFile,
    buildTransaction,
} from './helper.js';
import { BN } from 'bn.js';
import { Program, } from "@coral-xyz/anchor";
import idl from './idl/automation.js';
import { toTransactionInstruction, wait } from './helper.js';
import bs58 from 'bs58';

const userVaultSeed = "userVault";

const heliusRpc = "https://mainnet.helius-rpc.com/?api-key=4476d287-682b-4b85-8dc9-b434aab8857c";
const quicknodeRpc = "https://bold-special-brook.solana-mainnet.quiknode.pro/638b5de6ebd373f2d595976e7c1cfd11a2b1074c"
const myQuicknodeRpc = "https://blissful-young-choice.solana-mainnet.quiknode.pro/322fc235a6a71f0559baecd4c373faac427c5f2b"

const connection = new Connection(quicknodeRpc, 'confirmed');
const apiUrl = "http://localhost:8080"
const program = new Program(idl, { connection });

async function autoRebalance() {
    const signer = keyPairFromFile("keyfiles/BjrVZbbgTuaW9NDegdQg7zN4RK5wHEMNpYhtRRayHtpH.key.txt");
    const operator = signer.publicKey;
    const tokenMintAddress = new PublicKey("3Q9NrEy6C8ta2vEzrgo9GDkr4bv9Sxk2Z2t577KuiSMx");

    const params = {
        "nftMintAddress": tokenMintAddress.toBase58(),
        "swapSlippage": 0.02,
        "withdrawSlippage": 0.01,
        "liquiditySlippage": 0.01,
        "newTickLower": -20,
        "newTickUpper": 20,
        "buildTx": true,
        "userAddress": "2qKBZdLFoXKRkMxUmrEyFqTUvu2ktd4fND7AgHNh8ViE",
        "operator": operator.toBase58(),
        "closePosition": true,
        "protocol": "raydiumv3",
        "gasCeilingPercent": 0,
        "compoundFees": true
    }

    const { setupIxData, ixData } = await getAutoRebalanceIxData(params);

    const { instructions: setupIxs, signers: setupSigners, lookupTableAddresses: setupLookupTableAddresses, setupLookupTableAddress: newLookupTableAddress } = setupIxData;

    console.log("newLookupTableAddress", newLookupTableAddress);
    const setupTxSigners = setupSigners.map((s) => {
        return Keypair.fromSecretKey(bs58.decode(s));
    });

    const prepareTx = await buildTx({
        instructions: setupIxs,
        payer: signer.publicKey,
        lookupTables: setupLookupTableAddresses,
        signers: [signer, ...setupTxSigners]
    });

    const setupSimulation = await connection.simulateTransaction(prepareTx);
    console.log(setupSimulation.value);

    const setupTx = await connection.sendTransaction(prepareTx);
    console.log("setupTx", setupTx);

    console.log("checking new lookup table data...")
    await wait(3000);
    let newLookupTable = null;

    while (!newLookupTable) {
        const _lutAccount = await connection.getAddressLookupTable(new PublicKey(newLookupTableAddress));
        if (_lutAccount && _lutAccount.value && _lutAccount.value.state) {
            newLookupTable = _lutAccount
            break;
        }
        console.log("waiting for lookup table to be created...");
        await wait(1000);
    }

    const { instructions: rebalanceIxs, signers: rebalanceSigners, lookupTableAddresses: rebalanceLookupTableAddresses } = ixData;
    const rebalanceTxSigners = rebalanceSigners.map((s) => {
        return Keypair.fromSecretKey(bs58.decode(s));
    });

    const rebalanceTx = await buildTx({
        instructions: rebalanceIxs,
        payer: signer.publicKey,
        lookupTables: [...rebalanceLookupTableAddresses, newLookupTableAddress],
        signers: [signer, ...rebalanceTxSigners],
        estimatePriorityFee: true,
    });

    const rebalanceSimulation = await connection.simulateTransaction(rebalanceTx);
    console.log(JSON.stringify(rebalanceSimulation.value));
    console.log("rebalance tx size", rebalanceTx.serialize().length);

    if (rebalanceSimulation.value.err) {
        console.log("rebalance simulation failed");
        console.log(rebalanceSimulation.value.err);
        return;
    }

    const rebalanceTxSig = await connection.sendTransaction(rebalanceTx, { skipPreflight: true });
    console.log("rebalance sig", rebalanceTxSig);
}

async function buildTx({
    payer,
    instructions,
    signers = [],
    lookupTables = [],
    estimatePriorityFee = false,
}) {
    const ixs = instructions.map((ix) => { return toTransactionInstruction(ix) });
    const lookupTableAccounts = [];
    for (const addr of lookupTables) {
        const account = await connection.getAddressLookupTable(new PublicKey(addr));
        lookupTableAccounts.push(account.value);
    }

    if (estimatePriorityFee) {
        const priorityFee = await getEstimatePriorityFee();
        ixs.unshift(ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        }));
    }

    const tx = await buildTransaction({
        connection,
        payer,
        signers: signers,
        instructions: ixs,
        lookupTableAccounts: lookupTableAccounts,
    });

    return tx;
}

async function prepare() {
    const payer = keyPairFromFile("keyfiles/2qKBZdLFoXKRkMxUmrEyFqTUvu2ktd4fND7AgHNh8ViE.key.txt");
    // const payer = keyPairFromFile("keyfiles/BjrVZbbgTuaW9NDegdQg7zN4RK5wHEMNpYhtRRayHtpH.key.txt");
    const destination = new PublicKey("BjrVZbbgTuaW9NDegdQg7zN4RK5wHEMNpYhtRRayHtpH");
    console.log("payer", payer.publicKey.toBase58());
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from(userVaultSeed), payer.publicKey.toBuffer()],
        program.programId
    );
    console.log("vault", pda.toBase58());

    const tokenMintUsdt = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
    const tokenMintUsdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const tokenMintRay = new PublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");
    const pdaUsdtAta = getAssociatedTokenAddressSync(tokenMintUsdt, pda, true);
    const pdaUsdcAta = getAssociatedTokenAddressSync(tokenMintUsdc, pda, true);
    const pdaRayAta = getAssociatedTokenAddressSync(tokenMintRay, pda, true);

    const createVaultUsdtAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, pdaUsdtAta, pda, tokenMintUsdt,
    );
    const createVaultUsdcAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, pdaUsdcAta, pda, tokenMintUsdc,
    );
    const createVaultRayAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, pdaRayAta, pda, tokenMintRay,
    );

    const operator = new PublicKey("BjrVZbbgTuaW9NDegdQg7zN4RK5wHEMNpYhtRRayHtpH");
    const delegateUsdtIx = await program.methods
        .approveToken(new BN(1000000000))
        .accounts({
            user: payer.publicKey,
            tokenAccount: pdaUsdtAta,
            delegate: operator,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

    const delegateUsdcIx = await program.methods
        .approveToken(new BN(1000000000))
        .accounts({
            user: payer.publicKey,
            tokenAccount: pdaUsdcAta,
            delegate: operator,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

    const positionMint = new PublicKey("DrLykTPJZPL6UkMNkq8UQdGW8zY3ftpjBPmAz2NhiXcM")
    const userPosAta = getAssociatedTokenAddressSync(positionMint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const vaultPosAta = getAssociatedTokenAddressSync(positionMint, pda, true, TOKEN_2022_PROGRAM_ID);
    const createVaultPosAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, vaultPosAta, pda, positionMint, TOKEN_2022_PROGRAM_ID,
    );
    const transferPosToVaultIx = createTransferCheckedInstruction(userPosAta, positionMint, vaultPosAta, payer.publicKey, new BN(1), 0, [], TOKEN_2022_PROGRAM_ID);

    const instructions = [
        // createVaultUsdtAtaIx,
        createVaultUsdcAtaIx, createVaultRayAtaIx,
        delegateUsdtIx, delegateUsdcIx,
        // createVaultPosAtaIx,
        // transferPosToVaultIx,
    ];

    const setupTx = await buildTransaction({
        connection,
        payer: payer.publicKey,
        signers: [payer],
        instructions: instructions,
        lookupTableAccounts: [],
    });
    const sim = await connection.simulateTransaction(setupTx);
    console.log(sim.value);
    return setupTx;
    // const tx = await connection.sendTransaction(setupTx);
    // console.log("tx", tx);
}

async function getAutoRebalanceIxData(input) {
    const url = `${apiUrl}/autoRebalance`;

    const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify(input),
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const data = await res.json();
    return data;
}

async function getEstimatePriorityFee() {
    const jup = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    const raydium = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');
    const prioritizationFeeObjects = await connection.getRecentPrioritizationFees({
        lockedWritableAccounts: [jup, raydium],
    });

    if (prioritizationFeeObjects.length === 0) {
        console.log('No prioritization fee data available.');
        return;
    }

    // Filter out prioritization fees that are equal to 0 for other calculations
    const nonZeroFees = prioritizationFeeObjects
        .map(feeObject => feeObject.prioritizationFee)
        .filter(fee => fee !== 0);

    // Calculate the median of the non-zero fees
    const sortedFees = nonZeroFees.sort((a, b) => a - b);

    console.log(sortedFees);

    let medianFee = 0;
    if (sortedFees.length > 0) {
        const midIndex = Math.floor(sortedFees.length / 2);
        medianFee = sortedFees.length % 2 !== 0
            ? sortedFees[midIndex]
            : Math.floor((sortedFees[midIndex - 1] + sortedFees[midIndex]) / 2);
    }

    console.log('Median prioritization fee:', medianFee);

    return medianFee;
}

(async () => {
    await autoRebalance();
})();
