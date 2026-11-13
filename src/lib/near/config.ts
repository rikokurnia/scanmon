// This build intentionally targets testnet. Mainnet needs a separate reviewed release.
export const NETWORK = "testnet" as const;
export const GAME_ID = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID ?? "";
export const USDC_ID = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? "";
export const RPC_URL =
  process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const IS_MOCK_USDC = process.env.NEXT_PUBLIC_USDC_IS_MOCK !== "false";
export const EXPLORER = "https://testnet.nearblocks.io";
export const explorerTx = (hash: string) =>
  `${EXPLORER}/txns/${encodeURIComponent(hash)}`;
export const explorerAccount = (id: string) =>
  `${EXPLORER}/address/${encodeURIComponent(id)}`;
export function units(raw: string, decimals = 6): string {
  if (!/^\d+(\.\d+)?$/.test(raw))
    throw new Error("Enter a positive token amount.");
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimals.`);
  return (
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  ).toString();
}
export function displayUnits(raw: string, decimals = 6, places = 2): string {
  const value = BigInt(raw || "0");
  const base = BigInt(10) ** BigInt(decimals);
  const fractional = (value % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, places);
  return `${value / base}${places ? `.${fractional.padEnd(places, "0")}` : ""}`;
}
