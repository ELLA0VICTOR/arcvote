// src/lib/solana.js
//
// Solana connection helpers, program initialization, and PDA derivation.

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { PROGRAM_ID, SOLANA_RPC_URL } from "../constants.js";

/**
 * Creates a Solana connection to devnet.
 */
export function createConnection() {
  return new Connection(SOLANA_RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
}

/**
 * Creates an Anchor Program instance from a wallet and IDL.
 *
 * @param {import('@solana/wallet-adapter-react').WalletContextState} wallet
 * @param {Connection} connection
 * @param {object} idl
 * @returns {Program}
 */
export function createProgram(wallet, connection, idl) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  return new Program(idl, new PublicKey(PROGRAM_ID), provider);
}

/**
 * Formats a Solana public key as a truncated address string: XXXX...XXXX
 * @param {PublicKey | string} pubkey
 * @returns {string}
 */
export function formatAddress(pubkey) {
  const str = typeof pubkey === "string" ? pubkey : pubkey.toBase58();
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

/**
 * Formats a Unix timestamp to a human-readable date string.
 * @param {number | BN} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
  const ts = typeof timestamp === "object" ? timestamp.toNumber() : timestamp;
  const d = new Date(ts * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats a remaining time as "Xd Xh Xm" string.
 * @param {number} endTimestamp - Unix timestamp (seconds)
 * @returns {string}
 */
export function formatTimeRemaining(endTimestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = endTimestamp - now;
  if (diff <= 0) return "ENDED";
  const days  = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins  = Math.floor((diff % 3600) / 60);
  if (days > 0)  return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${mins}M`;
  return `${mins}M`;
}

/**
 * Returns a Solana Explorer link for a given transaction signature or address.
 * @param {string} value - Tx sig or public key
 * @param {'tx' | 'address'} type
 * @returns {string}
 */
export function explorerUrl(value, type = "tx") {
  return `https://explorer.solana.com/${type}/${value}?cluster=devnet`;
}

/**
 * Generates a random u64 as a BN, suitable for a unique proposal ID.
 * @returns {BN}
 */
export function randomU64() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return new BN(bytes, undefined, "le");
}

/**
 * Generates a random u64 as a bigint, suitable for computation_offset.
 * @returns {bigint}
 */
export function randomComputationOffset() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let result = 0n;
  for (let i = 7; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Fetches all proposals from the program and sorts by created_at descending.
 * @param {Program} program
 * @returns {Promise<Array>}
 */
export async function fetchAllProposals(program) {
  try {
    const proposals = await program.account.proposal.all();
    return proposals.sort(
      (a, b) => b.account.createdAt.toNumber() - a.account.createdAt.toNumber()
    );
  } catch (e) {
    console.error("Failed to fetch proposals:", e);
    return [];
  }
}

/**
 * Returns the proposal status as a string key.
 * @param {object} proposal - Proposal account data
 * @returns {'active' | 'tallying' | 'finalized'}
 */
export function getProposalStatus(proposal) {
  if (proposal.status.active !== undefined)    return "active";
  if (proposal.status.tallying !== undefined)  return "tallying";
  if (proposal.status.finalized !== undefined) return "finalized";
  return "active";
}

/**
 * Returns whether the voting period has ended.
 * @param {object} proposal
 * @returns {boolean}
 */
export function isVotingEnded(proposal) {
  return Math.floor(Date.now() / 1000) > proposal.endTime.toNumber();
}
