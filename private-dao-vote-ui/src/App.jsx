import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";

import Header from "./components/Header.jsx";
import ProposalList from "./components/ProposalList.jsx";
import CreateProposalModal from "./components/CreateProposalModal.jsx";
import VoteModal from "./components/VoteModal.jsx";
import TallyPanel from "./components/TallyPanel.jsx";
import ResultDisplay from "./components/ResultDisplay.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import BrandMarkIcon from "./components/icons/BrandMarkIcon.jsx";
import LockIcon from "./components/icons/LockIcon.jsx";
import ShieldIcon from "./components/icons/ShieldIcon.jsx";
import TallyIcon from "./components/icons/TallyIcon.jsx";

import {
  createProgram,
  formatAddress,
  formatDate,
  formatTimeRemaining,
  getProposalAccessLabel,
  getProposalStatus,
  isWalletAllowedToVote,
  isInTallyQueue,
  isVotingEnded,
} from "./lib/solana.js";
import { IS_PROGRAM_ID_PLACEHOLDER } from "./constants.js";

let idlCache = null;

async function loadIdl() {
  if (idlCache) return idlCache;

  try {
    const mod = await import("./idl/private_voting.json");
    idlCache = mod.default ?? mod;
    return idlCache;
  } catch (error) {
    console.error("[ARCVOTE] Failed to load IDL:", error);
    return null;
  }
}

function SetupState() {
  return (
    <div className="glass-card p-12 text-center animate-fade-in">
      <BrandMarkIcon
        size={36}
        color="var(--purple-accent)"
        className="mx-auto mb-4"
      />
      <h3
        className="text-2xl font-display font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Frontend Setup Required
      </h3>
      <p className="text-sm font-body max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
        Copy the latest built IDL into <code>src/idl/private_voting.json</code> and
        keep the deployed program id configured in <code>src/constants.js</code> so
        the governance interface can bind to the live ArcVote program.
      </p>
    </div>
  );
}

