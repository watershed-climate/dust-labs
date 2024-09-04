import axios from 'axios';
import * as dotenv from 'dotenv';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

const UPDATED_SINCE_DAYS = 1; // Number of days to look back for updates
const UPDATED_SINCE = new Date(Date.now() - UPDATED_SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString();
const THREADS_NUMBER = 3;

if (!HUBSPOT_ACCESS_TOKEN || !HUBSPOT_PORTAL_ID || !DUST_API_KEY || !DUST_WORKSPACE_ID || !DUST_DATASOURCE_ID) {
  throw new Error('Please provide values for HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID, DUST_API_KEY, DUST_WORKSPACE_ID, and DUST_DATASOURCE_ID in .env file.');
}

const hubspotApi = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: {
    'Authorization': `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

const dustApi = axios.create({
  baseURL: 'https://dust.tt/api/v1',
  headers: {
    'Authorization': `Bearer ${DUST_API_KEY}`,
    'Content-Type': 'application/json'
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
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

interface WorkerMessage {
  type: 'log' | 'error' | 'result';
  data: any;
}

async function getRecentlyUpdatedCompanyIds(): Promise<string[]> {
  try {
    const response = await hubspotApi.post('/crm/v3/objects/companies/search', {
      filterGroups: [{
        filters: [{
          propertyName: 'hs_lastmodifieddate',
          operator: 'GTE',
          value: UPDATED_SINCE
        }]
      }],
      properties: ['hs_object_id'],
      limit: 100
    });
    return response.data.results.map((company: Company) => company.id);
  } catch (error) {
    console.error('Error fetching recently updated company IDs:', error);
    return [];
  }
}

async function getCompanyDetails(companyId: string): Promise<Company | null> {
  try {
    const response = await hubspotApi.get(`/crm/v3/objects/companies/${companyId}`, {
      params: {
        properties: ['name', 'industry', 'annualrevenue', 'numberofemployees', 'phone', 'website', 'description', 'hs_lead_status', 'createdate', 'hs_lastmodifieddate']
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching details for company ${companyId}:`, error);
    return null;
  }
}

async function getAssociatedContacts(companyId: string): Promise<Contact[]> {
  try {
    const response = await hubspotApi.get(`/crm/v3/objects/companies/${companyId}/associations/contacts`, {
      params: {
        limit: 100
      }
    });
    const contactIds = response.data.results.map((result: any) => result.id);
    
    if (contactIds.length === 0) {
      return [];
    }

    const contactsResponse = await hubspotApi.post('/crm/v3/objects/contacts/batch/read', {
      properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle'],
      inputs: contactIds.map(id => ({ id }))
    });

    return contactsResponse.data.results;
  } catch (error) {
    console.error(`Error fetching associated contacts for company ${companyId}:`, error);
    return [];
  }
}

async function getAssociatedDeals(companyId: string): Promise<Deal[]> {
  try {
    const response = await hubspotApi.get(`/crm/v3/objects/companies/${companyId}/associations/deals`, {
      params: {
        limit: 100
      }
    });
    const dealIds = response.data.results.map((result: any) => result.id);
    
    if (dealIds.length === 0) {
      return [];
    }

    const dealsResponse = await hubspotApi.post('/crm/v3/objects/deals/batch/read', {
      properties: ['dealname', 'dealstage', 'amount', 'closedate'],
      inputs: dealIds.map(id => ({ id }))
    });

    return dealsResponse.data.results;
  } catch (error) {
    console.error(`Error fetching associated deals for company ${companyId}:`, error);
    return [];
  }
}

