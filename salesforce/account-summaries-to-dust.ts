import axios from 'axios';
import * as dotenv from 'dotenv';
import jsforce from 'jsforce';

dotenv.config();

const SF_LOGIN_URL = process.env.SF_LOGIN_URL;
const SF_USERNAME = process.env.SF_USERNAME;
const SF_PASSWORD = process.env.SF_PASSWORD;
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN;
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID_SALESFORCE;

const UPDATED_SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const dustApi = axios.create({
  baseURL: 'https://dust.tt/api/v1',
  headers: {
    'Authorization': `Bearer ${DUST_API_KEY}`,
    'Content-Type': 'application/json'
  }
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

  if (SF_USERNAME && SF_PASSWORD && SF_SECURITY_TOKEN) {
    // Use username/password authentication
    conn = new jsforce.Connection({
      loginUrl: SF_LOGIN_URL
    });
    await conn.login(SF_USERNAME, SF_PASSWORD + SF_SECURITY_TOKEN);
  } else if (SF_CLIENT_ID && SF_CLIENT_SECRET) {
    // Use OAuth 2.0 client credentials flow
    conn = new jsforce.Connection({
      oauth2: {
        clientId: SF_CLIENT_ID,
        clientSecret: SF_CLIENT_SECRET,
        loginUrl: SF_LOGIN_URL
      }
    });
    await conn.oauth2.authenticate({
      grant_type: 'client_credentials'
    });
  } else {
    throw new Error('Insufficient authentication information provided');
  }

  console.log('Connected to Salesforce');
  return conn;
}

async function getRecentlyUpdatedAccountIds(conn: jsforce.Connection): Promise<Set<string>> {
  const queries = [
    `SELECT Id FROM Account WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
    `SELECT AccountId FROM Contact WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
    `SELECT AccountId FROM Opportunity WHERE LastModifiedDate >= ${UPDATED_SINCE}`,
    `SELECT AccountId FROM Case WHERE LastModifiedDate >= ${UPDATED_SINCE}`
  ];

  const accountIds = new Set<string>();

  for (const query of queries) {
    try {
      const result = await conn.query(query);
      result.records.forEach(record => {
        accountIds.add(record.Id || record.AccountId);
      });
    } catch (error) {
      console.error(`Error executing query: ${query}`, error);
    }
  }

  return accountIds;
}

async function getAccountDetails(conn: jsforce.Connection, accountIds: string[]): Promise<Account[]> {
  const query = `
    SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry,
           Phone, Website, Description, Type, Rating, AccountSource, OwnerId,
           CreatedDate, LastModifiedDate, LastActivityDate,
           (SELECT Id, Name, Email, Phone, Title, LastModifiedDate FROM Contacts WHERE LastModifiedDate >= ${UPDATED_SINCE}),
           (SELECT Id, Name, StageName, Amount, CloseDate, LastModifiedDate FROM Opportunities WHERE LastModifiedDate >= ${UPDATED_SINCE}),
           (SELECT Id, CaseNumber, Subject, Status, CreatedDate, LastModifiedDate FROM Cases WHERE LastModifiedDate >= ${UPDATED_SINCE})
    FROM Account
    WHERE Id IN ('${accountIds.join("','")}')
  `;

  try {
    const result = await conn.query<Account>(query);
    return result.records;
  } catch (error) {
    console.error('Error fetching account details from Salesforce:', error);
    throw error;
  }
}

function formatAddress(street?: string, city?: string, state?: string, postalCode?: string, country?: string): string {
  const parts = [street, city, state, postalCode, country].filter(Boolean);
  return parts.join(', ');
}

async function upsertToDustDatasource(account: Account) {
  const documentId = `account-${account.Id}`;
  const content = `
Account Summary for ${account.Name}

Basic Account Details:
Company Name: ${account.Name}
Industry: ${account.Industry || 'N/A'}
Annual Revenue: ${account.AnnualRevenue ? `$${account.AnnualRevenue.toLocaleString()}` : 'N/A'}
Number of Employees: ${account.NumberOfEmployees || 'N/A'}
Phone: ${account.Phone || 'N/A'}
Website: ${account.Website || 'N/A'}

Locations:
Billing Address: ${formatAddress(account.BillingStreet, account.BillingCity, account.BillingState, account.BillingPostalCode, account.BillingCountry)}
Shipping Address: ${formatAddress(account.ShippingStreet, account.ShippingCity, account.ShippingState, account.ShippingPostalCode, account.ShippingCountry)}

Key Contacts:
${account.Contacts?.records.map(contact => 
  `- ${contact.Name}${contact.Title ? `, ${contact.Title}` : ''}
    Email: ${contact.Email || 'N/A'}, Phone: ${contact.Phone || 'N/A'}
    Last Modified: ${contact.LastModifiedDate}`
).join('\n') || 'No contacts found'}

Account Status:
Type: ${account.Type || 'N/A'}
Rating: ${account.Rating || 'N/A'}
Account Source: ${account.AccountSource || 'N/A'}
Created Date: ${account.CreatedDate}
Last Modified Date: ${account.LastModifiedDate}
Last Activity Date: ${account.LastActivityDate || 'N/A'}

Sales Information:
Open Opportunities:
${account.Opportunities?.records.map(opp => 
  `- ${opp.Name}
    Stage: ${opp.StageName || 'N/A'}, Amount: ${opp.Amount ? `$${opp.Amount.toLocaleString()}` : 'N/A'}, Close Date: ${opp.CloseDate || 'N/A'}
    Last Modified: ${opp.LastModifiedDate}`
).join('\n') || 'No open opportunities'}

Account Health:
Recent Support Cases:
${account.Cases?.records.map(case_ => 
  `- Case Number: ${case_.CaseNumber}
    Subject: ${case_.Subject || 'N/A'}, Status: ${case_.Status || 'N/A'}, Created Date: ${case_.CreatedDate}
    Last Modified: ${case_.LastModifiedDate}`
).join('\n') || 'No recent support cases'}

Additional Information:
${account.Description || 'No additional information provided.'}
  `.trim();

  try {
    await dustApi.post(`/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`, {
      source_url: `${SF_LOGIN_URL}/${account.Id}`,
      text: content
    });
    console.log(`Upserted account ${account.Id} to Dust datasource`);
  } catch (error) {
    console.error(`Error upserting account ${account.Id} to Dust datasource:`, error);
  }
}

async function main() {
  let conn: jsforce.Connection | null = null;

  try {
    conn = await connectToSalesforce();

    const accountIds = await getRecentlyUpdatedAccountIds(conn);
    console.log(`Found ${accountIds.size} accounts with updates in the last 24 hours.`);

    // Process accounts in batches of 200 to avoid hitting SOQL query length limits
    const batchSize = 200;
    const accountIdArray = Array.from(accountIds);
    for (let i = 0; i < accountIdArray.length; i += batchSize) {
      const batchIds = accountIdArray.slice(i, i + batchSize);
      const accounts = await getAccountDetails(conn, batchIds);
      
      for (const account of accounts) {
        await upsertToDustDatasource(account);
      }

      console.log(`Processed ${i + accounts.length} out of ${accountIds.size} accounts`);
    }

    console.log('Finished processing accounts');
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    if (conn) {
      await conn.logout();
      console.log('Logged out from Salesforce');
    }
  }
}

main();
