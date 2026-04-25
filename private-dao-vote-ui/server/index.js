import http from "node:http";
import { URL } from "node:url";

import anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  awaitComputationFinalization,
  getArciumProgramId,
  getClockAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
} from "@arcium-hq/client";

const { AnchorProvider, BN } = anchor;

const PORT = Number(process.env.PORT || 8787);
const ALLOW_ORIGIN = process.env.ARCVOTE_ALLOW_ORIGIN || "*";
const DEFAULT_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID =
  process.env.PROGRAM_ID || "3MuQxYfLEAuMCN2S3XTrQDSBmqtGDwBZjb2zgjLmMA7p";
const DEFAULT_CLUSTER_OFFSET = Number(process.env.CLUSTER_OFFSET || 456);
const DEFAULT_CIRCUIT_NAME = process.env.ARCIUM_CIRCUIT_NAME || "tally_votes";

function writeJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function handleOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

function parseProgramId(value) {
  return new PublicKey(value || DEFAULT_PROGRAM_ID);
}

function parseClusterOffset(value) {
  return value ? Number(value) : DEFAULT_CLUSTER_OFFSET;
}

function createReadonlyProvider(rpcUrl = DEFAULT_RPC_URL) {
  const connection = new Connection(rpcUrl, "confirmed");
  return new AnchorProvider(
    connection,
    {
      publicKey: new PublicKey("11111111111111111111111111111111"),
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    },
    { commitment: "confirmed" },
  );
}

async function handleHealth(res) {
  writeJson(res, 200, {
    ok: true,
    rpc: DEFAULT_RPC_URL,
    clusterOffset: DEFAULT_CLUSTER_OFFSET,
    programId: DEFAULT_PROGRAM_ID,
  });
}

async function handleMxePublicKey(res, searchParams) {
  const provider = createReadonlyProvider(searchParams.get("rpcUrl") || DEFAULT_RPC_URL);
  const programId = parseProgramId(searchParams.get("programId"));

  const key = await getMXEPublicKey(provider, programId);
  if (!key) {
    writeJson(res, 404, {
      error: "MXE public key not initialized yet",
      programId: programId.toBase58(),
    });
    return;
  }

  writeJson(res, 200, {
    key: Array.from(key),
    programId: programId.toBase58(),
    rpc: provider.connection.rpcEndpoint,
  });
}

async function handleAccounts(res, searchParams) {
  const programId = parseProgramId(searchParams.get("programId"));
  const clusterOffset = parseClusterOffset(searchParams.get("clusterOffset"));
  const circuitName = searchParams.get("circuitName") || DEFAULT_CIRCUIT_NAME;
  const computationOffsetRaw = searchParams.get("computationOffset");

  if (!computationOffsetRaw || !/^\d+$/.test(computationOffsetRaw)) {
    writeJson(res, 400, { error: "Missing or invalid computationOffset" });
    return;
  }

  const computationOffset = new BN(computationOffsetRaw);
  const compDefOffset = Buffer.from(getCompDefAccOffset(circuitName)).readUInt32LE(0);
  const [signPdaAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("ArciumSignerAccount")],
    programId,
  );

  writeJson(res, 200, {
    signPdaAccount: signPdaAccount.toBase58(),
    computationAccount: getComputationAccAddress(clusterOffset, computationOffset).toBase58(),
    clusterAccount: getClusterAccAddress(clusterOffset).toBase58(),
    mxeAccount: getMXEAccAddress(programId).toBase58(),
    mempoolAccount: getMempoolAccAddress(clusterOffset).toBase58(),
    executingPool: getExecutingPoolAccAddress(clusterOffset).toBase58(),
    compDefAccount: getCompDefAccAddress(programId, compDefOffset).toBase58(),
    poolAccount: getFeePoolAccAddress().toBase58(),
    clockAccount: getClockAccAddress().toBase58(),
    arciumProgram: getArciumProgramId().toBase58(),
    compDefOffset,
    circuitName,
    clusterOffset,
  });
}

async function handleAwaitComputation(req, res) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  let parsed;
  try {
    parsed = JSON.parse(body || "{}");
  } catch {
    writeJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { programId, computationOffset, commitment = "confirmed", rpcUrl } = parsed ?? {};
  if (!programId || computationOffset === undefined) {
    writeJson(res, 400, { error: "Missing programId or computationOffset" });
    return;
  }

  const provider = createReadonlyProvider(rpcUrl || DEFAULT_RPC_URL);
  const signature = await awaitComputationFinalization(
    provider,
    new BN(computationOffset),
    parseProgramId(programId),
    commitment,
  );

  writeJson(res, 200, {
    ok: true,
    signature,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  try {
    if (req.method === "OPTIONS") {
      handleOptions(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/arcium/await-computation") {
      await handleAwaitComputation(req, res);
      return;
    }

    if (req.method !== "GET") {
      writeJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (url.pathname === "/health") {
      await handleHealth(res);
      return;
    }

    if (url.pathname === "/api/arcium/mxe-public-key") {
      await handleMxePublicKey(res, url.searchParams);
      return;
    }

    if (url.pathname === "/api/arcium/accounts") {
      await handleAccounts(res, url.searchParams);
      return;
    }

    writeJson(res, 404, { error: "Not found" });
  } catch (error) {
    writeJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`ArcVote helper backend listening on http://localhost:${PORT}`);
});
