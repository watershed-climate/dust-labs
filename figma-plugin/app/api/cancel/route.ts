import { DustAPI } from "@dust-tt/client";

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
  try {
    const { conversationId, messageIds } = await req.json();

    // console.log('Attempting to cancel generation:', { conversationId, messageIds });

    if (!conversationId || !messageIds) {
      return new Response("Missing required parameters", { status: 400 });
    }

    const r = await dustAPI.cancelMessageGeneration({
      conversationId,
      messageIds,
    });

    if (r.isErr()) {
      return new Response(`Error: ${r.error.message}`, { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(`Error: ${error}`, { status: 500 });
  }
}