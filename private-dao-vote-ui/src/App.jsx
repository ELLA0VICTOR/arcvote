import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import Header from "./components/Header.jsx";
import ProposalList from "./components/ProposalList.jsx";
import CreateProposalModal from "./components/CreateProposalModal.jsx";
import VoteModal from "./components/VoteModal.jsx";
import TallyPanel from "./components/TallyPanel.jsx";
import ResultDisplay from "./components/ResultDisplay.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import LockIcon from "./components/icons/LockIcon.jsx";
import ShieldIcon from "./components/icons/ShieldIcon.jsx";
import TallyIcon from "./components/icons/TallyIcon.jsx";

import {
  formatDate,
  formatTimeRemaining,
  getProposalStatus,
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
      <svg
        className="w-16 h-16 mx-auto mb-4"
        style={{ color: "var(--purple-accent)" }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
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
  proposalStatus,
  votingEnded,
  onBack,
  onVoteClick,
  onTallyComplete,
}) {
  if (!proposal) return null;

  const account = proposal.account;
  const showTallyPanel =
    isAuthority &&
    ((proposalStatus === "active" && votingEnded) || proposalStatus === "tallying");

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
      label: "Authority",
      value: `${account.authority.toBase58().slice(0, 6)}...${account.authority
        .toBase58()
        .slice(-4)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="btn-secondary"
        style={{ color: "var(--text-secondary)" }}
      >
        Back to Governance Queue
      </button>

      <div className="glass-card p-6 sm:p-8 animate-fade-in">
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
              className="text-3xl md:text-5xl font-display font-bold leading-tight"
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
            <button onClick={onVoteClick} className="btn-primary whitespace-nowrap">
              Cast Encrypted Vote
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
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

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="detail-note">
            <div className="text-sm font-mono mb-2" style={{ color: "var(--purple-accent)" }}>
              BALLOT SECRECY
            </div>
            <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
              Participation is visible onchain, but the direction of each vote stays
              encrypted until the aggregate result is computed by Arcium MPC.
            </p>
          </div>
          <div className="detail-note">
            <div className="text-sm font-mono mb-2" style={{ color: "var(--purple-accent)" }}>
              VERIFIED FINALITY
            </div>
            <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
              The callback output is verified onchain before the tally is published,
              so the result is traceable and auditable from queueing to final reveal.
            </p>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.2fr,0.8fr] gap-6">
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

        <div className="space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-start gap-3">
              <LockIcon size={18} color="var(--purple-accent)" />
              <div>
                <div
                  className="text-sm font-mono mb-2"
                  style={{ color: "var(--purple-accent)" }}
                >
                  PRIVACY MODEL
                </div>
                <p className="text-sm font-body leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Public: who voted, when votes landed, and proposal lifecycle status.
                  Private: how each wallet voted. The tally is computed only in
                  aggregate by Arcium’s MPC network.
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-start gap-3">
              <ShieldIcon size={18} color="var(--purple-accent)" />
              <div>
                <div
                  className="text-sm font-mono mb-2"
                  style={{ color: "var(--purple-accent)" }}
                >
                  ASSURANCE
                </div>
                <p className="text-sm font-body leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Final tallies are accepted only after Arcium returns a signed result
                  and the program verifies that output onchain. The result is not
                  trusted by convention.
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div
              className="text-sm font-mono mb-4"
              style={{ color: "var(--purple-accent)" }}
            >
              OPERATIONAL NOTES
            </div>
            <div className="space-y-3 text-sm font-body" style={{ color: "var(--text-secondary)" }}>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>Each proposal currently supports up to 10 encrypted ballots.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>The authority executes the tally and publishes the final result.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>Proposal state persists entirely onchain on Solana devnet.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { publicKey, connected } = useWallet();

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
  const canVote =
    connected &&
    selectedAccount &&
    proposalStatus === "active" &&
    !votingEnded &&
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

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Header onNavigateHome={navigateHome} />

      <main className="container mx-auto px-6 py-12">
        {setupRequired ? (
          <SetupState />
        ) : page === "list" ? (
          <>
            <div className="mb-20 animate-fade-in">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
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
                className="text-6xl font-display font-bold mb-4 leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Private DAO
                <br />
                Voting
              </h2>

              <p
                className="text-base mb-8 max-w-2xl font-body"
                style={{ color: "var(--text-secondary)" }}
              >
                Confidential governance powered by Arcium MPC on Solana. Proposals
                remain public, ballot direction remains sealed, and final tallies are
                revealed only after encrypted computation and onchain verification.
              </p>

              <div className="flex gap-3 flex-wrap">
                {connected && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary animate-scale-in animation-delay-200"
                  >
                    Create Proposal
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={() =>
                    document.getElementById("how-it-works")?.scrollIntoView({
                      behavior: "smooth",
                    })
                  }
                >
                  View Protocol
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setRefreshNonce((value) => value + 1)}
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20 animate-slide-up animation-delay-100">
              <div className="glass-card p-4">
                <div
                  className="text-3xl font-display font-bold mb-1"
                  style={{ color: "var(--purple-accent)" }}
                >
                  {stats.total}
                </div>
                <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                  TOTAL_PROPOSALS
                </div>
              </div>
              <div className="glass-card p-4">
                <div
                  className="text-3xl font-display font-bold mb-1"
                  style={{ color: "var(--purple-accent)" }}
                >
                  {stats.active}
                </div>
                <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                  ACTIVE_VOTES
                </div>
              </div>
              <div className="glass-card p-4">
                <div
                  className="text-3xl font-display font-bold mb-1"
                  style={{ color: "var(--purple-accent)" }}
                >
                  {stats.tallying}
                </div>
                <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                  MPC_TALLYING
                </div>
              </div>
              <div className="glass-card p-4">
                <div
                  className="text-3xl font-display font-bold mb-1"
                  style={{ color: "var(--purple-accent)" }}
                >
                  {stats.finalized}
                </div>
                <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                  FINALIZED
                </div>
              </div>
            </div>

            <div id="how-it-works" className="mb-20 animate-slide-up animation-delay-200">
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

            <div className="mb-20 animate-slide-up animation-delay-300">
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

            <div className="mb-20 glass-card p-8 animate-slide-up animation-delay-400">
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
            proposalStatus={proposalStatus}
            votingEnded={votingEnded}
            onBack={navigateHome}
            onVoteClick={() => setShowVote(true)}
            onTallyComplete={() => setRefreshNonce((value) => value + 1)}
          />
        )}
      </main>

      <footer className="mt-20 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div
          className="container mx-auto px-6 py-6 text-center font-mono text-sm"
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
