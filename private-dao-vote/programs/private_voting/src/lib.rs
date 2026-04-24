// programs/private_voting/src/lib.rs
//
// Private DAO Voting — Anchor + Arcium MXE Program
//
// Instructions:
//   1. init_tally_votes_comp_def  — Admin: initialize computation definition on-chain (once)
//   2. create_proposal            — Any wallet: create a new governance proposal
//   3. cast_vote                  — Voter: submit an encrypted vote ciphertext
//   4. tally_votes                — Authority: queue MPC tally after voting ends
//   5. tally_votes_callback       — Arcium MPC cluster: deliver signed encrypted result
//   6. publish_tally              — Authority: decrypt result locally, publish final counts

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{
    CallbackAccount,
    CircuitSource,
    OffChainCircuitSource,
};
use arcium_macros::circuit_hash;

pub const MAX_VOTERS: usize = 10;
const COMP_DEF_OFFSET_TALLY_VOTES: u32 = comp_def_offset("tally_votes");

// Temporary valid placeholder. Replace this with the real program pubkey
// after generating the deployment keypair for arcvote.
declare_id!("HsnCFrj5K85WYKcgA4uRLUmA1TDeWqYykCUoKwQvP1aM");

// ─────────────────────────────────────────────────────────────────────────────
// Data Types
// ─────────────────────────────────────────────────────────────────────────────

/// Current lifecycle state of a proposal.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ProposalStatus {
    /// Voting window is open — voters can cast encrypted votes.
    Active,
    /// Voting window closed, MPC tally computation has been queued.
    Tallying,
    /// Tally published on-chain — proposal is finalized.
    Finalized,
}

/// Main proposal account — stores all proposal metadata and result.
#[account]
pub struct Proposal {
    /// Unique identifier (caller-provided u64, e.g. timestamp or random)
    pub proposal_id: u64,
    /// Creator's pubkey — also the only key allowed to tally and publish
    pub authority: Pubkey,
    /// Human-readable title, max 100 chars
    pub title: String,
    /// Human-readable description, max 500 chars
    pub description: String,
    /// Unix timestamp when proposal was created
    pub created_at: i64,
    /// Unix timestamp when voting closes
    pub end_time: i64,
    /// Current lifecycle state
    pub status: ProposalStatus,
    /// How many vote slots have been filled (public metadata; NOT vote content)
    pub votes_cast: u32,
    /// Always MAX_VOTERS = 10
    pub max_voters: u32,
    // ── Null vote data (pre-generated at creation to pad empty slots) ──
    /// x25519 public key for the null encrypted vote
    pub null_vote_pubkey: [u8; 32],
    /// Ciphertext bytes of the null encrypted vote (plaintext=0, abstain)
    pub null_vote_ciphertext: [u8; 32],
    /// Nonce for the null vote encryption
    pub null_vote_nonce: u128,
    // ── MPC computation tracking ──
    /// Offset of the queued Arcium computation
    pub computation_offset: Option<u64>,
    /// Encrypted packed tally result from MPC callback (u64 big-endian wrapped)
    pub tally_ciphertext: Option<[u8; 32]>,
    /// Nonce for the tally ciphertext
    pub tally_nonce: Option<[u8; 16]>,
    // ── Final public result (set in publish_tally) ──
    pub yes_count: Option<u32>,
    pub no_count: Option<u32>,
    pub finalized_at: Option<i64>,
}

impl Proposal {
    // Space calculation:
    // discriminator  = 8
    // proposal_id    = 8
    // authority      = 32
    // title          = 4 + 100
    // description    = 4 + 500
    // created_at     = 8
    // end_time       = 8
    // status (enum)  = 1
    // votes_cast     = 4
    // max_voters     = 4
    // null_vote_pubkey      = 32
    // null_vote_ciphertext  = 32
    // null_vote_nonce       = 16
    // computation_offset    = 1 + 8 = 9
    // tally_ciphertext      = 1 + 32 = 33
    // tally_nonce           = 1 + 16 = 17
    // yes_count             = 1 + 4 = 5
    // no_count              = 1 + 4 = 5
    // finalized_at          = 1 + 8 = 9
    pub const LEN: usize = 8 + 8 + 32 + (4 + 100) + (4 + 500) + 8 + 8 + 1
        + 4 + 4 + 32 + 32 + 16 + 9 + 33 + 17 + 5 + 5 + 9;
}

