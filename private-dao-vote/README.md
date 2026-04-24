# ARCVOTE — Private DAO Governance on Arcium × Solana

**Privacy-preserving DAO voting powered by Arcium's real MPC network on Solana devnet.**

Every vote is encrypted client-side with x25519 ECDH + RescueCipher before hitting the chain.
Tallies are computed inside Arcium's encrypted MPC cluster — no individual node ever sees a plaintext vote.
Only the aggregate result, signed by the MPC cluster as a cryptographic correctness proof, is published on-chain.

---

## Privacy Guarantee

| What is public | What is private |
|---|---|
| WHO voted (wallet address) | HOW they voted (YES or NO) |
| WHEN they voted | |
| That A vote was cast | |

Privacy is **mathematical** (cryptographic encryption), not trust-based. The encrypted ciphertexts on devnet are visible in transactions, but the vote content is opaque.

---

## Architecture

```
[Voter] ──encrypt locally──▶ [cast_vote ix] ──store ciphertext──▶ [AllVotesStore PDA]
                                                                           │
[Authority] ──after end_time──▶ [tally_votes ix] ──queue MPC──▶ [Arcium Program]
                                                                           │
[Arcium MPC Cluster] ──execute circuit, sign result──▶ [tally_votes_callback ix]
                                                                           │
[Authority] ──decrypt + publish──▶ [Proposal PDA = finalized with public counts]
```

---

## Repository Structure

```
private-dao-vote/               ← Arcium MXE project (Rust + TypeScript)
├── Arcium.toml                 ← Arcium workspace config (offset=456)
├── Anchor.toml                 ← Anchor workspace config
├── Cargo.toml                  ← Rust workspace
├── tsconfig.json               ← TypeScript config for tests
├── package.json                ← JS dependencies (@arcium-hq/client@0.9.2)
├── programs/private_voting/
│   ├── Cargo.toml
│   └── src/lib.rs              ← Solana Anchor program (6 instructions)
├── encrypted-ixs/
│   ├── Cargo.toml
│   └── src/lib.rs              ← Arcis MPC circuit (tally_votes)
└── tests/private_voting.ts     ← Full end-to-end integration test

private-dao-vote-ui/            ← React 19 + Vite + TailwindCSS 3 frontend
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx                 ← Root + hash-based routing
    ├── index.css               ← Design system CSS variables
    ├── constants.js            ← PROGRAM_ID, CLUSTER_OFFSET, etc.
    ├── idl/private_voting.json ← Copy from target/idl after build
    ├── lib/
    │   ├── arcium.js           ← MXE key fetch, account derivation
    │   ├── encryption.js       ← x25519 + RescueCipher helpers
    │   └── solana.js           ← Connection, PDA helpers, formatting
    └── components/
        ├── WalletProvider.jsx
        ├── Header.jsx
        ├── ProposalList.jsx
        ├── ProposalCard.jsx
        ├── CreateProposalModal.jsx
        ├── VoteModal.jsx
        ├── TallyPanel.jsx
        ├── ResultDisplay.jsx
        ├── StatusBadge.jsx
        └── icons/              ← Custom SVG icon components
```

---

## Prerequisites

```bash
# Arcium CLI v0.9.x (CRITICAL — must be this version)
arcup self update
arcup update
arcium --version   # Must show 0.9.x

# Solana CLI 2.3.0
solana --version

# Anchor 0.32.x
anchor --version

# Rust 2021 edition
rustup update stable
```

---

## Step-by-Step Deployment

### Step 1 — Initialize the MXE project

```bash
arcium init private-dao-vote
cd private-dao-vote
```

Replace the generated files with those from this repository:
- `programs/private_voting/src/lib.rs`
- `encrypted-ixs/src/lib.rs`
- All `Cargo.toml` files
- `Arcium.toml`, `Anchor.toml`, `tsconfig.json`, `package.json`
- `tests/private_voting.ts`

### Step 2 — Update dependency versions

All `Cargo.toml` files must use exactly:

```toml
arcium-anchor = "0.9.2"
arcium-client = "0.9.2"
arcium-macros = "0.9.2"
arcis = "0.9.2"          # in encrypted-ixs/Cargo.toml
anchor-lang = "0.32.0"
```

### Step 3 — Build

```bash
arcium build
```

This compiles both the Solana program AND the Arcis MPC circuit. Outputs:
- `target/deploy/private_voting.so`
- `target/idl/private_voting.json`
- `build/tally_votes.arcis`
- `build/tally_votes.hash`

### Step 4 — Fund devnet wallet

```bash
solana config set --url devnet
solana airdrop 5 $(solana address) --url devnet
solana balance --url devnet
```

### Step 5 — Deploy to devnet

```bash
arcium deploy \
  --cluster-offset 456 \
  --recovery-set-size 4 \
  -k ~/.config/solana/id.json \
  --rpc-url https://api.devnet.solana.com \
  --mempool-size Small
```

> **v0.9.x CLI notes:**
> - Use `-k` (not `-kp`)
> - No `--authority` flag — the `-k` keypair IS the authority
> - If interrupted: add `--resume` to continue

### Step 6 — Record your Program ID

```bash
solana address -k target/deploy/private_voting-keypair.json
```

Update this address in **four places**:

