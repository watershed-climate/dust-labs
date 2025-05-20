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
    const data = await request.arrayBuffer();
    const buffer = Buffer.from(data);

    // The DustAPI expects a File-like object. We'll use a Blob and File constructor.
    const file = new File([buffer], "screenshot.png", { type: "image/png" });

    // Upload the file to DustAPI
    const result = await dustAPI.uploadFile({
      fileName: file.name,
      fileSize: file.size,
      contentType: "image/png",
      useCase: "conversation",
      fileObject: file,
    });

    if (result.isErr()) {
      return new Response(
        JSON.stringify({ error: result.error.message }),
        { status: 500 }
      );
    }

    // The result should contain the URL of the uploaded image
    return Response.json({
        fileId: result.value.id,
        url: result.value.downloadUrl,
      });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to upload image" }),
      { status: 500 }
    );
  }
}