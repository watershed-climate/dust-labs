import axios from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

const UPDATED_SINCE_DAYS = 1; // Number of days to look back for updates
const UPDATED_SINCE = new Date(
  Date.now() - UPDATED_SINCE_DAYS * 24 * 60 * 60 * 1000
).toISOString();
const THREADS_NUMBER = 3;

if (
  !HUBSPOT_ACCESS_TOKEN ||
  !HUBSPOT_PORTAL_ID ||
  !DUST_API_KEY ||
  !DUST_WORKSPACE_ID ||
  !DUST_DATASOURCE_ID
) {
  throw new Error(
    "Please provide values for HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID, DUST_API_KEY, DUST_WORKSPACE_ID, and DUST_DATASOURCE_ID in .env file."
  );
}

const hubspotApi = axios.create({
  baseURL: "https://api.hubapi.com",
  headers: {
    Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
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

// Bottleneck limiter for HubSpot API
const hubspotLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1000, // 1 second between requests to stay well under the 19/second limit
  reservoir: 190, // Maximum requests per 10 seconds
  reservoirRefreshAmount: 190,
  reservoirRefreshInterval: 10000, // 10 seconds
  trackDoneStatus: true,
});

// Bottleneck limiter for Dust API
const dustLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 500, // 60000ms / 120 requests per minute
});

interface Company {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Contact {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Deal {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Ticket {
  id: string;
  properties: {
    [key: string]: string;
  };
}

interface Order {
  id: string;
  properties: {
    [key: string]: string;
  };
}

interface Note {
  id: string;
  properties: {
    [key: string]: string;
  };
}

interface Section {
  prefix: string;
  content: string;
  sections: Section[];
}

interface WorkerMessage {
  type: "log" | "error" | "result";
  data: any;
}

class HubspotClient {
  constructor(private api: typeof hubspotApi) {}

  async getDealActivities(
    dealId: string
  ): Promise<{ results: { id: string }[] }> {
    const response = await this.api.get(
      `/crm/v3/objects/deals/${dealId}/associations/meetings`,
      {
        params: { limit: 100 },
      }
    );
    return response.data;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString().split("T")[0];
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

async function getRecentlyUpdatedCompanyIds(): Promise<string[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/companies/search", {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_lastmodifieddate",
                operator: "GTE",
                value: UPDATED_SINCE,
              },
            ],
          },
        ],
        properties: ["hs_object_id"],
        limit: 100,
      })
    );
    return response.data.results.map((company: Company) => company.id);
  } catch (error) {
    console.error("Error fetching recently updated company IDs:", error);
    return [];
  }
}

async function getCompanyDetails(companyId: string): Promise<Company | null> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(`/crm/v3/objects/companies/${companyId}`, {
        params: {
          properties: [
            "name",
            "industry",
            "annualrevenue",
            "numberofemployees",
            "phone",
            "website",
            "description",
            "hs_lead_status",
            "createdate",
            "hs_lastmodifieddate",
            "lifecyclestage",
            "hubspot_owner_id",
            "type",
            "city",
            "state",
            "country",
            "zip",
            "address",
            "facebook_company_page",
            "linkedin_company_page",
            "twitterhandle",
            "hs_analytics_source",
            "notes_last_updated",
            "hs_pipeline",
          ],
        },
      })
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching details for company ${companyId}:`, error);
    return null;
  }
}

async function getAssociatedContacts(companyId: string): Promise<Contact[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/contacts`,
        {
          params: {
            limit: 100,
          },
        }
      )
    );
    const contactIds = response.data.results.map((result: any) => result.id);

    if (contactIds.length === 0) {
      return [];
    }

    const contactsResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/contacts/batch/read", {
        properties: ["firstname", "lastname", "email", "phone", "jobtitle"],
        inputs: contactIds.map((id) => ({ id })),
      })
    );

    return contactsResponse.data.results;
  } catch (error) {
    console.error(
      `Error fetching associated contacts for company ${companyId}:`,
      error
    );
    return [];
  }
}

