import { Raydium, WSOLMint } from "@raydium-io/raydium-sdk-v2";
import { LAMPORTS_PER_SOL, VersionedTransaction, PublicKey, Connection } from "@solana/web3.js";
import { JitoRpcConnection, searcher } from 'jito-ts';
import { keyPairFromFile } from "./helper.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const apiUrl = "http://localhost:8080/swapAndMint"
const rpcUrl = "http://neproxy-crawler.core-services.svc.cluster.local:8080/neproxy/solana"

async function swapAndMint() {
    const connection = new Connection(rpcUrl, 'confirmed');

    const signer = keyPairFromFile("BjrVZbbgTuaW9NDegdQg7zN4RK5wHEMNpYhtRRayHtpH.key.txt");
    const payer = signer.publicKey;

    const balance = await connection.getBalance(payer);
    console.log('current account has balance: ', balance);

    // Step 3: Define the input parameters
    const params = {
        userAddress: payer.toBase58(),
        poolAddress: "2AXXcN6oN9bBT5owwmTH53C7QHUXvhLeu718Kqt8rvY2",
        swapSlippage: 0.01,
        liquiditySlippage: 0.01,
        tickLower: -30290,
        tickUpper: -28170,
        tokenInAddress: WSOLMint.toBase58(),
        amountIn: LAMPORTS_PER_SOL * 0.01,
        protocol: "raydiumv3"
    };

    const encodedTxs = await getSwapAndMintParams(params);
    const txs = encodedTxs.map((tx) => {
        const versionTx = VersionedTransaction.deserialize(Buffer.from(tx, 'base64'));
        versionTx.sign([signer])
        return versionTx
    })

    await sendBundle(signer, txs, false);
}

async function sendBundle(keypair, txs, sendTx) {
    const blockEngineUrl = "block-engine.mainnet.frankfurt.jito.wtf"
    const conn = new JitoRpcConnection(rpcUrl);
    const client = searcher.searcherClient(blockEngineUrl);
    const _tipAccount = (await client.getTipAccounts())[0]
    const tipAccount = new PublicKey(_tipAccount);
    
    const raydiumATA = await getAssociatedTokenAddress(new PublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"), keypair.publicKey);
    console.log("raydiumATA", raydiumATA.toBase58());

    let accounts = txs.map((tx) => {
      return {
        addresses: [keypair.publicKey.toBase58(), raydiumATA.toBase58()],
      };
    })
  
    const resBundle = await conn.simulateBundle(txs,
      {
        skipSigVerify: true,
        replaceRecentBlockhash: true,
        preExecutionAccountsConfigs: accounts,
        postExecutionAccountsConfigs: accounts,
      }
    );
  
    console.log(resBundle.value.transactionResults);
    console.log("pre state", resBundle.value.transactionResults[0]?.postExecutionAccounts);
    console.log("post state", resBundle.value.transactionResults[0]?.postExecutionAccounts);
  
    if (resBundle.value.summary == "succeeded" && sendTx) {
        console.log("summary succeeded");
    //   const balance = await conn.getBalance(keypair.publicKey);
    //   console.log('current account has balance: ', balance);
    
    //   let isLeaderSlot = false;
    //   while (!isLeaderSlot) {
    //     const next_leader = await client.getNextScheduledLeader();
    //     const num_slots = next_leader.nextLeaderSlot - next_leader.currentSlot;
    //     isLeaderSlot = num_slots <= 2;
    //     console.log(`next jito leader slot in ${num_slots} slots`);
    //     await new Promise(r => setTimeout(r, 500));
    //   }
    
    //   const blockHash = await conn.getLatestBlockhash();
    
    //   let bundle = new Bundle(txs, 5)
    //   bundle = bundle.addTipTx(keypair, 100_000, tipAccount, blockHash.blockhash);
    
    //   const bundleId = await client.sendBundle(bundle);
    //   console.log("bundle id", bundleId);
      
    //   onBundleResult(client);
    } else {
      console.log("summary failed", resBundle.value.summary.failed);
    }
  }

async function getSwapAndMintParams(params) {
    const urlParams = new URLSearchParams(params)
    const url = `${apiUrl}?${urlParams}`;
    const res = await fetch(url);
    const data = await res.json();
    let txs = [];
    data.swapTxs.forEach(tx => {
        tx.swapData?.forEach(t => {
            if (t) {
                txs.push(t.encodedData);
            }
        });
    });
    txs.push(data.liquidityTx.encodedData);
    return txs;
}

(async () => {
    await swapAndMint();
})();
