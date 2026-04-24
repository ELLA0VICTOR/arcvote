// encrypted-ixs/src/lib.rs
// Arcis MPC Circuit for Private DAO Voting
// Computes encrypted vote tallies inside the Arcium MPC cluster.
// No individual Arx node ever sees any plaintext vote.

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Privately tally up to 10 encrypted votes.
    ///
    /// # Arguments
    /// * `authority_dummy` - A dummy Enc<Shared, u8> from the tally authority.
    ///   Its `.owner` is used to encrypt the output for the authority so only
    ///   the authority can decrypt the final result.
    /// * `votes` - Array of MAX_VOTERS=10 encrypted u8 values.
    ///   Encoding: 0 = abstain/empty slot, 1 = YES, 2 = NO.
    ///
    /// # Returns
    /// Enc<Shared, u64> where:
    ///   - High 32 bits = yes_count
    ///   - Low  32 bits = no_count
    ///
    /// Both branches are always evaluated inside MPC (oblivious execution).
    /// This is correct and expected behavior — MPC must evaluate all branches
    /// to preserve privacy. No short-circuit evaluation occurs.
    #[instruction]
    pub fn tally_votes(
        authority_dummy: Enc<Shared, u8>,
        votes: [Enc<Shared, u8>; 10],
    ) -> Enc<Shared, u64> {
        let mut yes_count = 0u64;
        let mut no_count = 0u64;

        for vote_enc in votes.iter() {
            let v = vote_enc.to_arcis();
            // Both branches always evaluated in MPC — this is correct/expected behavior.
            // MPC must be oblivious to which branch is taken to preserve vote privacy.
            yes_count += if v == 1u8 { 1u64 } else { 0u64 };
            no_count += if v == 2u8 { 1u64 } else { 0u64 };
        }

        // Pack result: yes in high 32 bits, no in low 32 bits.
        // Arcis doesn't support bit shifting here, so use arithmetic packing.
        let packed = yes_count * 4_294_967_296u64 + no_count;

        // Encrypt output for the authority using their x25519 key
        authority_dummy.owner.from_arcis(packed)
    }
}
