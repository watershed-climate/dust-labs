import axios from "axios";
import * as dotenv from "dotenv";
import jsforce from "jsforce";
import Bottleneck from "bottleneck";

dotenv.config();

const SF_LOGIN_URL = process.env.SF_LOGIN_URL;
const SF_USERNAME = process.env.SF_USERNAME;
const SF_PASSWORD = process.env.SF_PASSWORD;
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN;
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_VAULT_ID = process.env.DUST_VAULT_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;
const UPDATED_SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const IMPORT_AS_TABLE = process.env.IMPORT_AS_TABLE === "true";
const DUST_TABLE_ID = "salesforce_accounts";

const missingVars = [];

if (!SF_LOGIN_URL) missingVars.push("SF_LOGIN_URL");

const usernamePasswordMissing = !(
  SF_USERNAME &&
  SF_PASSWORD &&
  SF_SECURITY_TOKEN
);
const clientCredentialsMissing = !(SF_CLIENT_ID && SF_CLIENT_SECRET);

if (usernamePasswordMissing && clientCredentialsMissing) {
  missingVars.push(
    "(SF_USERNAME, SF_PASSWORD, and SF_SECURITY_TOKEN) or (SF_CLIENT_ID and SF_CLIENT_SECRET)"
  );
}

if (!DUST_API_KEY) missingVars.push("DUST_API_KEY");
if (!DUST_WORKSPACE_ID) missingVars.push("DUST_WORKSPACE_ID");
if (!DUST_DATASOURCE_ID) missingVars.push("DUST_DATASOURCE_ID");

if (missingVars.length > 0) {
  throw new Error(
    `Please provide values for the following environment variables in the .env file: ${missingVars.join(
      ", "
    )}. Note that you need to provide either (SF_USERNAME, SF_PASSWORD, and SF_SECURITY_TOKEN) or (SF_CLIENT_ID and SF_CLIENT_SECRET).`
  );
}

