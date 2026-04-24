// src/lib/arcium.js
//
// ArcVote frontend Arcium utilities. Read-only Arcium helper calls are routed
// through the local backend so the browser does not depend on Node-only SDK paths.

import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ARCIUM_API_BASE_URL,
  CLUSTER_OFFSET,
  PROGRAM_ID,
  SOLANA_RPC_URL,
} from "../constants.js";

function apiUrl(path, params = {}) {
  const url = new URL(
    `${ARCIUM_API_BASE_URL.replace(/\/$/, "")}${path}`,
    window.location.origin,
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

/**
 * Fetches the MXE's x25519 public key from the helper backend.
 * Voters use this as the ECDH peer key when encrypting their votes.
 *
 * @param {import('@coral-xyz/anchor').AnchorProvider} provider
 * @param {string} programId
 * @returns {Promise<Uint8Array>} 32-byte x25519 public key
 */
export async function fetchMXEPublicKey(provider, programId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(
      apiUrl("/mxe-public-key", {
        programId: programId || PROGRAM_ID,
        rpcUrl: provider?.connection?.rpcEndpoint || SOLANA_RPC_URL,
      }),
    );

    if (response.ok) {
      const data = await response.json();
      return Uint8Array.from(data.key);
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  throw new Error(
    "MXE public key is not initialized yet. Finish Arcium MXE setup before encrypting votes.",
  );
}

/**
 * Derives all Arcium-related account addresses needed for queue_computation.
 *
 * @param {bigint | import('bn.js')} computationOffset
 * @param {string} [programId]
 * @returns {Promise<object>} Account address map
 */
export async function getArciumAccounts(computationOffset, programId) {
  const data = await readJson(
    await fetch(
      apiUrl("/accounts", {
        programId: programId || PROGRAM_ID,
        clusterOffset: CLUSTER_OFFSET,
        circuitName: "tally_votes",
        computationOffset: computationOffset.toString(),
      }),
    ),
  );

  return {
    signPdaAccount: new PublicKey(data.signPdaAccount),
    computationAccount: new PublicKey(data.computationAccount),
    clusterAccount: new PublicKey(data.clusterAccount),
    mxeAccount: new PublicKey(data.mxeAccount),
    mempoolAccount: new PublicKey(data.mempoolAccount),
    executingPool: new PublicKey(data.executingPool),
    compDefAccount: new PublicKey(data.compDefAccount),
    poolAccount: new PublicKey(data.poolAccount),
    clockAccount: new PublicKey(data.clockAccount),
    systemProgram: SystemProgram.programId,
    arciumProgram: new PublicKey(data.arciumProgram),
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
  const data = await readJson(
    await fetch(apiUrl("/await-computation"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        programId: programId || PROGRAM_ID,
        computationOffset: computationOffset.toString(),
        commitment: "confirmed",
        rpcUrl: provider?.connection?.rpcEndpoint || SOLANA_RPC_URL,
      }),
    }),
  );

  return data.signature;
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
    new PublicKey(programId || PROGRAM_ID),
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
    new PublicKey(programId || PROGRAM_ID),
  );
  return pda;
}
