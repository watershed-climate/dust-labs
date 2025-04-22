import axios from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";

dotenv.config();

// Constants
const PYLON_RATE_LIMIT_PER_MINUTE = 30;

// Pylon API and Dust API credentials and settings
const PYLON_API_KEY = process.env.PYLON_API_KEY;
const PYLON_START_DATE = process.env.PYLON_START_DATE;
const PYLON_END_DATE = process.env.PYLON_END_DATE;

const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

// Validate environment variables
const requiredEnvVars = [
  "PYLON_API_KEY",
  "DUST_API_KEY",
  "DUST_WORKSPACE_ID",
  "DUST_DATASOURCE_ID",
  "DUST_RATE_LIMIT",
  "PYLON_MAX_CONCURRENT",
];

const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);
if (missingEnvVars.length > 0) {
  throw new Error(
    `Please provide values for the following environment variables: ${missingEnvVars.join(
      ", "
    )}`
  );
}

// Rate limiting configuration
const DUST_RATE_LIMIT = parseInt(process.env.DUST_RATE_LIMIT as string);
const PYLON_MAX_CONCURRENT = parseInt(
  process.env.PYLON_MAX_CONCURRENT as string
);

// Initialize Pylon API client
const pylonApi = axios.create({
  baseURL: "https://api.usepylon.com",
  headers: {
    Authorization: `Bearer ${PYLON_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// Initialize Dust API client
const dustApi = axios.create({
  baseURL: "https://dust.tt/api/v1",
  headers: {
    Authorization: `Bearer ${DUST_API_KEY}`,
    "Content-Type": "application/json",
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

// Add rate limiting for APIs
const pylonLimiter = new Bottleneck({
  maxConcurrent: PYLON_MAX_CONCURRENT,
  minTime: (60 * 1000) / PYLON_RATE_LIMIT_PER_MINUTE,
});

// Interface definitions
interface Section {
  prefix?: string | null;
  content?: string | null;
  sections: Section[];
}

// Interfaces for Pylon Issue and Account
interface PylonIssue {
  id: string;
  title: string;
  state: string;
  type: string;
  account: {
    id: string;
    primary_domain: string;
    type: string;
  };
  assignee: {
    email: string;
    id: string;
  };
  body_html: string;
  created_at: string;
  csat_responses: Array<{
    comment: string;
    score: number;
  }>;
  custom_fields: Record<
    string,
    { slug: string; value: string; values: string[] }
  >;
  customer_portal_visible: boolean;
  external_issues: Array<{ external_id: string; link: string; source: string }>;
  requester: {
    email: string;
    id: string;
  };
  resolution_time: string;
  tags: string[];
}

interface Account {
  id: string;
  name: string;
  primary_domain: string;
  type: string;
}

/**
 * Format issue description
 */
function formatDescription(description: string): string {
  return description || "No description provided";
}

// Fetch issues from Pylon API
async function getIssues(): Promise<PylonIssue[]> {
  console.log(`Fetching Pylon issues with the following filters:`);
  if (PYLON_START_DATE) console.log(`- Start date: ${PYLON_START_DATE}`);
  if (PYLON_END_DATE) console.log(`- End date: ${PYLON_END_DATE}`);

  try {
    const params: Record<string, any> = {};

    if (PYLON_START_DATE) {
      params.start_time = PYLON_START_DATE;
    }
    if (PYLON_END_DATE) {
      params.end_time = PYLON_END_DATE;
    }

    const allIssues: PylonIssue[] = [];
    let cursor: string | undefined;

    do {
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await pylonLimiter.schedule(() =>
        pylonApi.get("/issues", { params })
      );

      const issues: PylonIssue[] = response.data.data || [];
      allIssues.push(...issues);

      cursor = response.data.pagination?.cursor;
    } while (cursor);

    console.log(`Retrieved ${allIssues.length} issues from Pylon`);
    return allIssues;
  } catch (error) {
    console.error("Error fetching Pylon issues:", error);
    throw error;
  }
}

// Fetch accounts from Pylon API
async function getAccounts(): Promise<Account[]> {
  try {
    const allAccounts: Account[] = [];
    let cursor: string | undefined;
    const params: Record<string, any> = { limit: 100 };

    do {
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await pylonLimiter.schedule(() =>
        pylonApi.get("/accounts", { params })
      );

      const accounts: Account[] = response.data.data || [];
      allAccounts.push(...accounts);

      cursor = response.data.pagination?.cursor;
    } while (cursor);

    console.log(`Retrieved ${allAccounts.length} accounts from Pylon`);
    return allAccounts;
  } catch (error) {
    console.error("Error fetching Pylon accounts:", error);
    throw error;
  }
}

// Enrich issues with account data
function enrichIssuesWithAccounts(
  issues: PylonIssue[],
  accounts: Account[]
): PylonIssue[] {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  return issues.map((issue) => {
    const accountData = accountMap.get(issue.account.id);
    return { ...issue, account: { ...issue.account, ...accountData } };
  });
}

// Upsert enriched issues to Dust datasource
async function upsertToDustDatasource(issue: PylonIssue) {
  try {
    const documentId = `pylon-issue-${issue.id}`;

    // Create the main section with metadata
    const metadataSection: Section = {
      prefix: "Metadata",
      content: null,
      sections: [
        {
          prefix: "Issue Details",
          content: [
            `ID: ${issue.id}`,
            `State: ${issue.state}`,
            `Domain: ${issue.account?.primary_domain ?? "Unknown"}`,
            `Account Type: ${issue.account?.type ?? "Unknown"}`,
          ].join("\n"),
          sections: [],
        },
        {
          prefix: "Dates & Times",
          content: [
            `Created: ${issue.created_at}`,
            `Resolution: ${issue.resolution_time || "Pending"}`,
          ].join("\n"),
          sections: [],
        },
        {
          prefix: "People",
          content: [
            `Requester: (${issue.requester?.email ?? "Unknown"})`,
            `Assignee: (${issue.assignee?.email ?? "Unassigned"})`,
          ].join("\n"),
          sections: [],
        },
        {
          prefix: "CSAT Responses",
          content: (issue.csat_responses ?? [])
            .map(
              (response) =>
                `Score: ${response.score}, Comment: ${response.comment}`
            )
            .join("\n"),
          sections: [],
        },
        {
          prefix: "External Issues",
          content: (issue.external_issues ?? [])
            .map((ex) => `Source: ${ex.source}, Link: ${ex.link}`)
            .join("\n"),
          sections: [],
        },
      ],
    };

    // Create the full document section structure
    const sections: Section[] = [
      metadataSection,
      {
        prefix: "Description",
        content: formatDescription(issue.body_html),
        sections: [],
      },
    ];

    const section: Section = {
      prefix: issue.id,
      content: issue.title,
      sections: sections,
    };

    // Upsert to Dust
    await dustApi.post(
      `/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
      {
        section: section,
        title: `Pylon Issue ${issue.id}: ${issue.title}`,
      }
    );

    console.log(`Upserted issue ${issue.id} to Dust datasource`);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Error upserting issue ${issue.id} to Dust datasource: ${error.message}\n` +
          `Status: ${error.response?.status}\n` +
          `Response data: ${JSON.stringify(error.response?.data)}`
      );
    } else {
      console.error(
        `Error upserting issue ${issue.id} to Dust datasource:`,
        error
      );
    }
    throw error;
  }
}

// Main function execution
async function main() {
  try {
    const issues = await getIssues();
    const accounts = await getAccounts();
    const enrichedIssues = enrichIssuesWithAccounts(issues, accounts);

    // Rate limiting configuration
    const limiter = new Bottleneck({
      maxConcurrent: PYLON_MAX_CONCURRENT,
      minTime: (60 * 1000) / DUST_RATE_LIMIT,
    });

    const tasks = enrichedIssues.map((issue) =>
      limiter.schedule(() => upsertToDustDatasource(issue))
    );

    await Promise.all(tasks);
    console.log("All issues processed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