// Rate limiter for Dust API (120 requests per minute)
const limiter = new Bottleneck({
  minTime: 500, // Minimum time between requests (in ms)
  maxConcurrent: 10, // Maximum number of concurrent requests
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

// Wrap the dustApi.post method with the rate limiter
const rateLimitedDustApiPost = limiter.wrap(async (url: string, data: any) => {
  return await dustApi.post(url, data);
});

interface Account {
  Id: string;
  Name: string;
  Industry?: string;
  AnnualRevenue?: number;
  NumberOfEmployees?: number;
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  ShippingStreet?: string;
  ShippingCity?: string;
  ShippingState?: string;
  ShippingPostalCode?: string;
  ShippingCountry?: string;
  Phone?: string;
  Website?: string;
  Description?: string;
  Type?: string;
  Rating?: string;
  AccountSource?: string;
  OwnerId?: string;
  CreatedDate: string;
  LastModifiedDate: string;
  LastActivityDate?: string;
  Contacts?: {
    records: {
      Id: string;
      Name: string;
      Email?: string;
      Phone?: string;
      Title?: string;
      LastModifiedDate: string;
    }[];
  };
  Opportunities?: {
    records: {
      Id: string;
      Name: string;
      StageName?: string;
      Amount?: number;
      CloseDate?: string;
      LastModifiedDate: string;
    }[];
  };
  Cases?: {
    records: {
      Id: string;
      CaseNumber: string;
      Subject?: string;
      Status?: string;
      CreatedDate: string;
      LastModifiedDate: string;
    }[];
  };
}

async function connectToSalesforce(): Promise<jsforce.Connection> {
  let conn: jsforce.Connection;
  const connectionOptions = {
    loginUrl: SF_LOGIN_URL,
    version: "53.0", // Specify a version
    maxRequest: 5, // Limit concurrent requests
    timeout: 60000, // 60 seconds timeout
  };

  if (SF_USERNAME && SF_PASSWORD && SF_SECURITY_TOKEN) {
    conn = new jsforce.Connection(connectionOptions);
    await conn.login(SF_USERNAME, SF_PASSWORD + SF_SECURITY_TOKEN);
  } else if (SF_CLIENT_ID && SF_CLIENT_SECRET) {
    conn = new jsforce.Connection({
      ...connectionOptions,
      oauth2: {
        clientId: SF_CLIENT_ID,
        clientSecret: SF_CLIENT_SECRET,
        loginUrl: SF_LOGIN_URL,
      },
    });
    await (conn.oauth2.authenticate as any)({
      grant_type: "client_credentials",
      client_id: SF_CLIENT_ID,
      client_secret: SF_CLIENT_SECRET,
    });
  } else {
    throw new Error("Insufficient authentication information provided");
  }
  console.log("Connected to Salesforce");
  console.log("Date of last update:", UPDATED_SINCE);
  return conn;
}

async function getRecentlyUpdatedAccountIds(
  conn: jsforce.Connection
): Promise<Set<string>> {
  const queries = [
    `SELECT Id FROM Account WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
    `SELECT AccountId FROM Contact WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
    `SELECT AccountId FROM Opportunity WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
    `SELECT AccountId FROM Case WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
  ];
  const accountIds = new Set<string>();
  for (const query of queries) {
    console.log(`Executing query: ${query}`);
    try {
      let result = await conn.query<{ Id: string; AccountId?: string }>(query);
      console.log(`Found ${result.totalSize} records`);
      do {
        result.records.forEach((record) => {
          accountIds.add(record.Id || record.AccountId || "");
        });
        if (!result.done) {
          result = await conn.queryMore<{ Id: string; AccountId?: string }>(
            result.nextRecordsUrl
          );
        }
      } while (!result.done);
    } catch (error) {
      console.error(`Error executing query: ${query}`, error);
    }
  }
  return accountIds;
}

async function getAccountDetails(
  conn: jsforce.Connection,
  accountIds: string[]
): Promise<Account[]> {
  const query = `
    SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry,
           Phone, Website, Description, Type, Rating, AccountSource, OwnerId,
           CreatedDate, LastModifiedDate, LastActivityDate,
           (SELECT Id, Name, Email, Phone, Title, LastModifiedDate FROM Contacts),
           (SELECT Id, Name, StageName, Amount, CloseDate, LastModifiedDate FROM Opportunities),
           (SELECT Id, CaseNumber, Subject, Status, CreatedDate, LastModifiedDate FROM Cases)
    FROM Account
    WHERE Id IN ('${accountIds.join("','")}')
  `;
  try {
    let result = await conn.query<Account>(query);
    const accounts: Account[] = [];
    do {
      accounts.push(...result.records);
      if (!result.done) {
        result = await conn.queryMore<Account>(result.nextRecordsUrl);
      }
    } while (!result.done);
    return accounts;
  } catch (error) {
    console.error("Error fetching account details from Salesforce:", error);
    throw error;
  }
}

function formatAddress(
  street?: string,
  city?: string,
  state?: string,
  postalCode?: string,
  country?: string
): string {
  const parts = [street, city, state, postalCode, country].filter(Boolean);
  return parts.join(", ");
}

async function upsertDocumentToDustDatasource(account: Account) {
  const documentId = `account-${account.Id}`;
  const content = `
    Account Summary for ${account.Name}
    Basic Account Details:
    Company Name: ${account.Name}
    Industry: ${account.Industry || "N/A"}
    Annual Revenue: ${
      account.AnnualRevenue
        ? `$${account.AnnualRevenue.toLocaleString()}`
        : "N/A"
    }
    Number of Employees: ${account.NumberOfEmployees || "N/A"}
    Phone: ${account.Phone || "N/A"}
    Website: ${account.Website || "N/A"}
    Locations:
    Billing Address: ${formatAddress(
      account.BillingStreet,
      account.BillingCity,
      account.BillingState,
      account.BillingPostalCode,
      account.BillingCountry
    )}
    Shipping Address: ${formatAddress(
      account.ShippingStreet,
      account.ShippingCity,
      account.ShippingState,
      account.ShippingPostalCode,
      account.ShippingCountry
    )}
    Key Contacts:
    ${
      account.Contacts?.records
        .map(
          (contact) =>
            `- ${contact.Name}${contact.Title ? `, ${contact.Title}` : ""}
        Email: ${contact.Email || "N/A"}, Phone: ${contact.Phone || "N/A"}
        Last Modified: ${contact.LastModifiedDate}`
        )
        .join("\n") || "No contacts found"
    }
    Account Status:
    Type: ${account.Type || "N/A"}
    Rating: ${account.Rating || "N/A"}
    Account Source: ${account.AccountSource || "N/A"}
    Created Date: ${account.CreatedDate}
    Last Modified Date: ${account.LastModifiedDate}
    Last Activity Date: ${account.LastActivityDate || "N/A"}
    Sales Information:
    Open Opportunities:
    ${
      account.Opportunities?.records
        .map(
          (opp) =>
            `- ${opp.Name}
        Stage: ${opp.StageName || "N/A"}, Amount: ${
              opp.Amount ? `$${opp.Amount.toLocaleString()}` : "N/A"
            }, Close Date: ${opp.CloseDate || "N/A"}
        Last Modified: ${opp.LastModifiedDate}`
        )
        .join("\n") || "No open opportunities"
    }
    Account Health:
    Recent Support Cases:
    ${
      account.Cases?.records
        .map(
          (case_) =>
            `- Case Number: ${case_.CaseNumber}
        Subject: ${case_.Subject || "N/A"}, Status: ${
              case_.Status || "N/A"
            }, Created Date: ${case_.CreatedDate}
        Last Modified: ${case_.LastModifiedDate}`
        )
        .join("\n") || "No recent support cases"
    }
    Additional Information:
    ${account.Description || "No additional information provided."}
  `.trim();
  try {
    await rateLimitedDustApiPost(
      `/w/${DUST_WORKSPACE_ID}/vaults/${DUST_VAULT_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
      {
        source_url: `${SF_LOGIN_URL}/${account.Id}`,
        text: content,
      }
    );

    if (IMPORT_AS_TABLE) {
      await rateLimitedDustApiPost(
        `/w/${DUST_WORKSPACE_ID}/vaults/${DUST_VAULT_ID}/data_sources/${DUST_DATASOURCE_ID}/table/${documentId}`,
        {
          id: DUST_TABLE_ID,

          source_url: `${SF_LOGIN_URL}/${account.Id}`,
          text: content,
        }
      );
    }

    console.log(`Upserted account ${account.Id} to Dust datasource`);
  } catch (error) {
    console.error(
      `Error upserting account ${account.Id} to Dust datasource:`,
      error
    );
  }
}

async function upsertTableRowsToDustDatasource(accounts: Account[]) {
  const rows = accounts.map((account) => ({
    row_id: `account-${account.Id}`,
    value: {
      company_name: account.Name,
      industry: account.Industry || "N/A",
      arr: account.AnnualRevenue ? account.AnnualRevenue : -1,
      number_of_employees: account.NumberOfEmployees || "N/A",
      type: account.Type || "N/A",
      rating: account.Rating || "N/A",
      source: account.AccountSource || "N/A",
      created_date: account.CreatedDate,
      last_modified_date: account.LastModifiedDate,
      last_activity_date: account.LastActivityDate || "N/A",
    },
  }));

  await rateLimitedDustApiPost(
    `/w/${DUST_WORKSPACE_ID}/vaults/${DUST_VAULT_ID}/data_sources/${DUST_DATASOURCE_ID}/tables/${DUST_TABLE_ID}`,
    {
      rows,
      truncate: false,
    }
  );
}

async function main() {
  try {
    const conn = await connectToSalesforce();

    console.log("Fetching recently updated accounts from Salesforce...");
    const accountIds = await getRecentlyUpdatedAccountIds(conn);
    console.log(
      `Found ${accountIds.size} accounts with updates in the last 24 hours.`
    );

    const accounts = await getAccountDetails(conn, Array.from(accountIds));
    await conn.logout();

    console.log(`Processing ${accounts.length} accounts...`);
    const upsertPromises = accounts.map((account) =>
      upsertDocumentToDustDatasource(account)
    );

    if (IMPORT_AS_TABLE) {
      // Create the table if it does not exist.
      const existingTable = await dustApi.get(
        `/w/${DUST_WORKSPACE_ID}/vaults/${DUST_VAULT_ID}/data_sources/${DUST_DATASOURCE_ID}/tables/${DUST_TABLE_ID}`
      );

      if (existingTable.status === 404) {
        await rateLimitedDustApiPost(
          `/w/${DUST_WORKSPACE_ID}/vaults/${DUST_VAULT_ID}/data_sources/${DUST_DATASOURCE_ID}/tables`,
          {
            id: DUST_TABLE_ID,
            name: "Salesforce Accounts",
            timestamp: Date.now(),
          }
        );
      }

      upsertPromises.push(upsertTableRowsToDustDatasource(accounts));
    }

    await Promise.all(upsertPromises);

    console.log(`Processed ${accounts.length} accounts`);
    console.log("Finished processing accounts");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
