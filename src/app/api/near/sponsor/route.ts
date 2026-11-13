import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { Account, KeyPairSigner, providers, transactions } from "near-api-js";
import { GAME_ID, RPC_URL, units } from "@/lib/near/config";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const requestHost = (
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  )
    ?.split(",")[0]
    .trim();
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }
    if (originHost !== requestHost)
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }
  const appId =
    process.env.APP_ID_PRIVY ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.APP_SECRET_PRIVY;
  const key = process.env.NEAR_SPONSOR_PRIVATE_KEY;
  const sponsorId = process.env.NEAR_SPONSOR_ACCOUNT_ID;
  if (!appId || !appSecret || !key || !sponsorId || !GAME_ID)
    return NextResponse.json(
      {
        error:
          "Gas sponsorship is not configured. Fund your NEAR account with testnet NEAR.",
      },
      { status: 503 },
    );
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    return NextResponse.json(
      { error: "Sign in with Google first." },
      { status: 401 },
    );
  const privy = new PrivyClient({ appId, appSecret });
  let userId: string;
  try {
    const auth = await privy.utils().auth().verifyAccessToken(token);
    userId = auth.user_id;
  } catch {
    return NextResponse.json(
      { error: "Session expired. Sign in again." },
      { status: 401 },
    );
  }
  try {
    const { accountId } = (await request.json()) as { accountId: string };
    if (!/^[a-f0-9]{64}$/.test(accountId))
      return NextResponse.json(
        { error: "Invalid implicit account." },
        { status: 400 },
      );
    const user = await privy.users()._get(userId);
    const linked = user.linked_accounts.some(
      (a) =>
        a.type === "wallet" &&
        a.chain_type === "near" &&
        a.address.replace(/^0x/, "") === accountId,
    );
    if (!linked || !user.linked_accounts.some((a) => a.type === "google_oauth"))
      return NextResponse.json(
        { error: "This NEAR wallet does not belong to your Google session." },
        { status: 403 },
      );
    const signer = KeyPairSigner.fromSecretKey(key as `ed25519:${string}`);
    const account = new Account(
      sponsorId,
      new providers.JsonRpcProvider({ url: RPC_URL }),
      signer,
    );
    // On-chain identity and account guards prevent duplicate grants across Vercel instances.
    const outcome = await account.signAndSendTransaction({
      receiverId: GAME_ID,
      actions: [
        transactions.functionCall(
          "sponsor_player",
          {
            identity_hash: createHash("sha256").update(userId).digest("hex"),
            account_id: accountId,
          },
          BigInt("60000000000000"),
          BigInt(units("0.52", 24)),
        ),
      ],
      waitUntil: "FINAL",
    });
    return NextResponse.json({ hash: outcome.transaction.hash, accountId });
  } catch {
    return NextResponse.json(
      {
        error:
          "Testnet sponsor is unavailable or out of funds. Fund your account with test NEAR to continue.",
      },
      { status: 503 },
    );
  }
}