/// A single vote slot inside AllVotesStore.
/// Slots are pre-filled with null votes so the circuit always receives exactly 10 inputs.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct VoteSlot {
    /// RescueCipher ciphertext of the encrypted vote (32 bytes)
    pub encrypted_vote: [u8; 32],
    /// Voter's ephemeral x25519 public key used for ECDH with the MXE
    pub voter_pubkey: [u8; 32],
    /// Encryption nonce (u128, stored as little-endian u128 on-chain)
    pub nonce: u128,
    /// Actual Solana wallet address of the voter (Pubkey::default() = empty slot)
    pub voter: Pubkey,
    /// Unix timestamp the vote was cast (0 = empty slot)
    pub voted_at: i64,
    /// Whether this slot contains a real cast vote
    pub is_cast: bool,
}

/// PDA that stores all MAX_VOTERS=10 vote slots for a single proposal.
/// Separate from Proposal to avoid hitting account size limits.
#[account]
pub struct AllVotesStore {
    pub proposal_id: u64,
    pub slots: [VoteSlot; 10],
}

impl AllVotesStore {
    // Space calculation:
    // discriminator = 8
    // proposal_id   = 8
    // slots = 10 × VoteSlot
    //   VoteSlot: encrypted_vote[32] + voter_pubkey[32] + nonce(u128=16)
    //             + voter(pubkey=32) + voted_at(i64=8) + is_cast(bool=1) = 121
    pub const LEN: usize = 8 + 8 + (10 * 121);
}

// ─────────────────────────────────────────────────────────────────────────────
// Program
// ─────────────────────────────────────────────────────────────────────────────

#[arcium_program]
pub mod private_voting {
    use super::*;

