import { NextRequest, NextResponse } from "next/server";
import { handleRoom } from "@/lib/pvp/server";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    if (origin && new URL(origin).host !== request.nextUrl.host)
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 8192)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    return NextResponse.json(await handleRoom(JSON.parse(body)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Match unavailable. Try again.";
    const safe =
      /Session expired|Match not found|Not your match|Invalid player|no longer accepting|Choose an available|Choose Attack|already locked/.test(
        message,
      );
    return NextResponse.json(
      {
        error: safe
          ? message
          : "PvP service is temporarily unavailable. Your escrow stays protected.",
      },
      { status: safe ? 400 : 503 },
    );
  }
}