1. `programs/private_voting/src/lib.rs` → `declare_id!("YOUR_PROGRAM_ID")`
2. `Arcium.toml` → `[programs.devnet] private_voting = "YOUR_PROGRAM_ID"`
3. `Anchor.toml` → `[programs.devnet] private_voting = "YOUR_PROGRAM_ID"`
4. `private-dao-vote-ui/src/constants.js` → `PROGRAM_ID = "YOUR_PROGRAM_ID"`
5. `private-dao-vote-ui/src/idl/private_voting.json` → `"address": "YOUR_PROGRAM_ID"`

### Step 7 — Rebuild after updating Program ID

```bash
arcium build
```

### Step 8 — Check MXE info

```bash
arcium mxe-info
# Shows X25519, Ed25519, ElGamal keys + MXE cluster status
# (Replaces the old `mxe-keys` command from pre-v0.9.x)
```

### Step 9 — Initialize computation definition

```bash
yarn install
arcium test --cluster devnet
```

Or call `initTallyVotesCompDef` directly from a script. This only needs to be done **once** after deployment.

### Step 10 — Run integration tests

```bash
# Ensure ANCHOR_PROVIDER_URL and ANCHOR_WALLET are set, then:
arcium test --cluster devnet
```

The test runs the **complete real MPC flow**: 3 encrypted votes → MPC tally (~30s) → decrypt → publish. No simulations.

### Step 11 — Set up frontend

```bash
cd ../private-dao-vote-ui

# Install dependencies
npm install

# Copy the built IDL
cp ../private-dao-vote/target/idl/private_voting.json ./src/idl/private_voting.json

# Start dev server
npm run dev
# → http://localhost:5173
```

### Step 12 — Verify on Solana Explorer

```
https://explorer.solana.com/address/YOUR_PROGRAM_ID?cluster=devnet
```

---

## Key Technical Decisions

### Why MAX_VOTERS = 10?

Arcis circuits have **fixed structure** — variable-length loops are not supported. The circuit must know at compile time exactly how many inputs to expect. Empty slots are padded with null-encrypted votes (plaintext=0), so the circuit always receives exactly 10 inputs.

### ArgBuilder Order (CRITICAL)

For each `Enc<Shared, T>` in the Arcis function signature, the ArgBuilder must provide arguments in this exact order:
```
.x25519_pubkey(pubkey)
.plaintext_u128(nonce)
.encrypted_TYPE(ciphertext)
```

For `tally_votes`: 1 authority dummy + 10 vote slots = **33 total ArgBuilder calls**.

### Vote Encoding

```
0u8 = abstain / empty slot
1u8 = YES
2u8 = NO
```

### Result Packing

The circuit returns a packed `u64`:
```
high 32 bits = yes_count
low  32 bits = no_count
```

Unpack client-side:
```js
const yesCount = Number(packed >> 32n);
const noCount  = Number(packed & 0xFFFFFFFFn);
```

### Authority Key Persistence

The authority generates a fresh x25519 keypair when initiating the tally. The public key is passed to the circuit so only they can decrypt the result. The private key is stored in `localStorage` under `authority_key_${proposalId}`.

---

## Arcium CLI v0.9.x Migration Reference

| Old command / flag | New command / flag |
|---|---|
| `-kp` | `-k` |
| `--authority` (on deploy/init-mxe) | **Removed** — keypair signer is the authority |
| `arcium mxe-keys` | `arcium mxe-info` |

---

## Troubleshooting

**`arcium deploy` fails with insufficient funds**
```bash
solana airdrop 5 $(solana address) --url devnet
```

**Build fails with version mismatch**
Ensure all Arcium crates are exactly `0.9.2`. Check `Cargo.lock` for conflicts.

**`tally_votes_callback` never fires**
- Check `arcium mxe-info` — cluster must be online
- Ensure `init_tally_votes_comp_def` was called after deployment
- Verify devnet cluster offset is 456 everywhere

**Frontend shows "SETUP REQUIRED"**
- Copy `target/idl/private_voting.json` → `src/idl/private_voting.json`
- Update `PROGRAM_ID` in `src/constants.js`

**MPC computation times out**
Arcium devnet can occasionally be slow. The `awaitComputationFinalization` function polls with retries. Wait up to 3 minutes before assuming failure.

---

## Design System

The frontend uses a custom dark purple design system with:

- **Fonts**: Syncopate (display) + JetBrains Mono (body) + Instrument Serif (descriptions)
- **Color palette**: Near-black base (#06050D) + purple hierarchy (#7C3AED primary)
- **NO emojis**: All icons are custom SVG components
- **Animations**: CSS keyframes only — fadeUp, pulseRing, scaleIn, widthGrow
- **TailwindCSS 3** (NOT v4)

---

## Security Notes

- Vote **contents** are cryptographically private (x25519 + RescueCipher)
- Vote **existence** is public (wallet address + timestamp on-chain)
- The MPC cluster's result is **verified on-chain** via `verify_output()` — cannot be tampered
- The authority cannot lie about the tally without failing the on-chain sanity check (`yes + no ≤ votes_cast`)
- Devnet SOL is the gas token — no real economic value at risk

---

*Arcium Wave 2 RTG Submission — Private DAO Voting MXE*
*Stack: Arcium 0.9.2 × Anchor 0.32 × Solana devnet × React 19 × Vite × TailwindCSS 3*
