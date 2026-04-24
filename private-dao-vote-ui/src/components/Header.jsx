import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import LockIcon from "./icons/LockIcon.jsx";

export default function Header({ onNavigateHome }) {
  const { connected, publicKey } = useWallet();

  return (
    <header className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="container mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-3 text-left"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{
              border: "2px solid var(--purple-accent)",
              borderRadius: "4px",
            }}
          >
            <LockIcon size={16} color="var(--purple-accent)" />
          </div>
          <div>
            <h1
              className="text-xl font-display font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              ArcVote
            </h1>
            <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
              PRIVATE_GOVERNANCE
            </p>
          </div>
        </button>

        <div className="flex items-center gap-4">
          {connected && publicKey && (
            <div className="hidden sm:flex items-center gap-2 glass-card px-4 py-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
              </span>
            </div>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
