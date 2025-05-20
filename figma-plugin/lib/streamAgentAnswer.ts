import { DustAPI } from "@dust-tt/client";

export async function streamAgentAnswer({
  streamResponse,
  dustAPI,
  conversationId,
}: {
  streamResponse: any;
  dustAPI: DustAPI;
  conversationId: string;
}) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const TIMEOUT_MS = 30000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function resetTimeout() {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      await writer.abort(new Error("Timeout: No generation_tokens received for 30 seconds"));
    }, TIMEOUT_MS);
  }

  let answer = "";
  let chainOfThought = "";

  (async () => {
    const { eventStream } = streamResponse.value;

    resetTimeout();

    for await (const event of eventStream) {
      if (!event) continue;

      switch (event.type) {
        case "user_message_error":
          if (timeoutId) clearTimeout(timeoutId);
          await writer.abort(new Error(`${event.error.code} - ${event.error.message}`));
          return;
        case "agent_error":
          if (timeoutId) clearTimeout(timeoutId);
          await writer.abort(new Error(`${event.error.code} - ${event.error.message}`));
          return;
        case "agent_action_success":
          if (timeoutId) clearTimeout(timeoutId);
          // Optionally handle event.action if needed
          break;
        case "generation_tokens":
          resetTimeout();
          if (event.classification === "tokens") {
            // const text = event.text;
            answer = (answer + event.text).trim();
            await writer.write(encoder.encode(event.text));
          } else if (event.classification === "chain_of_thought") {
            chainOfThought += event.text;
            // Optionally: stream chain_of_thought somewhere else
          }
          break;
        case "agent_message_success":
          if (timeoutId) clearTimeout(timeoutId);
          answer = event.message.content ?? "";
          break;
        case "agent_message_error":
          if (timeoutId) clearTimeout(timeoutId);
          await writer.abort(new Error(`${event.error.code} - ${event.error.message}`));
          return;
        default:
          console.error("Unknown event type:", event.type);
          if (timeoutId) clearTimeout(timeoutId);
          break;
      }
    }
    if (timeoutId) clearTimeout(timeoutId);
    console.log("Stream ended");
    await writer.close();

    // Optionally log the agent message content
    const convResultAfter = await dustAPI.getConversation({ conversationId });
    if (!convResultAfter.isErr()) {
      const agentMsg = convResultAfter.value.content?.flat().find(
        (msg) => msg.type === "agent_message"
      );
      console.log("-------------------- Streamed answer ----------------------");
      console.log(JSON.stringify(answer));
      console.log("-------------------- Agent message content ---------------------");
      console.log(JSON.stringify(agentMsg?.content));
    }
  })().catch(async (error) => {
    if (timeoutId) clearTimeout(timeoutId);
    await writer.abort(error);
  });

  return stream.readable;
}