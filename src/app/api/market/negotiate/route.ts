import { GoogleGenAI } from "@google/genai";
import { KeyPair } from "near-api-js";
import { NextResponse } from "next/server";
import { CARD_CATALOG, isKnownCardId } from "@/app/collection/card-catalog";
import {
  isBossCard,
  parseUsdcAmount,
  type MerchantOffer,
  type TradeDirection,
} from "@/app/market/market-interface";
import { GAME_ID, units } from "@/lib/near/config";

export const runtime = "nodejs";

function signKobanOffer(params: {
  offerId: string;
  direction: TradeDirection;
  cardId: string;
  usdcAmount: string;
  expiresAtSec: number;
}): number[] | undefined {
  const secret = process.env.NEAR_KOBAN_PRIVATE_KEY;
  if (!secret || !GAME_ID) return undefined;
  try {
    const keyPair = KeyPair.fromString(
      secret as Parameters<typeof KeyPair.fromString>[0],
    );
    const amountUnits = units(params.usdcAmount);
    const msg = `scanmon-koban:v1|${GAME_ID}|${params.offerId}|${params.direction}|${params.cardId}|${amountUnits}|${params.expiresAtSec}`;
    const signed = keyPair.sign(Buffer.from(msg, "utf8"));
    return Array.from(signed.signature);
  } catch {
    return undefined;
  }
}

interface HistoryTurn {
  role: "user" | "koban";
  text: string;
}

interface RequestPayload {
  cardId?: string;
  direction?: TradeDirection;
  instanceId?: string;
  message?: string;
  history?: HistoryTurn[];
}

const CARD_REFERENCE_GUIDE: Record<string, string> = {
  "nyan-cat": "Base ~3.50 USDC. Cosmic rainbow meme star (Blue, 1-star, HP 65 / ATK 60 / DEF 45).",
  pikachu: "Base ~4.50 USDC. Electric crowd favorite (Yellow, 3-star, high ATK).",
  doge: "Base ~4.00 USDC. Buff gym meme icon (Yellow, 3-star).",
  gengar: "Base ~3.80 USDC. Shadow trickster (Blue, 1-star).",
  pepe: "Base ~3.20 USDC. Classic rare frog meme (Yellow).",
  veemon: "Base ~3.40 USDC. Scrappy dragon fighter (Yellow).",
  piyomon: "Base ~3.00 USDC. Plucky sky bird (Blue).",
  "chill-guy": "Base ~3.30 USDC. Unbothered laid-back legend (Blue).",
};

const OFFER_MARKER = "<<<OFFER:";

function buildSystemInstruction(
  cardId: string,
  cardName: string,
  direction: TradeDirection,
): string {
  const cardNote = CARD_REFERENCE_GUIDE[cardId] ?? "Standard collectible card (~3.20 USDC).";
  const tradeSide =
    direction === "buy"
      ? "The player wants to BUY this card from Koban's shop using USDC (so usdcAmount is what the player pays Koban)."
      : "The player wants to SELL their owned copy of this card to Koban for USDC (so usdcAmount is what Koban pays the player).";

  return [
    "You are Koban, a friendly, witty woodland stump merchant running the scanMon Market stall (wearing a red NEAR headband).",
    `Current card on the counter: ${cardName} (${cardId}). ${cardNote}`,
    tradeSide,
    "Rules:",
    "1. You can answer ANY question the player asks — about this card, scanMon gameplay, NEAR, USDC, or casual shop chat — NOT only price offers.",
    "2. Keep your spoken reply VERY short and punchy (1 to 2 short sentences, max 130 characters) so it fits neatly inside your speech bubble.",
    "3. Stay warm, playful, and in-character. Do not use markdown, asterisks, or emojis.",
    "4. Always end your output on a new line with EXACTLY this hidden control tag:",
    '<<<OFFER:{"status":"active"|"declined"|"none","usdcAmount":"3.50"}>>>',
    '- Use status "active" with a positive 2-decimal USDC string (e.g. "4.00") whenever you propose, counter, or agree to a trade price for this card.',
    '- Use status "declined" (omit usdcAmount or set "") if the player makes an absurdly lowball/unacceptable offer and you refuse without quoting.',
    '- Use status "none" when the player asks a general question or chats without requesting or negotiating a price.',
    "- Negotiate realistically and dynamically with the player's offer: in Buy mode, if the player offers fair value or higher (e.g. '4 usd' for a ~3.30 card), gladly AGREE to their exact 4.00 USDC price; if slightly low, meet halfway. Reject absurd lowballs (< 1.00 USDC in Buy) or greedy demands (> 15.00 USDC in Sell).",
    "- CRITICAL: Whenever status is \"active\", the usdcAmount in <<<OFFER:...>>> MUST EXACTLY match the USDC number you state or agree to in your spoken reply (for example if you agree to 4 usd, output usdcAmount \"4.00\").",
  ].join("\n");
}

