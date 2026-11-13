import { NextRequest, NextResponse } from "next/server";
import type { ChainTx, TxKind } from "@/lib/near/types";
export const runtime = "nodejs";
const methods: Record<string, TxKind> = {
  mint_scan: "mint",
  claim_task: "quest",
  sell_to_koban: "sell",
  claim_loot: "loot",
  start_raid: "raid",
  attack: "raid",
  storage_deposit: "storage",
  faucet: "faucet",
  claim_starter: "faucet",
  list_card: "list",
  cancel_listing: "cancel",
  withdraw_usdc: "withdraw",
  ft_transfer_call: "transaction",
};
export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account") ?? "";
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (
    !/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(account) ||
    (cursor && cursor.length > 2048)
  )
    return NextResponse.json(
      { error: "Invalid account or cursor." },
      { status: 400 },
    );
  const url = new URL(
    `https://api-testnet.nearblocks.io/v3/accounts/${encodeURIComponent(account)}/txns`,
  );
  url.searchParams.set("limit", "25");
  if (cursor) url.searchParams.set("next", cursor);
  try {
    const response = await fetch(url, {
      headers: process.env.NEARBLOCKS_API_KEY
        ? { Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` }
        : {},
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 10 },
    });
    if (!response.ok)
      return NextResponse.json(
        {
          error: `Account history is temporarily unavailable (${response.status}). Recent app receipts are still shown.`,
        },
        { status: 502 },
      );
    const body = (await response.json()) as {
      data: Record<string, unknown>[];
      meta?: { next_page?: string };
      errors?: unknown[];
    };
    if (!Array.isArray(body.data)) throw new Error("Invalid indexer response");
    const rows: ChainTx[] = body.data.flatMap((row) => {
      if (typeof row.transaction_hash !== "string") return [];
      const actions = row.actions as
        { method?: string; action?: string }[] | undefined;
      const method = actions?.find((a) => a.method)?.method;
      const outcome = row.outcomes as
        { status?: boolean; status_key?: string } | undefined;
      const timestamp = String(
        (row.block as { block_timestamp?: string })?.block_timestamp ??
          row.block_timestamp ??
          "0",
      );
      return [
        {
          hash: row.transaction_hash,
          accountId: account,
          kind: methods[method ?? ""] ?? "transaction",
          title:
            method?.replaceAll("_", " ") ??
            actions?.[0]?.action?.replaceAll("_", " ") ??
            "NEAR transaction",
          timestamp: Number(BigInt(timestamp) / BigInt(1_000_000)),
          status:
            outcome?.status === true
              ? "success"
              : outcome?.status === false
                ? "failed"
                : "pending",
          receiverId: String(row.receiver_account_id ?? ""),
        },
      ];
    });
    return NextResponse.json(
      { transactions: rows, next: body.meta?.next_page ?? null },
      { headers: { "Cache-Control": "private, max-age=10" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not load account history. Recent app receipts are still available.",
      },
      { status: 502 },
    );
  }
}
