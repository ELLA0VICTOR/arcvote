// src/lib/encryption.js
//
// Real client-side vote encryption using x25519 ECDH + RescueCipher.
// This is NOT simulated. Every function here performs genuine cryptographic
// operations compatible with Arcium's MPC cluster.
//
// Vote encoding (must match encrypted-ixs/src/lib.rs circuit):
//   0n = abstain / empty slot
//   1n = YES
//   2n = NO

import { x25519 } from "@noble/curves/ed25519";
import { RescueCipher, deserializeLE } from "@arcium-hq/client";
import { randomBytes } from "@noble/curves/abstract/utils";

/**
 * Encrypts a vote choice for on-chain submission.
 * Uses a fresh ephemeral x25519 keypair per vote so votes are unlinkable.
 *
 * @param {number} choice - 1 for YES, 2 for NO
 * @param {Uint8Array} mxePublicKey - The MXE's x25519 public key (from fetchMXEPublicKey)
 * @returns {{
 *   encryptedVote: Uint8Array,    // [u8; 32] ciphertext — stored on-chain
 *   voterPublicKey: Uint8Array,   // [u8; 32] ephemeral pubkey — stored on-chain for ECDH
 *   nonce: Uint8Array,            // [u8; 16] — stored on-chain
 *   nonceU128: bigint,            // Nonce as u128 little-endian (for Anchor instruction)
 *   privateKey: Uint8Array,       // Ephemeral private key — stored in localStorage only
 * }}
 */
export function encryptVote(choice, mxePublicKey) {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  const nonce = randomBytes(16);
  const encrypted = cipher.encrypt([BigInt(choice)], nonce);

  return {
    encryptedVote: encrypted[0],  // [u8; 32]
    voterPublicKey: publicKey,    // [u8; 32]
    nonce,                        // [u8; 16]
    nonceU128: deserializeLE(nonce),
    privateKey,
  };
}

/**
 * Generates a null/dummy encrypted vote (plaintext = 0 = abstain).
 * Used to:
 *   1. Pre-fill all 10 AllVotesStore slots at proposal creation time.
 *   2. Generate the authority's dummy input for the Arcis circuit.
 *
 * @param {Uint8Array} mxePublicKey
 * @returns {{
 *   ciphertext: Uint8Array,
 *   publicKey: Uint8Array,
 *   nonce: Uint8Array,
 *   nonceU128: bigint,
 *   privateKey: Uint8Array,
 * }}
 */
export function encryptNull(mxePublicKey) {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  const nonce = randomBytes(16);
  const encrypted = cipher.encrypt([0n], nonce);

  return {
    ciphertext: encrypted[0],
    publicKey,
    nonce,
    nonceU128: deserializeLE(nonce),
    privateKey,
  };
}

/**
 * Decrypts the packed tally result returned by the Arcium MPC callback.
 *
 * The circuit returns a packed u64:
 *   high 32 bits = yes_count
 *   low  32 bits = no_count
 *
 * @param {Uint8Array} ciphertext - [u8; 32] from the TallyCallbackEvent
 * @param {Uint8Array} nonce - [u8; 16] from the TallyCallbackEvent
 * @param {Uint8Array} authorityPrivateKey - The authority's x25519 ephemeral private key
 * @param {Uint8Array} mxePublicKey - The MXE's x25519 public key
 * @returns {{ yesCount: number, noCount: number }}
 */
export function decryptTallyResult(ciphertext, nonce, authorityPrivateKey, mxePublicKey) {
  const sharedSecret = x25519.getSharedSecret(authorityPrivateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  const decrypted = cipher.decrypt([ciphertext], nonce)[0]; // BigInt

  // Unpack the two u32 counts from the packed u64
  const yesCount = Number(decrypted >> 32n);
  const noCount = Number(decrypted & 0xffffffffn);

  return { yesCount, noCount };
}

/**
 * Converts a nonce Uint8Array (16 bytes) to bigint via little-endian u128.
 * This matches how the Solana program stores nonces.
 */
export function nonceToU128(nonce) {
  return deserializeLE(nonce);
}

/**
 * Encodes a Uint8Array as a hex string.
 */
export function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Decodes a hex string back to Uint8Array.
 */
export function fromHex(hex) {
  return new Uint8Array(Buffer.from(hex, "hex"));
}
