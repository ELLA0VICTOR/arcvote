// IMPORTANT: Replace with your deployed program ID after running `arcium deploy`.
// This starts as a valid placeholder so the app can boot without crashing.
export const DEFAULT_PROGRAM_ID_PLACEHOLDER = "11111111111111111111111111111111";
export const PROGRAM_ID = "3MuQxYfLEAuMCN2S3XTrQDSBmqtGDwBZjb2zgjLmMA7p";
export const IS_PROGRAM_ID_PLACEHOLDER =
  PROGRAM_ID === DEFAULT_PROGRAM_ID_PLACEHOLDER;

// Arcium devnet cluster offset — fixed at 456 for devnet
export const CLUSTER_OFFSET = 456;

// Fixed compile-time constant matching the Arcis circuit's MAX_VOTERS
export const MAX_VOTERS = 10;

// Solana network
export const SOLANA_NETWORK = "devnet";

// RPC endpoint — swap for a dedicated provider (e.g. Helius) for reliability
export const SOLANA_RPC_URL = "https://api.devnet.solana.com";
// export const SOLANA_RPC_URL = "https://devnet.helius-rpc.com/?api-key=YOUR_KEY";

// ArcVote helper backend for read-only Arcium operations.
// Vote encryption stays in-browser so plaintext ballot intent never leaves the client.
export const ARCIUM_API_BASE_URL =
  import.meta.env.VITE_ARCIUM_API_BASE_URL || "/api/arcium";

// Duration options for the proposal creation modal (in seconds)
export const DURATION_OPTIONS = [
  { label: "5 minutes", value: 300 },
  { label: "15 minutes", value: 900 },
  { label: "30 minutes", value: 1800 },
  { label: "1 hour",  value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "24 hours", value: 86400 },
  { label: "72 hours", value: 259200 },
  { label: "1 week",  value: 604800 },
];

// Vote encoding — matches the Arcis circuit encoding
export const VOTE_YES     = 1;
export const VOTE_NO      = 2;
export const VOTE_ABSTAIN = 0;
