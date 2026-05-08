# ArcVote Private Voting Program

ArcVote is the Arcium and Anchor workspace for private DAO voting on Solana devnet. The program lets a proposal authority create proposals, collect encrypted votes, queue an Arcium MPC tally, and publish only the aggregate result.

Individual vote direction is encrypted before it reaches the chain. Wallet participation and proposal metadata remain public, while YES/NO choices stay private until Arcium returns the final tally.

## Repository Structure

```text
private-dao-vote/
|- Anchor.toml
|- Arcium.toml
|- Cargo.toml
|- encrypted-ixs/
|  `- src/lib.rs
|- programs/
|  `- private_voting/src/lib.rs
|- scripts/
|- tests/
|  `- private_voting.ts
|- package.json
`- tsconfig.json
```

## Privacy Model

| Public state | Private state |
| --- | --- |
| Proposal title, summary, timing, and status | Individual vote direction |
| Wallet participation | Per-ballot plaintext values |
| Final aggregate result | Intermediate encrypted tally state |

ArcVote protects ballot direction, not wallet anonymity. A wallet that submits a transaction can still be observed on Solana.

## Program Components

- `programs/private_voting/src/lib.rs`: Anchor program for proposal creation, encrypted vote submission, MPC tally queueing, callback verification, and result publication.
- `encrypted-ixs/src/lib.rs`: Arcis circuit for tallying encrypted votes.
- `tests/private_voting.ts`: End-to-end devnet test flow.
- `scripts/init-comp-def.ts`: Computation definition initialization helper.

## Current Devnet Deployment

- Program ID: `3MuQxYfLEAuMCN2S3XTrQDSBmqtGDwBZjb2zgjLmMA7p`
- Cluster offset: `456`
- Circuit URL: `https://zxfradkkhbepggmffgav.supabase.co/storage/v1/object/public/arcvote/tally_votes.arcis`
- Fixed ballot capacity: `10`

## Vote Encoding

```text
0 = empty slot / abstain padding
1 = YES
2 = NO
```

The fixed ballot capacity is intentional. The Arcis circuit is compiled with a fixed input structure, so unused ballot slots are padded with encrypted zero values.

## Build

Use WSL or Linux for Arcium development.

```bash
arcium build
```

The build produces:

```text
target/deploy/private_voting.so
target/idl/private_voting.json
build/tally_votes.arcis
build/tally_votes.hash
```

## Deploy

```bash
RPC_URL="https://api.devnet.solana.com"

arcium deploy \
  -k ~/.config/solana/id.json \
  -o 456 \
  -r 4 \
  -p target/deploy/private_voting-keypair.json \
  -n private_voting \
  -u "$RPC_URL"
```

After deployment, update the program ID in:

- `programs/private_voting/src/lib.rs`
- `Anchor.toml`
- `Arcium.toml`
- `target/idl/private_voting.json`
- `../private-dao-vote-ui/src/constants.js`
- `../private-dao-vote-ui/src/idl/private_voting.json`

Then rebuild and initialize the computation definition.

## Initialize Computation Definition

```bash
export NODE_OPTIONS="--dns-result-order=ipv4first"
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"

yarn install
yarn init:compdef
```

## Verify MXE

```bash
RPC_URL="https://api.devnet.solana.com"

solana program show 3MuQxYfLEAuMCN2S3XTrQDSBmqtGDwBZjb2zgjLmMA7p -u "$RPC_URL"
arcium mxe-info 3MuQxYfLEAuMCN2S3XTrQDSBmqtGDwBZjb2zgjLmMA7p -u "$RPC_URL"
```

## Test

```bash
arcium test --cluster devnet
```

The test covers proposal creation, encrypted voting, MPC tally execution, callback handling, and result publication.

## Notes

- Arcium CLI `0.9.x` is expected.
- Anchor `0.32.x` is expected.
- The app targets Solana devnet.
- Devnet SOL has no real economic value.
- Authority-side x25519 material is required to decrypt the tally result before publishing.
