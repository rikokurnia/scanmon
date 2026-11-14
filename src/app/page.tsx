import LandingPage from "@/components/landing-page";
import deployment from "@/lib/near/public-deployment.json";

export default function Page() {
  return (
    <LandingPage
      accounts={[
        {
          name: "scanMon Game",
          id: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID || deployment.contractId,
          kind: "Contract",
          purpose:
            "NEP-245 card minting and ownership, market settlement, Tomo rewards, raid loot, and PvP card escrow and claims.",
        },
        {
          name: "Test USDC",
          id:
            process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ||
            deployment.usdcContractId,
          kind: "Contract",
          purpose:
            "NEP-141 test token used for rewards and trades. Testnet tokens have no monetary value.",
        },
        {
          name: "Tomo",
          id: process.env.NEAR_TOMO_ACCOUNT_ID || deployment.tomoAccountId,
          kind: "Agent wallet",
          purpose:
            "A separate agent wallet and USDC budget for verified quest rewards.",
        },
        {
          name: "Koban",
          id: process.env.NEAR_KOBAN_ACCOUNT_ID || deployment.kobanAccountId,
          kind: "Agent wallet",
          purpose:
            "A separate agent wallet, inventory, and USDC budget for negotiated card trades.",
        },
      ]}
    />
  );
}
