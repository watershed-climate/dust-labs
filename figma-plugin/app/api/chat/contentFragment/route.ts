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

export async function POST(request: Request) {
  try {
    // Accept all possible fields for a content fragment
    const {
      conversationId,
      title,
      content,
      contentType,
      fileId,
      url
    } = await request.json();

    const contentFragment: any = {
      title,
    };

    // Only add fields if they are present
    if (fileId && url) {
      // It's an image/file fragment
      contentFragment.fileId = fileId;
      contentFragment.url = url;
    } else if (content && contentType) {
      // It's a text fragment
      contentFragment.content = content;
      contentFragment.contentType = contentType;
    }

    const result = await dustAPI.postContentFragment({
      conversationId,
      contentFragment,
    });

    if (result.isErr()) {
      return new Response(`Error: ${result.error.message}`, { status: 500 });
    }

    return Response.json(result.value);
  } catch (error) {
    return Response.json(
      { error: "Failed to post content fragment" },
      { status: 500 }
    );
  }
}