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

export async function GET(req: Request) {
  const r = await dustAPI.getAgentConfigurations({
    view: "all", // Replace with a specific view type if needed
    includes: [], // Replace with specific includes if needed
  });

  if (r.isErr()) {
    return new Response(`Error: ${r.error.message}`, { status: 500 });
  }

  const agents = r.value.filter((agent) => agent.status === "active");
  return new Response(JSON.stringify(agents), {
    headers: { "Content-Type": "application/json" },
  });
}