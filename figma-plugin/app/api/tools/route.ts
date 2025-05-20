import { DustAPI } from "@dust-tt/client";

const dustAPI = new DustAPI(
  { url: "https://eu.dust.tt" },
  {
    workspaceId: process.env.DUST_WORKSPACE_ID!,
    apiKey: process.env.DUST_API_KEY!,
  },
  console
);

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, layers, configurationId } = body;

  const context = {
    timezone: "UTC",
    username: "Figma",
    fullName: "Figma Plugin",
    origin: "api" as const,
  };

  const r = await dustAPI.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content: prompt,
      mentions: [
        {
          configurationId,
        },
      ],
      context,
    },
  });

  if (r.isErr()) {
    return new Response(`Error: ${r.error.message}`, { status: 500 });
  }

  const { conversation, message } = r.value;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let answer = "";
      let chainOfThought = "";

      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            type: "ids",
            conversationId: conversation.sId,
            messageId: message.sId
          }) + "\n"
        )
      );

      try {
        const streamResponse = await dustAPI.streamAgentAnswerEvents({
          conversation,
          userMessageId: message.sId,
        });

        if (streamResponse.isErr()) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: streamResponse.error.message }) + "\n"));
          controller.close();
          return;
        }

        const { eventStream } = streamResponse.value;

        for await (const event of eventStream) {
          if (!event) continue;

          switch (event.type) {
            case "user_message_error": {
              console.error("User message error:", event.error);
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    error: `User message error: code: ${event.error.code} message: ${event.error.message}`,
                  }) + "\n"
                )
              );
              controller.close();
              return;
            }
            case "agent_error": {
              console.error("Agent message error:", event.error);
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    error: `Agent message error: code: ${event.error.code} message: ${event.error.message}`,
                  }) + "\n"
                )
              );
              controller.close();
              return;
            }
            case "retrieval_params": {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "chain_of_thought", text: "Retrieving source\n" }) + "\n"
                )
              );
              break;
            }
            case "agent_action_success": {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "chain_of_thought", text: "Analysing source\n" }) + "\n"
                )
              );
              break;
            }
            case "generation_tokens": {
              if (event.classification === "tokens") {
                answer = (answer + event.text).trim();
              } else if (event.classification === "chain_of_thought") {
                chainOfThought += event.text;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: "chain_of_thought", text: event.text }) + "\n"
                  )
                );
              }
              break;
            }
            case "agent_message_success": {
              answer = event.message.content ?? answer;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "success", message: "Agent message processed successfully." }) + "\n"
                )
              );
              break;
            }
            default:
              console.log("Unsupported event type:", event.type);
              break;
          }
        }

        // Clean and parse the answer
        const cleanedAnswer = answer.replace(/```json/g, "").replace(/```/g, "");
        const updatedPayload = JSON.parse(cleanedAnswer);

        const normalizedLayers = layers.map((layer: any) => {
          const updatedLayer = updatedPayload.layers.find((ul: any) => ul.id === layer.id);
          return updatedLayer ? { ...layer, text: updatedLayer.text } : layer;
        });

        controller.enqueue(encoder.encode(JSON.stringify({ type: "result", layers: normalizedLayers }) + "\n"));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }) + "\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}