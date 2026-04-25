# ArcVote

Private governance on Solana with Arcium MPC.

ArcVote is a privacy-preserving DAO governance app where proposals are public, vote direction stays encrypted, and only the final aggregate tally is revealed after Arcium executes the tally inside encrypted shared state.

This repository contains:

- `private-dao-vote/` - the Arcium + Anchor onchain workspace
- `private-dao-vote-ui/` - the React frontend and helper backend

## Why ArcVote

Most governance systems leak signal before a vote ends. Wallets can watch the chain, infer momentum, and react before the final tally. ArcVote removes that problem by encrypting vote direction before submission and delegating tally computation to Arcium's MPC network.

The result is a governance flow where:

- proposal metadata is public
- wallet participation is still publicly observable onchain
- individual vote direction remains private
- only the final aggregate result is revealed

## How Arcium Is Used

Arcium is the privacy layer that makes confidential tallying possible.

In ArcVote:

- the browser fetches the MXE x25519 public key
- each vote is encrypted client-side with x25519 ECDH + RescueCipher before the transaction is sent
- ciphertext ballots are stored on Solana, not plaintext votes
- after the proposal deadline, the authority queues a tally computation through the deployed MXE
- Arcium's MPC network executes the tally circuit over encrypted inputs
- the callback result is verified onchain before the final tally is published

This means ArcVote does not trust a single backend, validator, or coordinator to keep vote direction private.

## Privacy Model

| Public on Solana | Private in ArcVote |
| --- | --- |
| Proposal title, summary, and timing | Each wallet's vote direction |
| The fact that a wallet participated | Per-ballot plaintext values |
| Proposal lifecycle state | Intermediate tally state |
| Final aggregate result | Individual YES/NO choice |

Important note: ArcVote protects ballot direction, not wallet anonymity. Participation can still be discovered from onchain activity.

## n8n-Style Workflow

```mermaid
flowchart LR
    classDef surface fill:#12101c,stroke:#7c3aed,color:#f5f2ff,stroke-width:1px;
    classDef state fill:#181621,stroke:#413a67,color:#d8d3ef,stroke-width:1px;
    classDef arcium fill:#171326,stroke:#8b5cf6,color:#efe8ff,stroke-width:2px;
    classDef result fill:#141d1c,stroke:#22c55e,color:#e9fff5,stroke-width:1px;

    A[Draft Proposal]:::surface --> B[Create Proposal PDA]:::state
    B --> C[Initialize Fixed Ballot Store<br/>10 encrypted slots]:::state

    D[Wallet Chooses Vote]:::surface --> E[Encrypt Vote In Browser<br/>x25519 + RescueCipher]:::arcium
    E --> F[Submit Ciphertext Ballot]:::state
    F --> C

    C --> G[Proposal Deadline Reached]:::surface
    G --> H[Authority Queues Tally]:::state
    H --> I[Arcium MXE]:::arcium
    I --> J[Encrypted MPC Tally Execution]:::arcium
    J --> K[Callback Output Verified Onchain]:::state
    K --> L[Publish Aggregate Result]:::result
```

## Architecture

### Onchain workspace

- `private-dao-vote/programs/private_voting/src/lib.rs`
  Solana program for proposal creation, vote casting, tally queueing, callback handling, and result publication.
- `private-dao-vote/encrypted-ixs/src/lib.rs`
  Arcis circuit that tallies encrypted votes.
- `private-dao-vote/tests/private_voting.ts`
  End-to-end Arcium devnet test covering proposal creation, encrypted voting, MPC tally, callback, decrypt, and publish.

### Frontend

- `private-dao-vote-ui/src/App.jsx`
  Main app shell and proposal detail experience.
- `private-dao-vote-ui/src/lib/encryption.js`
  Client-side vote encryption and tally decryption helpers.
- `private-dao-vote-ui/src/lib/solana.js`
  Program factory, PDA helpers, status modeling, and formatting.
- `private-dao-vote-ui/src/components/`
  Proposal list, create modal, vote modal, tally panel, result display, and status components.

### Helper backend

- `private-dao-vote-ui/server/index.js`
  Small read-only Node server used for:
  - MXE public key lookup
  - Arcium account derivation
  - computation finalization polling

Vote encryption intentionally stays in the browser so plaintext vote intent does not leave the client.

## Live Deployment

- Network: `Solana Devnet`
- Cluster offset: `456`
- Program ID: `3MuQxYfLEAuMCN2S3XTrQDSBmqtGDwBZjb2zgjLmMA7p`
- Circuit source:
  `https://zxfradkkhbepggmffgav.supabase.co/storage/v1/object/public/arcvote/tally_votes.arcis`

## Current Governance Model

- Fixed maximum ballot count per proposal: `10`
- Optional voter whitelist per proposal: supported
- Vote encoding:
  - `1` = YES
  - `2` = NO
  - `0` = empty slot / abstain padding
- Result publication reveals only aggregate counts
- Tally execution happens after the vote deadline

The fixed ballot count exists because the Arcis tally circuit is compiled with a fixed structure.

## Quick Start

### 1. Onchain workspace

Use WSL/Ubuntu for Arcium development.

```bash
cd private-dao-vote
arcium build
arcium test --cluster devnet --skip-build
```

### 2. Frontend

```bash
cd private-dao-vote-ui
npm install --legacy-peer-deps
npm run server
```

In a second terminal:

```bash
cd private-dao-vote-ui
npm run dev
```

Open `http://localhost:5173`.

## Demo Flow

1. Connect a devnet wallet.
2. Create a proposal with a short deadline.
3. Cast encrypted votes from one or more devnet wallets.
4. Wait for the voting deadline to expire.
5. Trigger MPC finalization with the authority wallet.
6. Publish the verified aggregate result.

## What Judges Should Look For

- Real Arcium integration, not mocked privacy
- Client-side ballot encryption before transaction submission
- Onchain callback verification before result publication
- Clean UX for proposal creation, voting, tallying, and result reveal
- Clear separation between public governance state and private ballot direction

## Repository Layout

```text
arcvote/
|- README.md
|- private-dao-vote/
|  |- Anchor.toml
|  |- Arcium.toml
|  |- encrypted-ixs/
|  |- programs/private_voting/
|  `- tests/
`- private-dao-vote-ui/
   |- server/
   |- src/
   |- package.json
   `- vite.config.js
```

## Stack

- Arcium `0.9.x`
- Anchor `0.32.x`
- Solana Devnet
- React `19`
- Vite `6`
- TailwindCSS `3`

## Status

ArcVote currently supports a working end-to-end private governance flow on Solana devnet:

- proposal creation
- encrypted ballot casting
- Arcium MPC tally execution
- verified callback handling
- final result publication

## License

MIT. See [LICENSE](LICENSE).