async function getAssociatedDeals(companyId: string): Promise<Deal[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/deals`,
        {
          params: {
            limit: 100,
          },
        }
      )
    );
    const dealIds = response.data.results.map((result: any) => result.id);

    if (dealIds.length === 0) {
      return [];
    }

    const dealsResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/deals/batch/read", {
        properties: ["dealname", "dealstage", "amount", "closedate"],
        inputs: dealIds.map((id) => ({ id })),
      })
    );

    return dealsResponse.data.results;
  } catch (error) {
    console.error(
      `Error fetching associated deals for company ${companyId}:`,
      error
    );
    return [];
  }
}

async function getAssociatedTickets(companyId: string): Promise<Ticket[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/tickets`,
        {
          params: { limit: 100 },
        }
      )
    );
    const ticketIds = response.data.results.map((result: any) => result.id);

    if (ticketIds.length === 0) return [];

    const ticketsResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/tickets/batch/read", {
        properties: [
          "subject",
          "content",
          "hs_pipeline_stage",
          "hs_ticket_priority",
          "createdate",
        ],
        inputs: ticketIds.map((id) => ({ id })),
      })
    );

    return ticketsResponse.data.results;
  } catch (error) {
    console.error(
      `Error fetching associated tickets for company ${companyId}:`,
      error
    );
    return [];
  }
}

async function getAssociatedOrders(companyId: string): Promise<Order[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/line_items`,
        {
          params: { limit: 100 },
        }
      )
    );
    const orderIds = response.data.results.map((result: any) => result.id);

    if (orderIds.length === 0) return [];

    const ordersResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/line_items/batch/read", {
        properties: ["name", "quantity", "price", "amount", "createdate"],
        inputs: orderIds.map((id) => ({ id })),
      })
    );

    return ordersResponse.data.results;
  } catch (error) {
    console.error(
      `Error fetching associated orders for company ${companyId}:`,
      error
    );
    return [];
  }
}

async function getNotes(companyId: string): Promise<Note[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/notes`,
        {
          params: { limit: 100 },
        }
      )
    );
    const noteIds = response.data.results.map((result: any) => result.id);

    if (noteIds.length === 0) return [];

    const notesResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/notes/batch/read", {
        properties: ["hs_note_body", "hs_createdate"],
        inputs: noteIds.map((id) => ({ id })),
      })
    );

    return notesResponse.data.results;
  } catch (error) {
    console.error(`Error fetching notes for company ${companyId}:`, error);
    return [];
  }
}

function createContactSection(contact: Contact, documentId: string): Section {
  const props = contact.properties || {};
  const contactName = [props.firstname, props.lastname]
    .filter(Boolean)
    .join(" ");
  const contactDetails = [
    props.jobtitle && `Title: ${props.jobtitle}`,
    props.email && `Email: ${props.email}`,
    props.phone && `Phone: ${props.phone}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prefix: `${documentId}-contact-${contact.id}`,
    content: `${contactName}\n${contactDetails}`,
    sections: [],
  };
}

async function createDealSection(
  deal: Deal,
  documentId: string,
  hubspotClient: HubspotClient
): Promise<Section> {
  const props = deal.properties || {};

  // Get all activities
  const activities = await hubspotClient.getDealActivities(deal.id);

  // Format all properties
  const propertyEntries = Object.entries(props)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const dealDetails = [
    "Deal Details:",
    propertyEntries,
    activities.results.length > 0 ? "Activities:" : null,
    ...activities.results.map((activity) => `Meeting: ${activity.id}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prefix: `${documentId}-deal-${deal.id}`,
    content: dealDetails,
    sections: [],
  };
}

function createTicketSection(ticket: Ticket, documentId: string): Section {
  return {
    prefix: `${documentId}-ticket-${ticket.id}`,
    content: [
      ticket.properties.subject || "Untitled",
      `Stage: ${ticket.properties.hs_pipeline_stage || "Unknown stage"}`,
      `Priority: ${ticket.properties.hs_ticket_priority || "Unknown"}`,
      `Created: ${ticket.properties.createdate || "Unknown"}`,
    ].join("\n"),
    sections: [],
  };
}

function createOrderSection(order: Order, documentId: string): Section {
  return {
    prefix: `${documentId}-order-${order.id}`,
    content: [
      order.properties.name || "Untitled",
      `Quantity: ${order.properties.quantity || "0"}`,
      `Price: ${order.properties.price || "0"}`,
      `Total: ${order.properties.amount || "0"}`,
      `Date: ${order.properties.createdate || "Unknown"}`,
    ].join("\n"),
    sections: [],
  };
}