    // ── 1. Initialize computation definition ─────────────────────────────────
    /// Must be called once after deployment by any admin wallet.
    /// Registers the `tally_votes` Arcis circuit on-chain so the MPC cluster
    /// knows how to execute it.
    pub fn init_tally_votes_comp_def(
        ctx: Context<InitTallyVotesCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://zxfradkkhbepggmffgav.supabase.co/storage/v1/object/public/arcvote/tally_votes.arcis".to_string(),
                hash: circuit_hash!("tally_votes"),
            })),
            None,
        )?;
        Ok(())
    }

    // ── 2. Create proposal ───────────────────────────────────────────────────
    /// Creates a new governance proposal PDA and its associated AllVotesStore PDA.
    /// All 10 vote slots are pre-seeded with the null encrypted vote (plaintext=0).
    /// This ensures the Arcis circuit always receives exactly 10 valid ciphertexts.
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        proposal_id: u64,
        title: String,
        description: String,
        end_time: i64,
        null_vote_pubkey: [u8; 32],
        null_vote_ciphertext: [u8; 32],
        null_vote_nonce: u128,
    ) -> Result<()> {
        require!(title.len() <= 100, VotingError::TitleTooLong);
        require!(description.len() <= 500, VotingError::DescriptionTooLong);

        let clock = Clock::get()?;
        require!(end_time > clock.unix_timestamp, VotingError::InvalidEndTime);

        let proposal = &mut ctx.accounts.proposal;
        proposal.proposal_id = proposal_id;
        proposal.authority = ctx.accounts.payer.key();
        proposal.title = title;
        proposal.description = description;
        proposal.created_at = clock.unix_timestamp;
        proposal.end_time = end_time;
        proposal.status = ProposalStatus::Active;
        proposal.votes_cast = 0;
        proposal.max_voters = MAX_VOTERS as u32;
        proposal.null_vote_pubkey = null_vote_pubkey;
        proposal.null_vote_ciphertext = null_vote_ciphertext;
        proposal.null_vote_nonce = null_vote_nonce;
        proposal.computation_offset = None;
        proposal.tally_ciphertext = None;
        proposal.tally_nonce = None;
        proposal.yes_count = None;
        proposal.no_count = None;
        proposal.finalized_at = None;

        // Pre-fill ALL 10 slots with the null vote so the MPC circuit
        // always receives exactly 10 well-formed Enc<Shared, u8> inputs.
        let store = &mut ctx.accounts.all_votes_store;
        store.proposal_id = proposal_id;
        for slot in store.slots.iter_mut() {
            slot.encrypted_vote = null_vote_ciphertext;
            slot.voter_pubkey = null_vote_pubkey;
            slot.nonce = null_vote_nonce;
            slot.voter = Pubkey::default();
            slot.voted_at = 0;
            slot.is_cast = false;
        }

        emit!(ProposalCreatedEvent {
            proposal_id,
            authority: ctx.accounts.payer.key(),
            end_time,
        });

        Ok(())
    }

    // ── 3. Cast encrypted vote ───────────────────────────────────────────────
    /// Voter submits their encrypted vote. The vote ciphertext is stored on-chain
    /// in the AllVotesStore PDA. The vote content (YES/NO) is cryptographically
    /// opaque — nobody can read it from chain, only the Arcium MPC cluster can
    /// decrypt it during the tally computation.
    pub fn cast_vote(
        ctx: Context<CastVote>,
        proposal_id: u64,
        encrypted_vote: [u8; 32],
        voter_pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let store = &mut ctx.accounts.all_votes_store;
        let clock = Clock::get()?;

        require!(
            proposal.status == ProposalStatus::Active,
            VotingError::VotingNotActive
        );
        require!(
            clock.unix_timestamp <= proposal.end_time,
            VotingError::VotingEnded
        );
        require!(
            (proposal.votes_cast as usize) < MAX_VOTERS,
            VotingError::MaxVotersReached
        );

        // Prevent double voting — scan all cast slots for this wallet
        let voter_key = ctx.accounts.voter.key();
        for slot in store.slots.iter() {
            if slot.is_cast && slot.voter == voter_key {
                return Err(VotingError::AlreadyVoted.into());
            }
        }

        // Find the first empty slot and write the encrypted vote into it
        let mut vote_index: Option<usize> = None;
        for (i, slot) in store.slots.iter_mut().enumerate() {
            if !slot.is_cast {
                slot.encrypted_vote = encrypted_vote;
                slot.voter_pubkey = voter_pubkey;
                slot.nonce = nonce;
                slot.voter = voter_key;
                slot.voted_at = clock.unix_timestamp;
                slot.is_cast = true;
                vote_index = Some(i);
                break;
            }
        }
        require!(vote_index.is_some(), VotingError::MaxVotersReached);

        proposal.votes_cast += 1;

        emit!(VoteCastEvent {
            proposal_id,
            voter: voter_key,
            vote_index: vote_index.unwrap() as u32,
            voted_at: clock.unix_timestamp,
        });

        Ok(())
    }

    // ── 4. Initiate MPC tally computation ───────────────────────────────────
    /// Called by the proposal authority after the voting period ends.
    /// Builds the ArgBuilder with all 10 encrypted vote slots plus the authority's
    /// dummy encrypted input (whose owner key encrypts the result), then calls
    /// queue_computation to route the job to the Arcium MPC cluster.
    ///
    /// ArgBuilder order (CRITICAL — must match Arcis function signature exactly):
    ///   authority_dummy: pubkey → nonce → ciphertext
    ///   votes[0]:        pubkey → nonce → ciphertext
    ///   votes[1]:        pubkey → nonce → ciphertext
    ///   ... (10 total vote slots)
    pub fn tally_votes(
        ctx: Context<TallyVotes>,
        proposal_id: u64,
        computation_offset: u64,
        authority_dummy_ciphertext: [u8; 32],
        authority_pubkey: [u8; 32],
        authority_nonce: u128,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let authority_key = ctx.accounts.authority.key();
        let proposal_key = ctx.accounts.proposal.key();

        {
            let proposal = &ctx.accounts.proposal;

            require!(
                proposal.authority == authority_key,
                VotingError::Unauthorized
            );
            require!(
                proposal.status == ProposalStatus::Active,
                VotingError::VotingNotActive
            );
            require!(
                clock.unix_timestamp > proposal.end_time,
                VotingError::VotingStillActive
            );
            require!(proposal.votes_cast > 0, VotingError::NoVotesCast);
        }

        let store = &ctx.accounts.all_votes_store;

        // Build argument list for the Arcis circuit.
        // For each Enc<Shared, T>: x25519_pubkey → plaintext_u128 (nonce) → encrypted_T
        let mut args = ArgBuilder::new()
            .x25519_pubkey(authority_pubkey)
            .plaintext_u128(authority_nonce)
            .encrypted_u8(authority_dummy_ciphertext);

        // Append all 10 vote slots (includes null votes in empty slots)
        for slot in store.slots.iter() {
            args = args
                .x25519_pubkey(slot.voter_pubkey)
                .plaintext_u128(slot.nonce)
                .encrypted_u8(slot.encrypted_vote);
        }

        let callback_ix = TallyVotesCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: proposal_key,
                is_writable: true,
            }],
        )?;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Queue the MPC computation on the Arcium cluster.
        // The callback instruction (tally_votes_callback) will be invoked
        // by the Arcium network when the computation finishes.
        queue_computation(
            ctx.accounts,
            computation_offset,
            args.build(),
            vec![callback_ix],
            1,  // num_signers
            0,  // extra_compute_budget
        )?;

        let proposal = &mut ctx.accounts.proposal;
        proposal.status = ProposalStatus::Tallying;
        proposal.computation_offset = Some(computation_offset);

        emit!(TallyInitiatedEvent {
            proposal_id,
            computation_offset,
        });

        Ok(())
    }

    // ── 5. MPC callback ──────────────────────────────────────────────────────
    /// Invoked by the Arcium MPC cluster after the tally_votes circuit completes.
    /// verify_output validates the cluster's cryptographic signature over the result,
    /// ensuring the output has not been tampered with. The encrypted result is stored
    /// on the Proposal PDA for the authority to decrypt off-chain.
    #[arcium_callback(encrypted_ix = "tally_votes")]
    pub fn tally_votes_callback(
        ctx: Context<TallyVotesCallback>,
        output: SignedComputationOutputs<TallyVotesOutput>,
    ) -> Result<()> {
        // Cryptographically verify the MPC cluster's signature on the output.
        // This is the on-chain correctness proof — it guarantees the computation
        // was executed correctly by the Arx nodes.
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(TallyVotesOutput { field_0 }) => field_0,
            Err(e) => {
                msg!("MPC computation verification failed: {}", e);
                return err!(ErrorCode::AbortedComputation);
            }
        };

        // Extract and store the encrypted tally result.
        // The result is encrypted for the authority — only they can decrypt it.
        let proposal = &mut ctx.accounts.proposal;

        let ciphertext_bytes: [u8; 32] = result
            .ciphertexts[0]
            .try_into()
            .map_err(|_| VotingError::InvalidOutput)?;

        let nonce_bytes: [u8; 16] = result.nonce.to_le_bytes();

        proposal.tally_ciphertext = Some(ciphertext_bytes);
        proposal.tally_nonce = Some(nonce_bytes);

        emit!(TallyCallbackEvent {
            proposal_id: proposal.proposal_id,
            encrypted_result: ciphertext_bytes,
            nonce: nonce_bytes,
        });

        Ok(())
    }

    // ── 6. Publish final tally ───────────────────────────────────────────────
    /// The authority decrypts the tally result off-chain using their x25519 private key
    /// and submits the plaintext yes/no counts here. A sanity check ensures the counts
    /// are internally consistent with votes_cast. After this, the proposal is Finalized
    /// and the result is publicly visible on-chain.
    pub fn publish_tally(
        ctx: Context<PublishTally>,
        proposal_id: u64,
        yes_count: u32,
        no_count: u32,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(
            proposal.authority == ctx.accounts.authority.key(),
            VotingError::Unauthorized
        );
        require!(
            proposal.status == ProposalStatus::Tallying,
            VotingError::NotInTallyState
        );
        require!(
            proposal.tally_ciphertext.is_some(),
            VotingError::TallyNotReady
        );
        // Sanity: yes + no cannot exceed total votes cast
        // (remaining = abstain/null votes from empty slots)
        require!(
            (yes_count + no_count) <= proposal.votes_cast,
            VotingError::InvalidTallyResult
        );

        proposal.yes_count = Some(yes_count);
        proposal.no_count = Some(no_count);
        proposal.status = ProposalStatus::Finalized;
        proposal.finalized_at = Some(clock.unix_timestamp);

        emit!(TallyFinalizedEvent {
            proposal_id,
            yes_count,
            no_count,
            finalized_at: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Validation Structs
// ─────────────────────────────────────────────────────────────────────────────

#[init_computation_definition_accounts("tally_votes", payer)]
#[derive(Accounts)]
pub struct InitTallyVotesCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account is created and validated by the Arcium program CPI
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    /// CHECK: address_lookup_table is validated by the Arcium program CPI
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = Proposal::LEN,
        seeds = [b"proposal".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub proposal: Box<Account<'info, Proposal>>,
    #[account(
        init,
        payer = payer,
        space = AllVotesStore::LEN,
        seeds = [b"votes_store".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub all_votes_store: Box<Account<'info, AllVotesStore>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(
        mut,
        seeds = [b"proposal".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub proposal: Box<Account<'info, Proposal>>,
    #[account(
        mut,
        seeds = [b"votes_store".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub all_votes_store: Box<Account<'info, AllVotesStore>>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("tally_votes", authority)]
#[derive(Accounts)]
#[instruction(proposal_id: u64, computation_offset: u64)]
pub struct TallyVotes<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"proposal".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub proposal: Box<Account<'info, Proposal>>,
    #[account(
        seeds = [b"votes_store".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub all_votes_store: Box<Account<'info, AllVotesStore>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = authority,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account is validated by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool is validated by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account is validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_TALLY_VOTES)
    )]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("tally_votes")]
#[derive(Accounts)]
pub struct TallyVotesCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_TALLY_VOTES)
    )]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: computation_account is checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar — read-only
    pub instructions_sysvar: AccountInfo<'info>,
    // Custom extra account: the proposal to update with the encrypted tally result
    #[account(mut)]
    pub proposal: Box<Account<'info, Proposal>>,
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct PublishTally<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"proposal".as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub proposal: Box<Account<'info, Proposal>>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub authority: Pubkey,
    pub end_time: i64,
}

#[event]
pub struct VoteCastEvent {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub vote_index: u32,
    pub voted_at: i64,
}

#[event]
pub struct TallyInitiatedEvent {
    pub proposal_id: u64,
    pub computation_offset: u64,
}

#[event]
pub struct TallyCallbackEvent {
    pub proposal_id: u64,
    pub encrypted_result: [u8; 32],
    pub nonce: [u8; 16],
}

#[event]
pub struct TallyFinalizedEvent {
    pub proposal_id: u64,
    pub yes_count: u32,
    pub no_count: u32,
    pub finalized_at: i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Errors
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set in the MXE account")]
    ClusterNotSet,
}

#[error_code]
pub enum VotingError {
    #[msg("Title exceeds maximum of 100 characters")]
    TitleTooLong,
    #[msg("Description exceeds maximum of 500 characters")]
    DescriptionTooLong,
    #[msg("End time must be in the future")]
    InvalidEndTime,
    #[msg("Voting is not currently active")]
    VotingNotActive,
    #[msg("Voting period has already ended")]
    VotingEnded,
    #[msg("Voting period has not yet ended — cannot tally")]
    VotingStillActive,
    #[msg("Maximum of 10 voters reached for this proposal")]
    MaxVotersReached,
    #[msg("You have already cast a vote on this proposal")]
    AlreadyVoted,
    #[msg("Unauthorized: only the proposal authority can perform this action")]
    Unauthorized,
    #[msg("No votes have been cast — cannot tally")]
    NoVotesCast,
    #[msg("MPC tally result not yet available — callback has not fired")]
    TallyNotReady,
    #[msg("Proposal is not in Tallying state")]
    NotInTallyState,
    #[msg("Invalid tally result: yes + no counts exceed total votes cast")]
    InvalidTallyResult,
    #[msg("Invalid or malformed output from MPC computation")]
    InvalidOutput,
}
