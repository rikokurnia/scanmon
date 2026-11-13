import { GAME_ID, RPC_URL } from "./config";
export async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scanmon", method, params }),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok)
    throw new Error(`NEAR RPC unavailable (${res.status}). Try again.`);
  const body = await res.json();
  if (body.error)
    throw new Error(
      body.error.data?.error_message ??
        body.error.message ??
        "NEAR request failed.",
    );
  return body.result as T;
}
export async function view<T>(
  contract: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!contract)
    throw new Error("The testnet contract has not been configured.");
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64:
      typeof window === "undefined"
        ? Buffer.from(bytes).toString("base64")
        : btoa(String.fromCharCode(...bytes)),
    finality: "final",
  });
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(result.result)),
  ) as T;
}
export interface Outcome {
  status: { SuccessValue?: string; Failure?: unknown };
  transaction: { hash: string; signer_id: string; receiver_id: string };
  receipts_outcome: {
    outcome: {
      status: { Failure?: unknown };
      executor_id: string;
      logs: string[];
    };
  }[];
}
export async function finalTransaction(
  hash: string,
  signer: string,
): Promise<Outcome> {
  return rpc<Outcome>("tx", {
    tx_hash: hash,
    sender_account_id: signer,
    wait_until: "FINAL",
  });
}
export class SettlementError extends Error {}
export function assertSucceeded(result: Outcome, expectedEvents?: string[]) {
  if (result.status.Failure)
    throw new SettlementError(
      "Transaction failed on NEAR. Open the receipt for details.",
    );
  if (!("SuccessValue" in result.status))
    throw new Error("Transaction has not reached finality yet.");
  // Payout callbacks return false on failure. NEP-141 returns USED funds,
  // so purchases are verified from the game contract’s settlement events.
  const value = result.status.SuccessValue;
  if (value) {
    const decoded =
      typeof window === "undefined"
        ? Buffer.from(value, "base64").toString()
        : atob(value);
    if (decoded === "false")
      throw new SettlementError(
        "Settlement was refunded. Refresh the quote or register USDC storage and retry.",
      );
  }
  if (
    expectedEvents &&
    !(result.receipts_outcome ?? []).some(
      (receipt) =>
        receipt.outcome.executor_id === GAME_ID &&
        receipt.outcome.logs.some((log) => {
          if (!log.startsWith("EVENT_JSON:")) return false;
          try {
            const event = JSON.parse(log.slice(11));
            return (
              event.standard === "scanmon" &&
              expectedEvents.includes(event.event) &&
              event.data.some(
                (data: { account_id?: string }) =>
                  data.account_id === result.transaction.signer_id,
              )
            );
          } catch {
            return false;
          }
        }),
    )
  )
    throw new SettlementError(
      "The action did not settle. Refresh your account and check the receipt before retrying.",
    );
}
