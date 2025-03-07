import axios, { AxiosResponse } from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";
import TurndownService from "turndown";

dotenv.config();

var turndownService = new TurndownService();

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
  contentLabelsIds?: string[];
}

interface MaydayCollection {
  id: string;
  knowledgeId: string;
  parentId: string | null;
  label: string;
  body: string;
  isRoot: boolean;
  childrenOrder: Array<{
    id: string;
    entityType: "Collection" | "Content";
  }>;
}

interface MaydayContentLabel {
  id: string;
  label: string;
  category: string;
  icon: string;
  color: string;
  createdAtISO: string;
  createdAt: number;
}

// Add caches for collections and content labels
const collectionsCache: Map<string, MaydayCollection | null> = new Map();
const contentLabelsCache: Map<string, MaydayContentLabel | null> = new Map();
let allContentLabels: MaydayContentLabel[] | null = null;

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
  } catch (error: any) {
    console.error("Error getting access token:");
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error message:", error.message);
    }
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

      // Limit to 3 pages for now
      if (page > 3) {
        break;
      }
    } catch (error: any) {
      console.error("Error fetching contents:");
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
        console.error("Response headers:", error.response.headers);
      } else if (error.request) {
        // The request was made but no response was received
        console.error("No response received:", error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error("Error message:", error.message);
      }
      console.error("Error config:", error.config);
      throw error;
    }
  }

  console.log(`Total articles retrieved: ${allContents.length}`);
  return allContents;
}