function createNoteSection(note: Note, documentId: string): Section {
  const props = note.properties || {};
  const formattedDate = props.hs_createdate
    ? formatDate(props.hs_createdate)
    : "Unknown date";
  const cleanedNoteBody = stripHtmlTags(props.hs_note_body || "Empty note");
  return {
    prefix: `${documentId}-note-${note.id}`,
    content: `${formattedDate}: ${cleanedNoteBody}`,
    sections: [],
  };
}

async function createCompanySection(
  documentId: string,
  company: Company,
  contacts: Contact[],
  deals: Deal[],
  tickets: Ticket[],
  orders: Order[],
  notes: Note[],
  hubspotClient: HubspotClient
): Promise<Section> {
  const props = company.properties || {};
  const companyDetails = [
    `Company Name: ${
      typeof props.name === "string" ? props.name : "Unknown Company"
    }`,
    props.industry && `Industry: ${props.industry}`,
    props.annualrevenue && `Annual Revenue: ${props.annualrevenue}`,
    props.numberofemployees &&
      `Company Size: ${props.numberofemployees} employees`,
    props.phone && `Phone: ${props.phone}`,
    props.website && `Website: ${props.website}`,
    props.description && `Description: ${props.description}`,
    props.lifecyclestage && `Lifecycle Stage: ${props.lifecyclestage}`,
    props.hubspot_owner_id && `Owner: ${props.hubspot_owner_id}`,
    props.hs_lead_status && `Lead Status: ${props.hs_lead_status}`,
    props.type && `Type: ${props.type}`,
    props.address &&
      `Address: ${props.address}, ${props.city || ""}, ${props.state || ""}, ${
        props.country || ""
      }, ${props.zip || ""}`,
    props.facebook_company_page && `Facebook: ${props.facebook_company_page}`,
    props.linkedin_company_page && `LinkedIn: ${props.linkedin_company_page}`,
    props.twitterhandle && `Twitter: ${props.twitterhandle}`,
    props.hs_analytics_source && `Source: ${props.hs_analytics_source}`,
    props.hs_pipeline && `Pipeline: ${props.hs_pipeline}`,
  ]
    .filter((line) => typeof line === "string")
    .join("\n");

  const sections: Section[] = [
    {
      prefix: `${documentId}-details`,
      content: companyDetails,
      sections: [],
    },
  ];

  if (contacts.length > 0) {
    sections.push({
      prefix: `${documentId}-contacts`,
      content: "Key Contacts:",
      sections: contacts.map((contact) =>
        createContactSection(contact, documentId)
      ),
    });
  }

  if (deals.length > 0) {
    sections.push({
      prefix: `${documentId}-deals`,
      content: "Deals:",
      sections: await Promise.all(
        deals.map((deal) => createDealSection(deal, documentId, hubspotClient))
      ),
    });
  }

  if (tickets.length > 0) {
    sections.push({
      prefix: `${documentId}-tickets`,
      content: "Tickets:",
      sections: tickets.map((ticket) =>
        createTicketSection(ticket, documentId)
      ),
    });
  }

  if (orders.length > 0) {
    sections.push({
      prefix: `${documentId}-orders`,
      content: "Orders:",
      sections: orders.map((order) => createOrderSection(order, documentId)),
    });
  }

  if (notes.length > 0) {
    sections.push({
      prefix: `${documentId}-notes`,
      content: "Notes:",
      sections: notes.map((note) => createNoteSection(note, documentId)),
    });
  }

  return {
    prefix: documentId,
    content: `Company Summary for ${
      typeof props.name === "string" ? props.name : "Unknown Company"
    }`,
    sections,
  };
}

function createCompanyTags(
  company: Company,
  contacts: Contact[],
  deals: Deal[]
): string[] {
  const props = company.properties || {};

  const baseTags = ["hubspot"];

  const companyTags = [
    props.name && `company:${props.name}`,
    props.industry && `industry:${props.industry}`,
    props.lifecyclestage && `stage:${props.lifecyclestage}`,
    props.hs_lead_status && `lead_status:${props.hs_lead_status}`,
    props.type && `type:${props.type}`,
    props.hs_pipeline && `pipeline:${props.hs_pipeline}`,
    props.hs_analytics_source && `source:${props.hs_analytics_source}`,
  ].filter((tag): tag is string => Boolean(tag));

  const contactRoleTags = contacts
    .map((contact) => contact.properties?.jobtitle)
    .filter((title): title is string => Boolean(title))
    .map((title) => `role:${title}`);

  const dealStageTags = deals
    .map((deal) => deal.properties?.dealstage)
    .filter((stage): stage is string => Boolean(stage))
    .map((stage) => `deal_stage:${stage}`);

  return [...baseTags, ...companyTags, ...contactRoleTags, ...dealStageTags];
}

