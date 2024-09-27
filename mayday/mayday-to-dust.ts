import axios, { AxiosResponse } from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";

dotenv.config();

const MAYDAY_CLIENT_ID = process.env.MAYDAY_CLIENT_ID;
const MAYDAY_CLIENT_SECRET = process.env.MAYDAY_CLIENT_SECRET;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;
const MAYDAY_BASE_URL = "https://public-api.mayday.fr";

const missingEnvVars = [
  ["MAYDAY_CLIENT_ID", MAYDAY_CLIENT_ID],
  ["MAYDAY_CLIENT_SECRET", MAYDAY_CLIENT_SECRET],
  ["DUST_API_KEY", DUST_API_KEY],
  ["DUST_WORKSPACE_ID", DUST_WORKSPACE_ID],
  ["DUST_DATASOURCE_ID", DUST_DATASOURCE_ID],
]
  .filter(([name, value]) => !value)
  .map(([name]) => name);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Please provide values for the following environment variables in the .env file: ${missingEnvVars.join(
      ", "
    )}`
  );
}

// Mayday API configuration
const maydayApi = axios.create({
  baseURL: MAYDAY_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

// Create a Bottleneck limiter for Mayday API
const maydayLimiter = new Bottleneck({
  minTime: 1000, // 1 second between requests
  maxConcurrent: 1, // Only 1 request at a time
});

// Create a Bottleneck limiter for Dust API
const dustLimiter = new Bottleneck({
  minTime: 500, // 500ms between requests
  maxConcurrent: 1, // Only 1 request at a time
});

const dustApi = axios.create({
  baseURL: "https://dust.tt/api/v1",
  headers: {
    Authorization: `Bearer ${DUST_API_KEY}`,
    "Content-Type": "application/json",
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

// Wrap dustApi.post with the limiter
const limitedDustApiPost = dustLimiter.wrap(
  (url: string, data: any, config?: any) => dustApi.post(url, data, config)
);

interface MaydayContent {
  id: string;
  knowledgeId: string;
  collectionsIds: string[];
  childrenIds: string[];
  ancestorsIds: string[];
  locale: string;
  label: string;
  body: string;
  isOutdated: boolean;
  isPublished: boolean;
  type: string;
  createdBy: string;
  createdAtISO: string;
  createdAt: number;
  contentUpdatedBy: string;
  contentUpdatedAtISO: string;
  contentUpdatedAt: number;
  lastPublishedAt: number;
  lastPublishedAtISO: string;
}

async function getAccessToken(): Promise<string> {
  const tokenUrl = `${MAYDAY_BASE_URL}/auth/oauth2/token`;
  const encodedCredentials = Buffer.from(
    `${MAYDAY_CLIENT_ID}:${MAYDAY_CLIENT_SECRET}`
  ).toString("base64");

  try {
    const response = await axios.post(
      tokenUrl,
      { grant_type: "client_credentials" },
      { headers: { Authorization: `Basic ${encodedCredentials}` } }
    );
    return response.data.access_token;
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
}

async function getAllContents(accessToken: string): Promise<MaydayContent[]> {
  let allContents: MaydayContent[] = [];
  let page = 1;
  const limit = 100; // Adjust as needed

  while (true) {
    try {
      console.log(`Fetching contents page: ${page}`);
      const response: AxiosResponse<{
        data: MaydayContent[];
        total: number;
        page: number;
        limit: number;
      }> = await maydayLimiter.schedule(() =>
        maydayApi.get("/contents", {
          params: {
            page,
            limit,
            locale: "default",
            type: "Article",
            isPublished: true,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      );

      allContents = allContents.concat(response.data.data);
      console.log(
        `Retrieved ${response.data.data.length} articles. Total: ${allContents.length}`
      );

      if (response.data.data.length < limit) {
        break; // No more pages
      }

      page++;
    } catch (error) {
      console.error("Error fetching contents:", error);
      throw error;
    }
  }

  console.log(`Total articles retrieved: ${allContents.length}`);
  return allContents;
}

async function upsertToDustDatasource(content: MaydayContent) {
  const documentId = `content-${content.id}`;
  const contentText = `
Title: ${content.label}
Type: ${content.type}
Created At: ${content.createdAtISO}
Updated At: ${content.contentUpdatedAtISO}
Is Outdated: ${content.isOutdated}
Is Published: ${content.isPublished}
Knowledge ID: ${content.knowledgeId}
Collections: ${content.collectionsIds.join(", ")}

Content:
${content.body}
  `.trim();

  const sourceUrl = `${MAYDAY_BASE_URL}/contents/${content.locale}/${content.id}`;

  try {
    await limitedDustApiPost(
      `/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
      {
        text: contentText,
        source_url: sourceUrl,
      }
    );
    console.log(`Upserted article ${content.id} to Dust datasource`);
  } catch (error) {
    console.error(
      `Error upserting article ${content.id} to Dust datasource:`,
      error
    );
  }
}

async function main() {
  try {
    const accessToken = await getAccessToken();
    const contents = await getAllContents(accessToken);

    for (const content of contents) {
      await upsertToDustDatasource(content);
    }

    console.log("All articles processed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
