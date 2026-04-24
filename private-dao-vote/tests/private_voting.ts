// tests/private_voting.ts
//
// End-to-end integration test for the Private DAO Voting MXE.
// This test demonstrates the COMPLETE real MPC flow on Solana devnet:
//   1. Generate null vote (for empty slot padding)
//   2. Create proposal with null-padded vote store
//   3. Cast 3 encrypted votes (2×YES, 1×NO) using real x25519 + RescueCipher
//   4. Wait for voting period to expire
//   5. Queue real MPC tally computation via Arcium
//   6. Wait for Arcium cluster to finalize (~30 seconds — this is real MPC, not simulated)
//   7. Decrypt result with authority's x25519 private key
//   8. Publish final plaintext counts on-chain
//   9. Assert final state: yes=2, no=1, status=Finalized
//
// NOTHING IS SIMULATED. Every encryption uses real x25519 ECDH + RescueCipher.
// Every tally uses the real Arcium MPC cluster on devnet.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PrivateVoting } from "../target/types/private_voting";
import {
  getMXEPublicKey,
  getArciumProgram,
  getArciumProgramId,
  getComputationAccAddress,
  getClusterAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  awaitComputationFinalization,
  RescueCipher,
  deserializeLE,
} from "@arcium-hq/client";
import { x25519 } from "@noble/curves/ed25519";
import { randomBytes } from "crypto";
import { expect } from "chai";
import * as os from "os";
import * as fs from "fs";
import BN from "bn.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readKpJson(path: string): anchor.web3.Keypair {
  return anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(path, "utf-8")))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: anchor.web3.PublicKey
): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const key = await getMXEPublicKey(provider, programId);
    if (key) {
      return key;
    }

    if (attempt < 4) {
      await sleep(750);
    }
  }

  throw new Error(
    "MXE public key is not initialized yet. Finish Arcium MXE setup before running the tally test."
  );
}