async function getCollectionDetails(
  collectionId: string,
  accessToken: string,
  locale: string = "default"
): Promise<MaydayCollection | null> {
  // Check cache first
  if (collectionsCache.has(collectionId)) {
    console.log(`Using cached collection for ${collectionId}`);
    return collectionsCache.get(collectionId) || null;
  }

  try {
    console.log(`Fetching collection ${collectionId} from API`);
    const response = await maydayLimiter.schedule(() =>
      maydayApi.get(`/collections/${locale}/${collectionId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    // Cache the result
    collectionsCache.set(collectionId, response.data);
    return response.data;
  } catch (error: any) {
    console.error(`Error fetching collection ${collectionId}:`);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    } else if (error.request) {
      console.error("No response received");
    } else {
      console.error("Error message:", error.message);
    }

    // Cache the null result to avoid repeated failed requests
    collectionsCache.set(collectionId, null);
    return null;
  }
}

async function getAllContentLabels(
  accessToken: string
): Promise<MaydayContentLabel[]> {
  // If we've already fetched all labels, return the cached result
  if (allContentLabels !== null) {
    console.log("Using cached content labels");
    return allContentLabels;
  }

  try {
    console.log("Fetching all content labels from API");
    const response = await maydayLimiter.schedule(() =>
      maydayApi.get(`/content-labels`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    allContentLabels = response.data.data;
    console.log(`Cached ${allContentLabels.length} content labels`);
    return allContentLabels;
  } catch (error: any) {
    console.error("Error fetching all content labels:");
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    } else if (error.request) {
      console.error("No response received");
    } else {
      console.error("Error message:", error.message);
    }
    return [];
  }
}

async function getContentLabel(
  labelId: string,
  accessToken: string
): Promise<MaydayContentLabel | null> {
  // Check cache first
  if (contentLabelsCache.has(labelId)) {
    console.log(`Using cached content label for ${labelId}`);
    return contentLabelsCache.get(labelId) || null;
  }

  try {
    // Get all labels if we haven't already
    const labels = await getAllContentLabels(accessToken);

    // Find the specific label
    const label = labels.find((label) => label.id === labelId);

    // Cache the result
    contentLabelsCache.set(labelId, label || null);
    return label || null;
  } catch (error: any) {
    console.error(`Error fetching content label ${labelId}:`);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    } else if (error.request) {
      console.error("No response received");
    } else {
      console.error("Error message:", error.message);
    }

    // Cache the null result
    contentLabelsCache.set(labelId, null);
    return null;
  }
}

async function buildHierarchyPath(
  content: MaydayContent,
  accessToken: string
): Promise<string> {
  // Build a path showing the article's position in the collection hierarchy
  let hierarchyPath = "";

  console.log(`Building hierarchy path for article ${content.id}`);

  // Process ancestors if they exist
  if (content.ancestorsIds && content.ancestorsIds.length > 0) {
    console.log(`Article has ${content.ancestorsIds.length} ancestors`);

    // Fetch all ancestors in parallel
    const ancestorPromises = content.ancestorsIds.map((id) =>
      getCollectionDetails(id, accessToken)
    );

    const ancestors = await Promise.all(ancestorPromises);
    const validAncestors = ancestors.filter(
      (a) => a !== null
    ) as MaydayCollection[];

    console.log(`Found ${validAncestors.length} valid ancestors`);

    if (validAncestors.length > 0) {
      // Sort ancestors to maintain the correct hierarchy order
      // This assumes ancestorsIds are ordered from root to leaf
      const orderedAncestors = validAncestors
        .filter((a) => content.ancestorsIds.includes(a.id))
        .sort(
          (a, b) =>
            content.ancestorsIds.indexOf(a.id) -
            content.ancestorsIds.indexOf(b.id)
        );

      hierarchyPath = orderedAncestors.map((a) => a.label).join(" > ");
    }
  } else {
    console.log(`Article has no ancestors`);
  }

  // Process collections if they exist
  if (content.collectionsIds && content.collectionsIds.length > 0) {
    console.log(
      `Article belongs to ${content.collectionsIds.length} collections`
    );

    // Fetch all collections in parallel
    const collectionPromises = content.collectionsIds.map((id) =>
      getCollectionDetails(id, accessToken)
    );

    const collections = await Promise.all(collectionPromises);
    const validCollections = collections.filter(
      (c) => c !== null
    ) as MaydayCollection[];

    console.log(`Found ${validCollections.length} valid collections`);

    if (validCollections.length > 0) {
      if (hierarchyPath) {
        hierarchyPath += " > ";
      }
      hierarchyPath += validCollections.map((c) => c.label).join(", ");
    }
  } else {
    console.log(`Article doesn't belong to any collections`);
  }

  console.log(`Final hierarchy path: ${hierarchyPath || "None"}`);
  return hierarchyPath;
}

async function getContentLabelsInfo(
  content: MaydayContent,
  accessToken: string
): Promise<string> {
  // If contentLabelsIds is undefined or empty, return empty string
  if (!content.contentLabelsIds || content.contentLabelsIds.length === 0) {
    console.log(`No content labels found for article ${content.id}`);
    return "";
  }

  console.log(
    `Fetching ${content.contentLabelsIds.length} content labels for article ${content.id}`
  );

  // Fetch all content labels in parallel using the cached function
  const labelPromises = content.contentLabelsIds.map((id) =>
    getContentLabel(id, accessToken)
  );

  const labels = await Promise.all(labelPromises);
  const validLabels = labels.filter((l) => l !== null) as MaydayContentLabel[];

  if (validLabels.length === 0) {
    console.log(`No valid content labels found for article ${content.id}`);
    return "";
  }

  console.log(
    `Found ${validLabels.length} valid content labels for article ${content.id}`
  );
  return validLabels.map((l) => `${l.label} (${l.category})`).join(", ");
}

async function upsertToDustDatasource(
  content: MaydayContent,
  accessToken: string
) {
  const documentId = `content-${content.id}`;

  // Get hierarchical information
  const hierarchyPath = await buildHierarchyPath(content, accessToken);
  const contentLabelsInfo = await getContentLabelsInfo(content, accessToken);

  // Build a more structured content text with hierarchical information
  const contentText = `
Title: ${content.label}
Type: ${content.type}
Created At: ${content.createdAtISO}
Updated At: ${content.contentUpdatedAtISO}
Is Outdated: ${content.isOutdated}
Is Published: ${content.isPublished}
Knowledge ID: ${content.knowledgeId}

Hierarchy Path: ${hierarchyPath || "None"}
Collections: ${
    content.collectionsIds.length > 0
      ? content.collectionsIds.join(", ")
      : "None"
  }
${
  content.ancestorsIds.length > 0
    ? `Ancestors: ${content.ancestorsIds.join(", ")}`
    : ""
}
${
  content.childrenIds.length > 0
    ? `Children: ${content.childrenIds.join(", ")}`
    : ""
}
${contentLabelsInfo ? `Content Labels: ${contentLabelsInfo}` : ""}

Content:
${turndownService.turndown(content.body)}
  `.trim();

  const sourceUrl = `${MAYDAY_BASE_URL}/contents/${content.locale}/${content.id}`;

  console.log("Upserting article to Dust datasource");
  console.log("Document ID:", documentId);
  console.log("Source URL:", sourceUrl);
  console.log("Content Text:", contentText);

  try {
    await limitedDustApiPost(
      `/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
      {
        text: contentText,
        source_url: sourceUrl,
      }
    );
    console.log(`Upserted article ${content.id} to Dust datasource`);
  } catch (error: any) {
    console.error(`Error upserting article ${content.id} to Dust datasource:`);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error message:", error.message);
    }
  }
}

async function main() {
  try {
    console.log("Starting Mayday to Dust import process...");

    // Get access token
    console.log("Getting access token...");
    const accessToken = await getAccessToken();

    // Pre-fetch all content labels to populate the cache
    console.log("Pre-fetching all content labels...");
    await getAllContentLabels(accessToken);

    // Get all contents
    console.log("Fetching all contents...");
    const contents = await getAllContents(accessToken);

    console.log(`Processing ${contents.length} articles...`);

    // Process each content
    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      console.log(
        `Processing article ${i + 1}/${contents.length}: ${content.id} - ${
          content.label
        }`
      );
      await upsertToDustDatasource(content, accessToken);
    }

    console.log("All articles processed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
