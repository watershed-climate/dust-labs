import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import pLimit from 'p-limit';

dotenv.config();

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

if(!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN || !DUST_API_KEY || !DUST_WORKSPACE_ID || !DUST_DATASOURCE_ID) {
  throw new Error('Please provide values for ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN, DUST_API_KEY, DUST_WORKSPACE_ID, and DUST_DATASOURCE_ID in .env file.');
}

// Number of parallel threads
const THREADS_NUMBER = 5;

// 24 hours ago in seconds
const TICKETS_UPDATED_SINCE = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

const zendeskApi = axios.create({
  baseURL: `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`,
  auth: {
    username: `${ZENDESK_EMAIL}/token`,
    password: ZENDESK_API_TOKEN as string
  },
  headers: {
    'Content-Type': 'application/json'
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
});

zendeskApi.interceptors.response.use(
  (response) => {
    const rateLimit = response.headers['x-rate-limit'];
    const rateLimitRemaining = response.headers['x-rate-limit-remaining'];
    console.log(`Endpoint: ${response.config.url}, Rate Limit: ${rateLimit}, Remaining: ${rateLimitRemaining}`);
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 429) {
      console.error(`Endpoint: ${error.config.url}, Rate limit exceeded. Please wait before making more requests.`);
      console.log(`Rate Limit: ${error.response.headers['x-rate-limit']}, Remaining: ${error.response.headers['x-rate-limit-remaining']}`);
    }
    return Promise.reject(error);
  }
);

const dustApi = axios.create({
  baseURL: 'https://dust.tt/api/v1',
  headers: {
    'Authorization': `Bearer ${DUST_API_KEY}`,
    'Content-Type': 'application/json'
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
});

interface Ticket {
  id: number;
  subject: string;
  created_at: string;
  updated_at: string;
  status: string;
  assignee_id: number | null;
  custom_status_id?: number | null;
  comment_count: number;
}

interface Comment {
  id: number;
  type: string;
  author_id: number;
  body: string;
  html_body: string;
  plain_body: string;
  public: boolean;
  created_at: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

interface ZendeskIncrementalResponse {
  tickets: Ticket[];
  next_page?: string;
  end_time: number;
  after_cursor?: string;
  before_cursor?: string;
}

async function getTicketsUpdatedLast24Hours(): Promise<number[]> {
  let allTicketIds: number[] = [];
  let nextPage: string | null = null;
  let currentPage = 1;
  let totalCount = 0;

  do {
    try {
      const response: AxiosResponse<ZendeskIncrementalResponse> = await zendeskApi.get('/incremental/tickets.json', {
        params: {
          start_time: TICKETS_UPDATED_SINCE,
          include: 'comment_count',
          ...(nextPage ? { cursor: nextPage } : {})
        }
      });

      const newTickets = response.data.tickets.map((ticket: Ticket) => ticket.id);
      allTicketIds = allTicketIds.concat(newTickets);
      totalCount += newTickets.length;
      nextPage = response.data.after_cursor || null;

      console.log(`Page ${currentPage}: Retrieved ${newTickets.length} tickets`);
      console.log(`Total count: ${totalCount}, Current total: ${allTicketIds.length}, Next cursor: ${nextPage || 'None'}`);

      currentPage++;

      if (newTickets.length === 0) {
        break; // Exit the loop if no new tickets are returned
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        console.error('Rate limit exceeded. Waiting before retrying...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        throw error;
      }
    }
  } while (nextPage);

  console.log(`Final total: ${allTicketIds.length} tickets retrieved`);
  return allTicketIds;
}

async function getTicketsBatch(ids: number[]): Promise<Ticket[]> {
  try {
    const response: AxiosResponse<{ tickets: Ticket[] }> = await zendeskApi.get('/tickets/show_many.json', {
      params: {
        ids: ids.join(',')
      }
    });
    return response.data.tickets;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.error('Rate limit exceeded. Please try again later.');
      return [];
    }
    throw error;
  }
}

async function getTicketComments(ticketId: number): Promise<Comment[]> {
  try {
    const response: AxiosResponse<{ comments: Comment[] }> = await zendeskApi.get(`/tickets/${ticketId}/comments.json`);
    return response.data.comments;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.error('Rate limit exceeded. Please try again later.');
      return [];
    }
    throw error;
  }
}

async function getUser(userId: number): Promise<User | null> {
  try {
    const response: AxiosResponse<{ user: User }> = await zendeskApi.get(`/users/${userId}.json`);
    return response.data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.error('Rate limit exceeded. Please try again later.');
      return null;
    }
    throw error;
  }
}

async function getCustomStatus(statusId: number): Promise<string> {
  try {
    const response: AxiosResponse<{ custom_status: { agent_label: string } }> = await zendeskApi.get(`/custom_statuses/${statusId}.json`);
    return response.data.custom_status.agent_label;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.error('Rate limit exceeded. Please try again later.');
      return 'Unknown';
    }
    console.error(`Error fetching custom status ${statusId}:`, error);
    return 'Unknown';
  }
}

async function upsertToDustDatasource(ticket: Ticket, comments: Comment[], users: Map<number, User>, assignee: User | null, customStatus: string | null) {
  const documentId = `ticket-${ticket.id}`;
  const content = `
Ticket ID: ${ticket.id}
Subject: ${ticket.subject}
Created At: ${ticket.created_at}
Updated At: ${ticket.updated_at}
Status: ${customStatus || ticket.status}
Assignee: ${assignee ? `${assignee.name} (${assignee.email})` : 'Unassigned'}
Comments:
${comments.map(comment => {
    const author = users.get(comment.author_id);
    return `
[${comment.created_at}] Author: ${author ? author.name : 'Unknown'} (${author ? author.email : 'Unknown'})
${comment.body}
`;
  }).join('\n')}
  `.trim();

  try {
    await dustApi.post(`/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`, {
      text: content
    });
    console.log(`Upserted ticket ${ticket.id} to Dust datasource`);
  } catch (error) {
    console.error(`Error upserting ticket ${ticket.id} to Dust datasource:`, error);
  }
}

async function main() {
  try {
    const recentTicketIds = await getTicketsUpdatedLast24Hours();
    console.log(`Found ${recentTicketIds.length} tickets updated in the last 24 hours.`);

    const limit = pLimit(THREADS_NUMBER);
    const tasks: Promise<void>[] = [];

    for (let i = 0; i < recentTicketIds.length; i += 100) {
      const batchIds = recentTicketIds.slice(i, i + 100);
      tasks.push(limit(async () => {
        const tickets = await getTicketsBatch(batchIds);
        
        for (const ticket of tickets) {
          const comments = await getTicketComments(ticket.id);
          
          const uniqueAuthorIds = new Set(comments.map(comment => comment.author_id));
          if (ticket.assignee_id !== null) {
            uniqueAuthorIds.add(ticket.assignee_id);
          }
          const users = new Map<number, User>();
          for (const authorId of uniqueAuthorIds) {
            const user = await getUser(authorId);
            if (user) {
              users.set(authorId, user);
            }
          }
          const assignee = ticket.assignee_id !== null ? users.get(ticket.assignee_id) || null : null;
          
          let customStatus: string | null = null;
          if (ticket.custom_status_id !== undefined && ticket.custom_status_id !== null) {
            customStatus = await getCustomStatus(ticket.custom_status_id);
          }
          await upsertToDustDatasource(ticket, comments, users, assignee, customStatus);
        }
      }));
    }

    await Promise.all(tasks);
    console.log('All tickets processed successfully.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