function splitReplyAndOffer(rawText: string): {
  spokenReply: string;
  offerPayload: { status?: string; usdcAmount?: string } | null;
} {
  const markerIndex = rawText.indexOf(OFFER_MARKER);
  if (markerIndex === -1) {
    return {
      spokenReply: rawText.trim(),
      offerPayload: null,
    };
  }

  const spokenReply = rawText.slice(0, markerIndex).trim();
  const markerTail = rawText.slice(markerIndex + OFFER_MARKER.length);
  const closeIndex = markerTail.indexOf(">>>");
  const jsonText = (
    closeIndex === -1 ? markerTail : markerTail.slice(0, closeIndex)
  ).trim();

  try {
    const parsed = JSON.parse(jsonText) as {
      status?: string;
      usdcAmount?: string | number;
    };
    return {
      spokenReply,
      offerPayload: {
        status: parsed.status,
        usdcAmount:
          parsed.usdcAmount !== undefined ? String(parsed.usdcAmount) : undefined,
      },
    };
  } catch {
    return { spokenReply, offerPayload: null };
  }
}

/**
 * Compute the safe visible prefix while streaming so partial `<<<OFFER:...`
 * control tags never appear in Koban's speech bubble.
 */
function visiblePrefixBeforeMarker(rawSoFar: string): string {
  const fullIndex = rawSoFar.indexOf(OFFER_MARKER);
  if (fullIndex !== -1) {
    return rawSoFar.slice(0, fullIndex).trimEnd();
  }
  for (let len = OFFER_MARKER.length - 1; len >= 1; len--) {
    if (rawSoFar.endsWith(OFFER_MARKER.slice(0, len))) {
      return rawSoFar.slice(0, rawSoFar.length - len).trimEnd();
    }
  }
  return rawSoFar;
}

function buildConversationContents(
  history: HistoryTurn[],
  latestMessage: string,
) {
  const turns = history
    .slice(-8)
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({
      role: t.role === "koban" ? ("model" as const) : ("user" as const),
      parts: [{ text: t.text.trim() }],
    }));

  turns.push({
    role: "user" as const,
    parts: [{ text: latestMessage }],
  });

  return turns;
}

async function streamFromGemini(
  systemInstruction: string,
  history: HistoryTurn[],
  message: string,
  signal: AbortSignal,
  onRawAccumulated: (fullRaw: string) => void,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1beta" },
  });

  const models = ["gemini-flash-lite-latest", "gemini-flash-latest"];
  let lastError: unknown = null;

  for (const model of models) {
    if (signal.aborted) throw new Error("Aborted");
    const attemptController = new AbortController();
    const onParentAbort = () => attemptController.abort();
    signal.addEventListener("abort", onParentAbort);
    const attemptTimer = setTimeout(() => attemptController.abort(), 4500);

    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: buildConversationContents(history, message),
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 220,
          abortSignal: attemptController.signal,
        },
      });

      let accumulated = "";
      for await (const chunk of stream) {
        clearTimeout(attemptTimer);
        if (signal.aborted) throw new Error("Aborted");
        if (chunk.text) {
          accumulated += chunk.text;
          onRawAccumulated(accumulated);
        }
      }
      if (accumulated.trim().length > 0) {
        return accumulated;
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(attemptTimer);
      signal.removeEventListener("abort", onParentAbort);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed");
}

