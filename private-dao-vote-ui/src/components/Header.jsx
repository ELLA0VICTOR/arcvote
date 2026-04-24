import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import BrandMarkIcon from "./icons/BrandMarkIcon.jsx";

export default function Header({ onNavigateHome, sections = [] }) {
  return (
    <header
      className="border-b"
      style={{
        borderColor: "var(--border-subtle)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(10, 10, 15, 0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
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
            <BrandMarkIcon size={16} color="var(--purple-accent)" />
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

        {sections.length > 0 && (
          <div className="order-3 w-full lg:order-none lg:w-auto lg:flex-1 flex justify-center flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() =>
                  document.getElementById(section.id)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
                className="px-3 py-1 text-xs font-mono transition-all"
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "999px",
                  color: "var(--text-secondary)",
                  background: "var(--bg-secondary)",
                }}
              >
                {section.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 lg:ml-auto">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