async function upsertToDustDatasource(company: Company, contacts: Contact[], deals: Deal[]) {
  const documentId = `company-${company.id}`;
  const props = company.properties || {};

  const companyDetails = [
    `Company Name: ${props.name || 'Unknown Company'}`,
    props.industry && `Industry: ${props.industry}`,
    props.annualrevenue && `Annual Revenue: ${props.annualrevenue}`,
    props.numberofemployees && `Number of Employees: ${props.numberofemployees}`,
    props.phone && `Phone: ${props.phone}`,
    props.website && `Website: ${props.website}`,
  ].filter(Boolean).join('\n');

  const contactsInfo = contacts
    .map(contact => {
      const cProps = contact.properties || {};
      const contactDetails = [
        [cProps.firstname, cProps.lastname].filter(Boolean).join(' '),
        cProps.jobtitle && `Title: ${cProps.jobtitle}`,
        cProps.email && `Email: ${cProps.email}`,
        cProps.phone && `Phone: ${cProps.phone}`,
      ].filter(Boolean);
      
      return contactDetails.length > 0 ? `- ${contactDetails.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const companyStatus = [
    props.hs_lead_status && `Lead Status: ${props.hs_lead_status}`,
    props.createdate && `Created Date: ${props.createdate}`,
    props.hs_lastmodifieddate && `Last Modified Date: ${props.hs_lastmodifieddate}`,
  ].filter(Boolean).join('\n');

  const dealsInfo = deals
    .map(deal => {
      const dProps = deal.properties || {};
      const dealDetails = [
        dProps.dealname && `${dProps.dealname}`,
        dProps.dealstage && `Stage: ${dProps.dealstage}`,
        dProps.amount && `Amount: ${dProps.amount}`,
        dProps.closedate && `Close Date: ${dProps.closedate}`,
      ].filter(Boolean);
      
      return dealDetails.length > 0 ? `- ${dealDetails.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const content = `
Company Summary for ${props.name || 'Unknown Company'}

Basic Company Details:
${companyDetails}

${contactsInfo ? `Key Contacts:\n${contactsInfo}` : ''}

${companyStatus ? `Company Status:\n${companyStatus}` : ''}

${dealsInfo ? `Deals:\n${dealsInfo}` : ''}

${props.description ? `Additional Information:\n${props.description}` : ''}
  `.trim();

  try {
    await dustApi.post(`/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`, {
      source_url: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/company/${company.id}`,
      text: content
    });
    console.log(`Upserted company ${company.id} to Dust datasource`);
  } catch (error) {
    console.error(`Error upserting company ${company.id} to Dust datasource:`, error);
  }
}

if (isMainThread) {
  async function main() {
    try {
      const companyIds = await getRecentlyUpdatedCompanyIds();
      console.log(`Found ${companyIds.length} companies with updates in the last ${UPDATED_SINCE_DAYS} day(s).`);

      const batchSize = Math.ceil(companyIds.length / THREADS_NUMBER);
      const batches = Array.from({ length: THREADS_NUMBER }, (_, i) =>
        companyIds.slice(i * batchSize, (i + 1) * batchSize)
      );

      const workers = batches.map((batch, index) =>
        new Worker(new URL(import.meta.url), { workerData: { batch, index } })
      );

      let processedCompanies = 0;
      await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => {
        worker.on('message', (message: WorkerMessage) => {
          if (message.type === 'log') {
            console.log(`Worker ${message.data.index}:`, message.data.message);
          } else if (message.type === 'error') {
            console.error(`Worker ${message.data.index} error:`, message.data.error);
          } else if (message.type === 'result') {
            processedCompanies += message.data;
          }
        });
        worker.on('error', reject);
        worker.on('exit', code => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          } else {
            resolve();
          }
        });
      })));

      console.log(`Processed ${processedCompanies} out of ${companyIds.length} companies`);
      console.log('Finished processing companies');
    } catch (error) {
      console.error('An error occurred:', error);
    }
  }

  main();
} else {
  (async () => {
    try {
      const { batch, index } = workerData as { batch: string[], index: number };
      parentPort?.postMessage({ type: 'log', data: { index, message: `Starting to process ${batch.length} companies` } });

      let processedCount = 0;
      for (const companyId of batch) {
        const company = await getCompanyDetails(companyId);
        if (company) {
          const contacts = await getAssociatedContacts(companyId);
          const deals = await getAssociatedDeals(companyId);
          await upsertToDustDatasource(company, contacts, deals);
          processedCount++;
        }
      }

      parentPort?.postMessage({ type: 'result', data: processedCount });
      parentPort?.postMessage({ type: 'log', data: { index, message: `Finished processing ${processedCount} companies` } });
    } catch (error) {
      parentPort?.postMessage({ type: 'error', data: { index: workerData.index, error } });
    }
  })();
}