async function awaitProgramEvent<T>(
  program: Program<PrivateVoting>,
  eventName: string,
  timeoutMs = 180_000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let listenerId: number | undefined;
    const timeoutId = setTimeout(async () => {
      if (listenerId !== undefined) {
        await program.removeEventListener(listenerId);
      }
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    try {
      listenerId = await program.addEventListener(eventName, async (event) => {
        clearTimeout(timeoutId);
        if (listenerId !== undefined) {
          await program.removeEventListener(listenerId);
        }
        resolve(event as T);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (listenerId !== undefined) {
        await program.removeEventListener(listenerId);
      }
      reject(error);
    }
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("private_voting — Full MPC Lifecycle", () => {
  // Configure provider from environment (ANCHOR_PROVIDER_URL + ANCHOR_WALLET)
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.PrivateVoting as Program<PrivateVoting>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  // Arcium devnet cluster offset
  const CLUSTER_OFFSET = 456;

  // Load authority keypair from default Solana CLI location
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  function getCompDefOffset(): number {
    return Buffer.from(getCompDefAccOffset("tally_votes")).readUInt32LE(0);
  }

  function getSignPda(programId: anchor.web3.PublicKey): anchor.web3.PublicKey {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ArciumSignerAccount")],
      programId
    )[0];
  }

  function getTallyAccounts(computationOffset: BN) {
    return {
      signPdaAccount: getSignPda(program.programId),
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
      executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
      compDefAccount: getCompDefAccAddress(program.programId, getCompDefOffset()),
      computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
      clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
      poolAccount: getFeePoolAccAddress(),
      clockAccount: getClockAccAddress(),
      systemProgram: anchor.web3.SystemProgram.programId,
      arciumProgram: getArciumProgramId(),
    };
  }

  async function initTallyVotesCompDefIfNeeded() {
    console.log("\n[SETUP] Ensuring tally_votes computation definition exists...");

    const mxeAccount = getMXEAccAddress(program.programId);
    const arciumProgram = getArciumProgram(provider);
    const mxeAccountData = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
    const lutOffset = new BN(mxeAccountData.lutOffsetSlot.toString());

    try {
      await program.methods
        .initTallyVotesCompDef()
        .accountsPartial({
          payer: owner.publicKey,
          mxeAccount,
          compDefAccount: getCompDefAccAddress(program.programId, getCompDefOffset()),
          addressLookupTable: getLookupTableAddress(program.programId, lutOffset),
          lutProgram: anchor.web3.AddressLookupTableProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
          arciumProgram: getArciumProgramId(),
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });

      console.log("[SETUP] Computation definition initialized.");
    } catch (error) {
      const message = `${error}`;
      if (
        message.includes("already in use") ||
        message.includes("custom program error: 0x0") ||
        message.includes("ConstraintAddress")
      ) {
        console.log("[SETUP] Computation definition already initialized.");
        return;
      }
      throw error;
    }
  }

  async function fundVoters(voters: anchor.web3.Keypair[]) {
    const tx = new anchor.web3.Transaction();

    for (const voter of voters) {
      tx.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: voter.publicKey,
          lamports: 5_000_000,
        })
      );
    }

    await provider.sendAndConfirm(tx, [owner], { commitment: "confirmed" });
  }

  before(async () => {
    await initTallyVotesCompDefIfNeeded();
  });

  // ── Test: Full voting lifecycle ──────────────────────────────────────────
  it("Full voting lifecycle with real Arcium MPC tally", async () => {
    console.log("\n===== PRIVATE DAO VOTING — FULL MPC LIFECYCLE TEST =====\n");

    // ── Step 1: Fetch the MXE's x25519 public key ─────────────────────────
    // This is the public key voters use for ECDH to encrypt their votes.
    // The MXE's corresponding private key is held inside the Arcium MPC cluster,
    // distributed across Arx nodes — no single node has the full key.
    console.log("[1/9] Fetching MXE x25519 public key from devnet...");
    const mxePublicKey = await fetchMXEPublicKeyWithRetry(
      provider,
      program.programId
    );
    console.log(
      "    MXE pubkey (hex):",
      Buffer.from(mxePublicKey).toString("hex")
    );

    // ── Step 2: Generate null vote for empty slot padding ──────────────────
    // The Arcis circuit has a fixed structure: it always expects exactly 10 inputs.
    // Empty vote slots are pre-filled with a null ciphertext (plaintext=0=abstain)
    // generated here client-side using real x25519 ECDH + RescueCipher.
    console.log("[2/9] Generating null vote for empty slot padding...");
    const nullPrivKey = x25519.utils.randomSecretKey();
    const nullPubKey = x25519.getPublicKey(nullPrivKey);
    const nullSharedSecret = x25519.getSharedSecret(nullPrivKey, mxePublicKey);
    const nullCipher = new RescueCipher(nullSharedSecret);
    const nullNonce = randomBytes(16);
    const nullCiphertext = nullCipher.encrypt([0n], nullNonce);
    console.log("    Null vote generated using real x25519 ECDH + RescueCipher");

    // ── Step 3: Create proposal ────────────────────────────────────────────
    // Use a random 64-bit ID to avoid PDA collisions between test runs
    const proposalIdBytes = randomBytes(8);
    const proposalId = new BN(proposalIdBytes, "hex");
    // 30-second voting window for the test
    const endTime = new BN(Math.floor(Date.now() / 1000) + 30);

    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [voteStorePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("votes_store"), proposalId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("[3/9] Creating proposal on devnet...");
    const createTx = await program.methods
      .createProposal(
        proposalId,
        "Upgrade Protocol to v2.0",
        "Should the DAO upgrade the core protocol to v2.0? This release includes performance improvements, security hardening, and new governance features.",
        endTime,
        Array.from(nullPubKey),
        Array.from(nullCiphertext[0]),
        new BN(deserializeLE(nullNonce).toString())
      )
      .accounts({
        payer: owner.publicKey,
        proposal: proposalPDA,
        allVotesStore: voteStorePDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("    Proposal PDA:", proposalPDA.toBase58());
    console.log("    Vote Store PDA:", voteStorePDA.toBase58());
    console.log("    Create tx:", createTx);

    // ── Step 4: Cast 3 encrypted votes ─────────────────────────────────────
    // Each vote is encrypted client-side using a fresh x25519 ephemeral key.
    // The encrypted ciphertext is stored on-chain — completely opaque.
    // Vote encoding: 1n = YES, 2n = NO, 0n = Abstain
    const testVotes = [
      { choice: 1n, label: "YES" }, // Voter 1
      { choice: 2n, label: "NO" },  // Voter 2
      { choice: 1n, label: "YES" }, // Voter 3
    ];
    const voters = testVotes.map(() => anchor.web3.Keypair.generate());

    console.log("[4/9] Funding 3 voter wallets...");
    await fundVoters(voters);

    console.log("[4/9] Casting 3 encrypted votes...");
    for (let i = 0; i < testVotes.length; i++) {
      const vote = testVotes[i];
      const voter = voters[i];

      // Each voter generates a fresh ephemeral x25519 keypair
      const voterPrivKey = x25519.utils.randomSecretKey();
      const voterPubKey = x25519.getPublicKey(voterPrivKey);
      const sharedSecret = x25519.getSharedSecret(voterPrivKey, mxePublicKey);
      const cipher = new RescueCipher(sharedSecret);
      const nonce = randomBytes(16);
      const encrypted = cipher.encrypt([vote.choice], nonce);

      const voteTx = await program.methods
        .castVote(
          proposalId,
          Array.from(encrypted[0]),
          Array.from(voterPubKey),
          new BN(deserializeLE(nonce).toString())
        )
        .accounts({
          voter: voter.publicKey,
          proposal: proposalPDA,
          allVotesStore: voteStorePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([voter])
        .rpc({ commitment: "confirmed" });

      console.log(
        `    Vote ${i + 1} [${vote.label}] encrypted & submitted — tx: ${voteTx}`
      );
      await sleep(1000);
    }

    // ── Step 5: Wait for voting period to expire ───────────────────────────
    console.log("[5/9] Waiting 32 seconds for voting period to expire...");
    await sleep(32000);
    console.log("    Voting period expired.");

    // ── Step 6: Generate authority key pair for result encryption ──────────
    // The authority generates a fresh x25519 keypair. The public key is passed
    // into the circuit as `authority_dummy.owner` — the circuit uses it to encrypt
    // the output so that ONLY the authority can decrypt the tally result.
    console.log(
      "[6/9] Generating authority x25519 keypair for result decryption..."
    );
    const authorityPrivKey = x25519.utils.randomSecretKey();
    const authorityPubKey = x25519.getPublicKey(authorityPrivKey);
    const authoritySharedSecret = x25519.getSharedSecret(
      authorityPrivKey,
      mxePublicKey
    );
    const authorityCipher = new RescueCipher(authoritySharedSecret);
    const authorityNonce = randomBytes(16);
    const authorityDummyCiphertext = authorityCipher.encrypt([0n], authorityNonce);

    // ── Step 7: Queue real MPC tally computation ───────────────────────────
    const computationOffsetBytes = randomBytes(8);
    const computationOffset = new BN(computationOffsetBytes, "hex");

    // Subscribe to the callback event BEFORE queuing the computation
    const tallyCallbackEventPromise =
      awaitProgramEvent<{
        proposalId: BN;
        encryptedResult: number[];
        nonce: number[];
      }>(program, "tallyCallbackEvent");

    console.log("[7/9] Queueing Arcium MPC tally computation...");
    const tallyTx = await program.methods
      .tallyVotes(
        proposalId,
        computationOffset,
        Array.from(authorityDummyCiphertext[0]),
        Array.from(authorityPubKey),
        new BN(deserializeLE(authorityNonce).toString())
      )
      .accountsPartial({
        authority: owner.publicKey,
        proposal: proposalPDA,
        allVotesStore: voteStorePDA,
        ...getTallyAccounts(computationOffset),
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    console.log("    MPC computation queued — tx:", tallyTx);
    console.log(
      "    Awaiting Arcium cluster finalization (~30s — real MPC, not simulated)..."
    );

    // ── Step 8: Wait for Arcium MPC cluster to execute and callback ────────
    // The Arcium network will:
    //   a) Pull the computation from the mempool
    //   b) Fetch all encrypted vote inputs from the on-chain AllVotesStore
    //   c) Distribute the circuit across Arx nodes via secret sharing
    //   d) Execute the tally_votes circuit over encrypted data
    //   e) Aggregate partial results and produce a signed output
    //   f) Call tally_votes_callback on our program with the encrypted result
    const finalizeSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("    MPC computation finalized — sig:", finalizeSig);

    const callbackEvent = await tallyCallbackEventPromise;
    console.log(
      "    Callback event received:",
      JSON.stringify({
        proposalId: callbackEvent.proposalId.toString(),
        encryptedResult: Buffer.from(callbackEvent.encryptedResult).toString(
          "hex"
        ),
        nonce: Buffer.from(callbackEvent.nonce).toString("hex"),
      })
    );

    // ── Step 9: Decrypt the tally result ──────────────────────────────────
    // The authority uses their x25519 private key + the MXE public key to derive
    // the shared secret, then uses RescueCipher to decrypt the packed u64 result.
    console.log("[8/9] Decrypting MPC tally result with authority key...");
    const encryptedResultBytes = new Uint8Array(callbackEvent.encryptedResult);
    const resultNonceBytes = new Uint8Array(callbackEvent.nonce);

    const decryptedPacked = authorityCipher.decrypt(
      [encryptedResultBytes],
      resultNonceBytes
    )[0]; // BigInt

    // Unpack: yes_count in high 32 bits, no_count in low 32 bits
    const yesCount = Number(decryptedPacked >> 32n);
    const noCount = Number(decryptedPacked & 0xffffffffn);

    console.log(`    Decrypted tally: YES=${yesCount}, NO=${noCount}`);

    // Validate against expected test outcome
    expect(yesCount).to.equal(2, "Expected 2 YES votes");
    expect(noCount).to.equal(1, "Expected 1 NO vote");

    // ── Step 10: Publish tally on-chain ───────────────────────────────────
    console.log("[9/9] Publishing final tally on-chain...");
    const publishTx = await program.methods
      .publishTally(proposalId, yesCount, noCount)
      .accounts({
        authority: owner.publicKey,
        proposal: proposalPDA,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("    Publish tx:", publishTx);

    // ── Step 11: Verify final on-chain state ──────────────────────────────
    const finalProposal = await program.account.proposal.fetch(proposalPDA);

    expect(finalProposal.status).to.deep.equal(
      { finalized: {} },
      "Proposal should be Finalized"
    );
    expect(finalProposal.yesCount).to.equal(2, "yes_count mismatch");
    expect(finalProposal.noCount).to.equal(1, "no_count mismatch");
    expect(finalProposal.votesCast).to.equal(3, "votes_cast mismatch");
    expect(finalProposal.finalizedAt).to.not.be.null;

    console.log("\n===== TEST PASSED =====");
    console.log(
      "Full privacy-preserving MPC voting lifecycle completed successfully."
    );
    console.log(`  Proposal:  ${proposalPDA.toBase58()}`);
    console.log(`  Votes cast: ${finalProposal.votesCast}/10`);
    console.log(`  YES: ${finalProposal.yesCount}`);
    console.log(`  NO:  ${finalProposal.noCount}`);
    console.log(
      "  Privacy guarantee: individual vote choices were NEVER exposed."
    );
    console.log("  MPC cluster signature: verified on-chain via verify_output().");
    console.log("=========================\n");
  });

  // ── Test: Initialize computation definition ─────────────────────────────
});
