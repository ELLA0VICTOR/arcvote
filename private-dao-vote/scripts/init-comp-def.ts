import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  getArciumProgram,
  getArciumProgramId,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import BN from "bn.js";
import idl from "../target/idl/private_voting.json";
import { PrivateVoting } from "../target/types/private_voting";

const CIRCUIT_NAME = "tally_votes";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program<PrivateVoting>(idl as PrivateVoting, provider);
  const payer = provider.wallet.publicKey;

  const mxeAccount = getMXEAccAddress(program.programId);
  const arciumProgram = getArciumProgram(provider);
  const mxeAccountData = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
  const lutOffset = new BN(mxeAccountData.lutOffsetSlot.toString());
  const compDefOffset = Buffer.from(getCompDefAccOffset(CIRCUIT_NAME)).readUInt32LE(0);
  const compDefAccount = getCompDefAccAddress(program.programId, compDefOffset);

  console.log(`Initializing ${CIRCUIT_NAME} computation definition...`);
  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log(`MXE Account: ${mxeAccount.toBase58()}`);
  console.log(`Comp Def PDA: ${compDefAccount.toBase58()}`);

  try {
    const signature = await program.methods
      .initTallyVotesCompDef()
      .accountsPartial({
        payer,
        mxeAccount,
        compDefAccount,
        addressLookupTable: getLookupTableAddress(program.programId, lutOffset),
        lutProgram: anchor.web3.AddressLookupTableProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
      })
      .rpc({ commitment: "confirmed" });

    console.log("Computation definition initialized.");
    console.log(`Signature: ${signature}`);
  } catch (error) {
    const message = `${error}`;
    if (
      message.includes("already in use") ||
      message.includes("custom program error: 0x0") ||
      message.includes("ConstraintAddress")
    ) {
      console.log("Computation definition already initialized.");
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error("Failed to initialize computation definition:", error);
  process.exit(1);
});