function ProposalDetail({
  proposal,
  idl,
  isAuthority,
  canVote,
  walletConnected,
  walletEligible,
  proposalStatus,
  votingEnded,
  onBack,
  onVoteClick,
  onTallyComplete,
}) {
  if (!proposal) return null;

  const account = proposal.account;
  const [, setClockTick] = useState(0);
  const showTallyPanel = isAuthority && isInTallyQueue(account);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [proposal.publicKey.toBase58()]);

  const detailMetrics = [
    {
      label: "Created",
      value: formatDate(account.createdAt.toNumber()),
    },
    {
      label: votingEnded ? "Ended" : "Time Remaining",
      value: votingEnded
        ? formatDate(account.endTime.toNumber())
        : formatTimeRemaining(account.endTime.toNumber()),
    },
    {
      label: "Votes Cast",
      value: `${account.votesCast}/${account.maxVoters}`,
    },
    {
      label: "Access",
      value: getProposalAccessLabel(account),
    },
    {
      label: "Authority",
      value: `${account.authority.toBase58().slice(0, 6)}...${account.authority
        .toBase58()
        .slice(-4)}`,
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <button
        onClick={onBack}
        className="btn-secondary w-full sm:w-auto"
        style={{ color: "var(--text-secondary)" }}
      >
        Back to Governance Queue
      </button>

      <div className="glass-card p-5 sm:p-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={proposalStatus} />
              <div
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  background: "rgb(255 255 255 / 0.05)",
                  color: "var(--text-secondary)",
                }}
              >
                PRIVATE GOVERNANCE
              </div>
            </div>
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-display font-bold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {account.title}
            </h1>
            <p
              className="text-base max-w-3xl font-body"
              style={{ color: "var(--text-secondary)" }}
            >
              {account.description}
            </p>
          </div>

          {canVote && (
            <button onClick={onVoteClick} className="btn-primary w-full sm:w-auto whitespace-nowrap">
              Cast Encrypted Vote
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
          {detailMetrics.map((metric) => (
            <div key={metric.label} className="detail-stat">
              <div className="text-xs font-mono mb-2" style={{ color: "var(--text-secondary)" }}>
                {metric.label.toUpperCase()}
              </div>
              <div className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {account.isWhitelistEnabled && (
          <div
            className="mb-6 p-4 space-y-3"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "12px",
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div
                  className="text-xs font-mono mb-1"
                  style={{ color: "var(--purple-accent)" }}
                >
                  ELIGIBLE VOTERS
                </div>
                <div
                  className="text-sm font-body"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {account.allowedVoters.length} approved wallet
                  {account.allowedVoters.length === 1 ? "" : "s"} can vote on this proposal.
                </div>
              </div>
              <div
                className="text-xs font-mono"
                style={{
                  color: walletEligible
                    ? "var(--purple-accent)"
                    : "var(--text-secondary)",
                }}
              >
                {walletEligible ? "CONNECTED WALLET IS ELIGIBLE" : "WHITELISTED ACCESS"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {account.allowedVoters.map((voter) => (
                <div
                  key={voter.toBase58()}
                  className="px-3 py-2 text-xs font-mono"
                  style={{
                    background: "rgb(139 92 246 / 0.08)",
                    border: "1px solid rgb(139 92 246 / 0.18)",
                    borderRadius: "6px",
                    color: "var(--text-primary)",
                  }}
                >
                  {formatAddress(voter)}
                </div>
              ))}
            </div>
          </div>
        )}

        {!votingEnded && (
          <div
            className="mb-6 p-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            style={{
              background: "rgb(139 92 246 / 0.08)",
              border: "1px solid rgb(139 92 246 / 0.2)",
              borderRadius: "12px",
            }}
          >
            <div>
              <div
                className="text-xs font-mono mb-1"
                style={{ color: "var(--purple-accent)" }}
              >
                LIVE COUNTDOWN
              </div>
              <div
                className="text-lg font-display font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {formatTimeRemaining(account.endTime.toNumber())}
              </div>
            </div>
            <div
              className="text-xs font-mono text-left sm:text-right"
              style={{ color: "var(--text-secondary)" }}
            >
              ENDS {formatDate(account.endTime.toNumber())}
            </div>
          </div>
        )}

        {!canVote && walletConnected && proposalStatus === "active" && !votingEnded && !walletEligible && (
          <div
            className="p-4"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "12px",
            }}
          >
            <div
              className="text-xs font-mono mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              VOTING ACCESS
            </div>
            <div
              className="text-sm font-body"
              style={{ color: "var(--text-secondary)" }}
            >
              This proposal is restricted. Connect one of the approved wallets to cast a ballot.
            </div>
          </div>
        )}

      </div>

      <div className="space-y-6">
        {showTallyPanel && (
          <TallyPanel
            proposal={account}
            proposalId={account.proposalId}
            idl={idl}
            onComplete={onTallyComplete}
          />
        )}

        {proposalStatus === "finalized" && account.yesCount !== null && (
          <ResultDisplay proposal={account} />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [idl, setIdl] = useState(null);
  const [page, setPage] = useState("list");
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [showVote, setShowVote] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    tallying: 0,
    finalized: 0,
  });
  const selectedProposalKey = selectedProposal?.publicKey?.toBase58() ?? null;
  const selectedProposalPublicKey = selectedProposal?.publicKey ?? null;

  const setupRequired = !idl || Boolean(idl?._NOTE) || IS_PROGRAM_ID_PLACEHOLDER;

  useEffect(() => {
    loadIdl().then(setIdl);
  }, []);

  useEffect(() => {
    function onHash() {
      const hash = window.location.hash;
      if (hash.startsWith("#/proposal/")) {
        setPage("detail");
      } else {
        setPage("list");
        setSelectedProposal(null);
      }
    }
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!idl || page !== "detail" || !selectedProposalKey || !selectedProposalPublicKey) {
      return undefined;
    }

    let isCancelled = false;

    const walletInterface = connected && publicKey
      ? { publicKey, signTransaction, signAllTransactions }
      : undefined;

    async function refreshSelectedProposal() {
      try {
        const program = createProgram(walletInterface, connection, idl);
        const refreshedAccount = await program.account.proposal.fetch(selectedProposalPublicKey);

        if (!isCancelled) {
          setSelectedProposal((current) => {
            if (!current || current.publicKey.toBase58() !== selectedProposalKey) {
              return current;
            }

            return {
              publicKey: current.publicKey,
              account: refreshedAccount,
            };
          });
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to refresh selected proposal:", error);
        }
      }
    }

    refreshSelectedProposal();
    const intervalId = window.setInterval(refreshSelectedProposal, 4000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    idl,
    page,
    selectedProposalKey,
    selectedProposalPublicKey,
    refreshNonce,
    connection,
    connected,
    publicKey,
    signTransaction,
    signAllTransactions,
  ]);

  function navigateToProposal(proposal) {
    setSelectedProposal(proposal);
    setPage("detail");
    window.location.hash = `#/proposal/${proposal.publicKey.toBase58()}`;
  }

  function navigateHome() {
    setPage("list");
    setSelectedProposal(null);
    window.location.hash = "#/";
  }

  const selectedAccount = selectedProposal?.account;
  const isAuthority =
    Boolean(selectedAccount && publicKey) &&
    selectedAccount.authority.toBase58() === publicKey.toBase58();
  const proposalStatus = selectedAccount
    ? getProposalStatus(selectedAccount)
    : null;
  const votingEnded = selectedAccount ? isVotingEnded(selectedAccount) : false;
  const walletEligible = selectedAccount
    ? isWalletAllowedToVote(selectedAccount, publicKey)
    : false;
  const canVote =
    connected &&
    selectedAccount &&
    proposalStatus === "active" &&
    !votingEnded &&
    walletEligible &&
    selectedAccount.votesCast < selectedAccount.maxVoters;

  const protocolCards = [
    {
      icon: <LockIcon size={20} color="var(--purple-accent)" />,
      label: "01_ENCRYPTION",
      title: "Client-Side Ballot Encryption",
      copy:
        "Votes are encrypted in the browser with x25519 key exchange and Rescue cipher primitives before they ever touch Solana.",
    },
    {
      icon: <TallyIcon size={20} color="var(--purple-accent)" />,
      label: "02_MPC_COMPUTE",
      title: "Arcium MPC Tally",
      copy:
        "Arx nodes compute only the aggregate yes/no result over encrypted ballots. No single node sees a plaintext vote.",
    },
    {
      icon: <ShieldIcon size={20} color="var(--purple-accent)" />,
      label: "03_REVEAL",
      title: "Verified Publication",
      copy:
        "The authority decrypts only the final aggregate result and publishes it after the callback output is verified onchain.",
    },
  ];

  const guaranteeCards = [
    {
      title: "NO BALLOT LEAKAGE",
      copy:
        "Individual vote direction never appears onchain in plaintext at any point in the flow.",
    },
    {
      title: "NO PREMATURE SIGNALING",
      copy:
        "Observers can see participation, but not interim sentiment or directional tallies during the active window.",
    },
    {
      title: "CRYPTOGRAPHIC PRIVACY",
      copy:
        "Privacy is delivered by encryption and MPC computation, not by trusting the UI, operator, or backend.",
    },
    {
      title: "VERIFIABLE EXECUTION",
      copy:
        "The final tally is accepted only after Arcium callback verification succeeds inside the Solana program.",
    },
  ];

  const workflowCards = [
    {
      label: "01_CREATE",
      title: "Publish Proposal",
      copy:
        "The authority creates a proposal, defines the voting window, and initializes encrypted null padding for the fixed tally circuit.",
    },
    {
      label: "02_COLLECT",
      title: "Capture Encrypted Votes",
      copy:
        "Wallets cast ballots locally encrypted in the browser, so the chain records participation without exposing vote direction.",
    },
    {
      label: "03_COMPUTE",
      title: "Trigger Arcium MPC",
      copy:
        "Once voting ends, the authority queues a real MPC computation so Arx nodes can derive only the aggregate result.",
    },
    {
      label: "04_PUBLISH",
      title: "Reveal Verified Outcome",
      copy:
        "The callback is verified onchain, the aggregate tally is decrypted locally by the authority, and the final result is published.",
    },
  ];

  const heroRuntime = [
    {
      label: "Network",
      value: "Solana Devnet",
      tone: "var(--purple-accent)",
      note: "Cluster 456",
    },
    {
      label: "Privacy",
      value: "Arcium MPC",
      tone: "var(--purple-accent)",
      note: "Encrypted tally",
    },
    {
      label: "Settlement",
      value: "Verified Output",
      tone: "var(--purple-accent)",
      note: "Onchain callback",
    },
  ];

  const heroExecution = [
    {
      title: "Intake",
      meta: "Proposal state",
    },
    {
      title: "Encrypt",
      meta: "Sealed ballots",
    },
    {
      title: "Tally",
      meta: "Arcium MPC",
    },
    {
      title: "Reveal",
      meta: "Verified result",
    },
  ];

  const heroMetrics = [
    {
      label: "Indexed Proposals",
      value: String(stats.total).padStart(2, "0"),
    },
    {
      label: "Open Ballots",
      value: String(stats.active).padStart(2, "0"),
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Header onNavigateHome={navigateHome} />

      <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {setupRequired ? (
          <SetupState />
        ) : page === "list" ? (
          <>
            <div id="overview" className="mb-16 sm:mb-24 animate-fade-in">
              <div className="grid xl:grid-cols-[minmax(0,1fr),500px] gap-8 sm:gap-10 items-start">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-2 mb-5 flex-wrap">
                    <div
                      className="px-2 py-1 text-xs font-mono font-bold tracking-wider"
                      style={{
                        background: "var(--purple-accent)",
                        color: "white",
                        borderRadius: "2px",
                      }}
                    >
                      MPC-SECURED
                    </div>
                    <div
                      className="px-2 py-1 text-xs font-mono"
                      style={{
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "2px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      SOLANA DEVNET
                    </div>
                    {connected && (
                      <div
                        className="px-2 py-1 text-xs font-mono animate-fade-in"
                        style={{
                          border: "1px solid var(--purple-accent)",
                          borderRadius: "2px",
                          color: "var(--purple-accent)",
                        }}
                      >
                        GOVERNANCE READY
                      </div>
                    )}
                  </div>

                  <h2
                    className="text-4xl sm:text-6xl md:text-7xl xl:text-[5.5rem] font-display font-bold mb-5 leading-[0.92] tracking-tight max-w-[12ch] sm:max-w-[10ch]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Encrypted DAO
                    <br />
                    Governance
                  </h2>

                  <p
                    className="text-sm sm:text-base md:text-lg mb-8 max-w-2xl font-body leading-7 sm:leading-8"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Confidential governance powered by Arcium MPC on Solana.
                    Proposals remain public, ballot direction remains sealed, and
                    final tallies are revealed only after encrypted computation and
                    onchain verification.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 sm:flex-wrap">
                    {connected && (
                      <button
                        onClick={() => setShowCreate(true)}
                        className="btn-primary w-full sm:w-auto animate-scale-in animation-delay-200"
                      >
                        Create Proposal
                      </button>
                    )}
                    <button
                      className="btn-secondary w-full sm:w-auto"
                      onClick={() =>
                        document.getElementById("protocol")?.scrollIntoView({
                          behavior: "smooth",
                        })
                      }
                    >
                      View Protocol
                    </button>
                    <button
                      className="btn-secondary w-full sm:w-auto"
                      onClick={() => setRefreshNonce((value) => value + 1)}
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="glass-card p-4 sm:p-6 animate-slide-up animation-delay-100">
                  <div className="mb-4">
                    <div
                      className="text-xs font-mono mb-1"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      EXECUTION SURFACE
                    </div>
                    <div
                      className="text-lg font-display font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Governance Runtime
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {heroRuntime.map((item) => (
                      <div
                        key={item.label}
                        className="p-3"
                        style={{
                          background: "rgb(255 255 255 / 0.04)",
                          border: "1px solid rgb(255 255 255 / 0.06)",
                          borderRadius: "4px",
                        }}
                      >
                        <div
                          className="text-[10px] font-mono uppercase tracking-wide mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {item.label}
                        </div>
                        <div
                          className="text-sm font-mono mb-1"
                          style={{ color: item.tone }}
                        >
                          {item.value}
                        </div>
                        <div
                          className="text-[10px] font-body"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {item.note}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="p-4 mb-4 relative overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(180deg, rgb(255 255 255 / 0.04), rgb(255 255 255 / 0.02))",
                      border: "1px solid rgb(255 255 255 / 0.06)",
                      borderRadius: "4px",
                    }}
                  >
                    <div
                      className="text-xs font-mono mb-4"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      EXECUTION GRAPH
                    </div>
                    <div className="relative">
                      <div
                        className="absolute left-[12.5%] right-[12.5%] top-[26px] h-px hidden md:block"
                        style={{
                          background:
                            "linear-gradient(90deg, rgb(139 92 246 / 0.12), rgb(139 92 246 / 0.5), rgb(139 92 246 / 0.12))",
                        }}
                      />

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 relative z-10">
                        {heroExecution.map((step) => (
                          <div
                            key={step.title}
                            className="p-3"
                            style={{
                              background: "rgb(255 255 255 / 0.03)",
                              border: "1px solid rgb(255 255 255 / 0.06)",
                              borderRadius: "4px",
                              minHeight: "88px",
                            }}
                          >
                            <div className="mb-3 flex justify-center">
                              <div
                                className="h-7 w-7 flex items-center justify-center"
                                style={{
                                  background: "rgb(139 92 246 / 0.08)",
                                  border: "1px solid rgb(139 92 246 / 0.32)",
                                  borderRadius: "4px",
                                }}
                              >
                                <BrandMarkIcon size={12} color="var(--purple-accent)" />
                              </div>
                            </div>

                            <div
                              className="text-sm font-display font-bold mb-1 text-center"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {step.title}
                            </div>

                            <div
                              className="text-[11px] font-mono text-center"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {step.meta}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {heroMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="p-4"
                        style={{
                          background: "rgb(255 255 255 / 0.05)",
                          border: "1px solid rgb(255 255 255 / 0.06)",
                          borderRadius: "4px",
                        }}
                      >
                        <div
                          className="text-[11px] font-mono mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {metric.label.toUpperCase()}
                        </div>
                        <div
                          className="text-2xl font-display font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {metric.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div id="workflow" className="mb-16 sm:mb-20 animate-slide-up animation-delay-100">
              <div className="mb-8">
                <h3
                  className="text-2xl sm:text-3xl font-display font-bold mb-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  Governance Flow
                </h3>
                <p className="text-sm font-body max-w-2xl" style={{ color: "var(--text-secondary)" }}>
                  The full ArcVote lifecycle, from proposal creation to verified tally
                  publication, mapped into one clean operational flow.
                </p>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                {workflowCards.map((card) => (
                  <div key={card.label} className="glass-card-hover p-5">
                    <div
                      className="text-xs font-mono mb-3"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      {card.label}
                    </div>
                    <h4
                      className="text-xl font-display font-bold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {card.title}
                    </h4>
                    <p className="text-sm font-body leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {card.copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div id="protocol" className="mb-16 sm:mb-20 animate-slide-up animation-delay-300">
              <h3
                className="text-2xl font-display font-bold mb-8"
                style={{ color: "var(--text-primary)" }}
              >
                Protocol Architecture
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {protocolCards.map((card) => (
                  <div key={card.label} className="glass-card-hover p-6">
                    <div
                      className="w-12 h-12 mb-4 flex items-center justify-center"
                      style={{
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--purple-accent)",
                        borderRadius: "4px",
                      }}
                    >
                      {card.icon}
                    </div>
                    <div
                      className="text-sm font-mono mb-2"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      {card.label}
                    </div>
                    <h4
                      className="text-lg font-display font-bold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {card.title}
                    </h4>
                    <p
                      className="text-sm font-body leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {card.copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div id="security" className="mb-16 sm:mb-20 animate-slide-up animation-delay-400">
              <h3
                className="text-2xl font-display font-bold mb-8"
                style={{ color: "var(--text-primary)" }}
              >
                Security Guarantees
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {guaranteeCards.map((card) => (
                  <div key={card.title} className="glass-card p-5 flex items-start gap-4">
                    <div
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center"
                      style={{
                        background: "var(--purple-accent)",
                        borderRadius: "4px",
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div
                        className="font-mono text-sm mb-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {card.title}
                      </div>
                      <p className="text-xs font-body" style={{ color: "var(--text-secondary)" }}>
                        {card.copy}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div id="stack" className="mb-16 sm:mb-20 glass-card p-5 sm:p-8 animate-slide-up animation-delay-500">
              <h3
                className="text-xl font-display font-bold mb-6"
                style={{ color: "var(--text-primary)" }}
              >
                Technical Stack
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  ["BLOCKCHAIN", "Solana"],
                  ["MPC_NETWORK", "Arcium"],
                  ["KEY_EXCHANGE", "x25519"],
                  ["CIPHER", "Rescue"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div
                      className="text-xs font-mono mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {label}
                    </div>
                    <div className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ProposalList
              idl={idl}
              refreshNonce={refreshNonce}
              onRequestCreate={() => setShowCreate(true)}
              onSelectProposal={navigateToProposal}
              onStatsChange={setStats}
            />
          </>
        ) : (
          <ProposalDetail
            proposal={selectedProposal}
            idl={idl}
          isAuthority={isAuthority}
          canVote={canVote}
          walletConnected={connected}
          walletEligible={walletEligible}
          proposalStatus={proposalStatus}
            votingEnded={votingEnded}
            onBack={navigateHome}
            onVoteClick={() => setShowVote(true)}
            onTallyComplete={() => setRefreshNonce((value) => value + 1)}
          />
        )}
      </main>

      <footer className="mt-16 sm:mt-20 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div
          className="container mx-auto px-4 sm:px-6 py-6 text-center font-mono text-xs sm:text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          <p>Powered by Arcium MPC on Solana Devnet - Private DAO Governance</p>
        </div>
      </footer>

      {showCreate && idl && (
        <CreateProposalModal
          idl={idl}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setRefreshNonce((value) => value + 1);
            setShowCreate(false);
          }}
        />
      )}

      {showVote && selectedAccount && idl && (
        <VoteModal
          proposal={selectedAccount}
          proposalId={selectedAccount.proposalId}
          idl={idl}
          onClose={() => {
            setShowVote(false);
            setRefreshNonce((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

