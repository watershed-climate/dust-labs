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
  const { userMessage, configurationId, contentFragments } = body;

  const context = {
    timezone: "UTC",
    username: "User",
    email: "user@example.com",
    fullName: "User Example",
    profilePictureUrl: "",
    origin: "api" as const,
  };

  const r = await dustAPI.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content: userMessage,
      mentions: [
        {
          configurationId,
        },
      ],
      context,
    },
    contentFragments: contentFragments && contentFragments.length > 0 ? contentFragments : undefined,
  });

  if (r.isErr()) {
    return new Response(`Error: ${r.error.message}`, { status: 500 });
  }

  const { conversation, message } = r.value;

  try {
    const streamResponse = await dustAPI.streamAgentAnswerEvents({
      conversation,
      userMessageId: message.sId,
    });

    if (streamResponse.isErr()) {
      return new Response(`Error: ${streamResponse.error.message}`, {
        status: 500,
      });
    }

    const readableStream = await streamAgentAnswer({
      streamResponse,
      dustAPI,
      conversationId: conversation.sId,
    });

    console.log("readableStream:", readableStream);

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Conversation-Id": conversation.sId,
        "X-Message-Id": message.sId,
      },
    });
  } catch (error) {
    return new Response(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
}