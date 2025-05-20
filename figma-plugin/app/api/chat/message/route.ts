import { DustAPI } from "@dust-tt/client";
import { streamAgentAnswer } from "../../../../lib/streamAgentAnswer";

const dustAPI = new DustAPI(
  {
    url: "https://eu.dust.tt",
  },
  {
    workspaceId: process.env.DUST_WORKSPACE_ID!,
    apiKey: process.env.DUST_API_KEY!,
  },
  console
);

export async function POST(req: Request) {
  const body = await req.json();
  const { conversationId, userMessage, configurationId } = body;

  const context = {
    timezone: "UTC",
    username: "User",
    email: "user@example.com",
    fullName: "User Example",
    profilePictureUrl: "",
    origin: "api" as const,
  };

  // Create a new message in the existing conversation
  const r = await dustAPI.postUserMessage({
    conversationId,
    message: {
      content: userMessage,
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

  // Get the conversation to stream events
  const convResult = await dustAPI.getConversation({ conversationId });
  if (convResult.isErr()) {
    return new Response(`Error: ${convResult.error.message}`, { status: 500 });
  }

  try {
    const streamResponse = await dustAPI.streamAgentAnswerEvents({
      conversation: convResult.value,
      userMessageId: r.value.sId,
    });

    if (streamResponse.isErr()) {
      return new Response(`Error: ${streamResponse.error.message}`, {
        status: 500,
      });
    }

    const readableStream = await streamAgentAnswer({
      streamResponse,
      dustAPI,
      conversationId,
    });

    console.log("readableStream:", readableStream);

    return new Response(readableStream, {
      headers: { 
        "Content-Type": "text/plain; charset=utf-8", 
        "Transfer-Encoding": "chunked",
        "X-Message-Id": r.value.sId,
      },
    });
  } catch (error) {
    return new Response(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
}