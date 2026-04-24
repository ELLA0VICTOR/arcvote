// src/lib/arcium.js
//
// Arcium client utilities — account address derivation, MXE key fetching,
// computation finalization helpers.

import {
  getMXEPublicKey,
  getMXEAccAddress,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumProgramId,
  getClockAccAddress,
  getFeePoolAccAddress,
  awaitComputationFinalization,
} from "@arcium-hq/client";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { CLUSTER_OFFSET, PROGRAM_ID } from "../constants.js";

/**
 * Fetches the MXE's x25519 public key from on-chain state.
 * Voters use this as the ECDH peer key when encrypting their votes.
 *
 * @param {import('@coral-xyz/anchor').AnchorProvider} provider
 * @param {string} programId
 * @returns {Promise<Uint8Array>} 32-byte x25519 public key
 */
export async function fetchMXEPublicKey(provider, programId) {
  const mxeProgramId = new PublicKey(programId || PROGRAM_ID);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const key = await getMXEPublicKey(provider, mxeProgramId);
    if (key) {
      return key;
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  throw new Error(
    "MXE public key is not initialized yet. Finish Arcium MXE setup before encrypting votes."
  );
}

/**
 * Derives all Arcium-related account addresses needed for queue_computation.
 *
 * @param {bigint | import('bn.js')} computationOffset
 * @param {string} [programId]
 * @returns {object} Account address map
 */
export function getArciumAccounts(computationOffset, programId) {
  const pid = new PublicKey(programId || PROGRAM_ID);
  const compDefOffset = Buffer.from(getCompDefAccOffset("tally_votes")).readUInt32LE(0);
  const [signPdaAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("ArciumSignerAccount")],
    pid
  );

  return {
    signPdaAccount,
    computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
    clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
    mxeAccount: getMXEAccAddress(pid),
    mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
    executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
    compDefAccount: getCompDefAccAddress(pid, compDefOffset),
    poolAccount: getFeePoolAccAddress(),
    clockAccount: getClockAccAddress(),
    systemProgram: SystemProgram.programId,
    arciumProgram: getArciumProgramId(),
  };
}

/**
 * Polls for Arcium MPC computation finalization.
 * Returns the transaction signature of the callback instruction.
 *
 * @param {import('@coral-xyz/anchor').AnchorProvider} provider
 * @param {bigint | import('bn.js')} computationOffset
 * @param {string} [programId]
 * @returns {Promise<string>} Transaction signature
 */
export async function waitForComputation(provider, computationOffset, programId) {
  return awaitComputationFinalization(
    provider,
    computationOffset,
    new PublicKey(programId || PROGRAM_ID),
    "confirmed"
  );
}

/**
 * Derives the Proposal PDA for a given proposal ID.
 *
 * @param {import('bn.js')} proposalId
 * @param {string} programId
 * @returns {import('@solana/web3.js').PublicKey}
 */
export function getProposalPDA(proposalId, programId) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
    new PublicKey(programId || PROGRAM_ID)
  );
  return pda;
}

/**
 * Derives the AllVotesStore PDA for a given proposal ID.
 *
 * @param {import('bn.js')} proposalId
 * @param {string} programId
 * @returns {import('@solana/web3.js').PublicKey}
 */
export function getVoteStorePDA(proposalId, programId) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("votes_store"), proposalId.toArrayLike(Buffer, "le", 8)],
    new PublicKey(programId || PROGRAM_ID)
  );
  return pda;
}