async function streamFromDeepSeek(
  systemInstruction: string,
  history: HistoryTurn[],
  message: string,
  signal: AbortSignal,
  onRawAccumulated: (fullRaw: string) => void,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY missing");
  }

  const messages = [
    { role: "system", content: systemInstruction },
    ...history
      .slice(-8)
      .filter((t) => t.text.trim().length > 0)
      .map((t) => ({
        role: t.role === "koban" ? "assistant" : "user",
        content: t.text.trim(),
      })),
    { role: "user", content: message },
  ];

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 220,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`DeepSeek error (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          onRawAccumulated(accumulated);
        }
      } catch {
        // Ignore partial SSE JSON lines
      }
    }
  }

  return accumulated;
}

export async function POST(request: Request) {
  let body: RequestPayload;
  try {
    body = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cardId = body.cardId?.trim() ?? "";
  const direction: TradeDirection = body.direction === "sell" ? "sell" : "buy";
  const message = body.message?.trim() ?? "";
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (!isKnownCardId(cardId) || isBossCard(cardId)) {
    return NextResponse.json(
      {
        reply: "Almarts27 Hamster is earned through Battle only, not traded here!",
        offer: null,
        status: "declined",
      },
      { status: 200 },
    );
  }

  const cardAsset = CARD_CATALOG[cardId];
  const systemInstruction = buildSystemInstruction(
    cardId,
    cardAsset.name,
    direction,
  );

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const onRequestAbort = () => abortController.abort();
  request.signal.addEventListener("abort", onRequestAbort);

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      let lastSentVisible = "";
      const emitVisibleProgress = (rawText: string) => {
        const visible = visiblePrefixBeforeMarker(rawText);
        if (visible && visible !== lastSentVisible) {
          lastSentVisible = visible;
          sendEvent({ type: "delta", text: visible });
        }
      };

      try {
        let fullRaw = "";
        try {
          fullRaw = await streamFromGemini(
            systemInstruction,
            history,
            message,
            abortController.signal,
            emitVisibleProgress,
          );
        } catch {
          if (abortController.signal.aborted) {
            return;
          }
          lastSentVisible = "";
          fullRaw = await streamFromDeepSeek(
            systemInstruction,
            history,
            message,
            abortController.signal,
            emitVisibleProgress,
          );
        }

        if (abortController.signal.aborted) {
          return;
        }

        const { spokenReply, offerPayload } = splitReplyAndOffer(fullRaw);
        const reply =
          spokenReply || "Tell me your price in USDC, or ask about the card!";

        let offer: MerchantOffer | null = null;
        let status: "ok" | "declined" | "error" = "ok";

        if (offerPayload?.status === "declined") {
          status = "declined";
        } else if (
          offerPayload?.status === "active" &&
          offerPayload.usdcAmount
        ) {
          const parsedAmount = parseUsdcAmount(offerPayload.usdcAmount);
          if (parsedAmount !== null) {
            const offerId = crypto.randomUUID();
            const usdcAmount = parsedAmount.toFixed(2);
            const expiresAtSec = Math.floor(Date.now() / 1000) + 180;
            const signature = signKobanOffer({
              offerId,
              direction,
              cardId,
              usdcAmount,
              expiresAtSec,
            });
            offer = {
              offerId,
              cardId,
              direction,
              instanceId: body.instanceId,
              usdcAmount,
              expiresAt: expiresAtSec * 1000,
              expiresAtSec,
              signature,
              status: "active",
            };
          }
        }

        sendEvent({
          type: "done",
          reply,
          offer,
          status,
          offerIntent: offerPayload?.status ?? "none",
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          sendEvent({
            type: "done",
            reply: "Lost my train of thought! Try asking again.",
            offer: null,
            status: "error",
            errorMessage:
              err instanceof Error ? err.message : "Merchant temporarily unavailable.",
          });
        }
      } finally {
        request.signal.removeEventListener("abort", onRequestAbort);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