async function upsertToDustDatasource(
  company: Company,
  contacts: Contact[],
  deals: Deal[],
  tickets: Ticket[],
  orders: Order[],
  notes: Note[],
  hubspotClient: HubspotClient
) {
  const documentId = `company-${company.id}`;
  const props = company.properties || {};

  const section = await createCompanySection(
    documentId,
    company,
    contacts,
    deals,
    tickets,
    orders,
    notes,
    hubspotClient
  );

  try {
    await dustLimiter.schedule(() =>
      dustApi.post(
        `/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
        {
          source_url: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/company/${company.id}`,
          section,
          tags: createCompanyTags(company, contacts, deals),
          title: `${props.name || company.id}`,
          mimeType: "text/plain",
        }
      )
    );
    console.log(`Upserted company ${company.id} to Dust datasource`);
  } catch (error) {
    console.error(
      `Error upserting company ${company.id} to Dust datasource:`,
      error
    );
  }
}

if (isMainThread) {
  async function main() {
    try {
      const companyIds = await getRecentlyUpdatedCompanyIds();
      console.log(
        `Found ${companyIds.length} companies with updates in the last ${UPDATED_SINCE_DAYS} day(s).`
      );

      const batchSize = Math.ceil(companyIds.length / THREADS_NUMBER);
      const batches = Array.from({ length: THREADS_NUMBER }, (_, i) =>
        companyIds.slice(i * batchSize, (i + 1) * batchSize)
      );

      const workers = batches.map(
        (batch, index) =>
          new Worker(new URL(import.meta.url), { workerData: { batch, index } })
      );

      let processedCompanies = 0;
      await Promise.all(
        workers.map(
          (worker) =>
            new Promise<void>((resolve, reject) => {
              worker.on("message", (message: WorkerMessage) => {
                if (message.type === "log") {
                  console.log(
                    `Worker ${message.data.index}:`,
                    message.data.message
                  );
                } else if (message.type === "error") {
                  console.error(
                    `Worker ${message.data.index} error:`,
                    message.data.error
                  );
                } else if (message.type === "result") {
                  processedCompanies += message.data;
                }
              });
              worker.on("error", reject);
              worker.on("exit", (code) => {
                if (code !== 0) {
                  reject(new Error(`Worker stopped with exit code ${code}`));
                } else {
                  resolve();
                }
              });
            })
        )
      );

      console.log(
        `Processed ${processedCompanies} out of ${companyIds.length} companies`
      );
      console.log("Finished processing companies");
    } catch (error) {
      console.error("An error occurred:", error);
    }
  }

  main();
} else {
  (async () => {
    try {
      const { batch, index } = workerData as { batch: string[]; index: number };
      parentPort?.postMessage({
        type: "log",
        data: {
          index,
          message: `Starting to process ${batch.length} companies`,
        },
      });

      const hubspotClient = new HubspotClient(hubspotApi);

      let processedCount = 0;
      for (const companyId of batch) {
        const company = await getCompanyDetails(companyId);
        if (company) {
          const contacts = await getAssociatedContacts(companyId);
          const deals = await getAssociatedDeals(companyId);
          const tickets = await getAssociatedTickets(companyId);
          const orders = await getAssociatedOrders(companyId);
          const notes = await getNotes(companyId);
          await upsertToDustDatasource(
            company,
            contacts,
            deals,
            tickets,
            orders,
            notes,
            hubspotClient
          );
          processedCount++;
        }
      }

      parentPort?.postMessage({ type: "result", data: processedCount });
      parentPort?.postMessage({
        type: "log",
        data: {
          index,
          message: `Finished processing ${processedCount} companies`,
        },
      });
    } catch (error) {
      parentPort?.postMessage({
        type: "error",
        data: { index: workerData.index, error },
      });
    }
  })();
}
