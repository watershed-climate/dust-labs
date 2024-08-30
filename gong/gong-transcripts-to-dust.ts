import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import pLimit from 'p-limit';

dotenv.config();

const GONG_BASE_URL = process.env.GONG_BASE_URL;
const GONG_ACCESS_KEY = process.env.GONG_ACCESS_KEY;
const GONG_ACCESS_KEY_SECRET = process.env.GONG_ACCESS_KEY_SECRET;
const GONG_BASIC_AUTH_TOKEN = Buffer.from(`${GONG_ACCESS_KEY}:${GONG_ACCESS_KEY_SECRET}`).toString('base64');

const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

if(!GONG_BASE_URL || !GONG_ACCESS_KEY || !GONG_ACCESS_KEY_SECRET || !DUST_API_KEY || !DUST_WORKSPACE_ID || !DUST_DATASOURCE_ID) {
  throw new Error('Please provide values for GONG_BASE_URL, GONG_ACCESS_KEY, GONG_ACCESS_KEY_SECRET, DUST_API_KEY, DUST_WORKSPACE_ID, and DUST_DATASOURCE_ID in .env file.');
}

// Number of parallel threads
const THREADS_NUMBER = 3;

// Can be `null` if you want to fetch all transcripts
const TRANSCRIPTS_SINCE = "2024-01-01"

const gongApi = axios.create({
  baseURL: GONG_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${GONG_BASIC_AUTH_TOKEN}`
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
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

interface GongTranscriptResponse {
  requestId: string;
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  callTranscripts: GongTranscript[];
}

interface GongTranscript {
  callId: string;
  transcript: {
    speakerId: string;
    sentences: {
      text: string;
    }[];
  }[];
}

interface GongExtensiveCallData {
  metaData?: {
    id: string;
    title?: string;
    scheduled?: string;
    started?: string;
    duration?: number;
    primaryUserId?: string;
    direction?: string;
    system?: string;
    scope?: string;
    media?: string;
    language?: string;
  };
  parties?: {
    id: string;
    emailAddress?: string;
    name?: string;
    title?: string;
    speakerId?: string;
    affiliation?: string;
  }[];
}

async function getGongTranscripts(): Promise<GongTranscript[]> {
  let allTranscripts: GongTranscript[] = [];
  let cursor: string | undefined;

  do {
    try {
      const response: AxiosResponse<GongTranscriptResponse> = await gongApi.post('/v2/calls/transcript', {
        cursor,
        filter: {
          fromDateTime: TRANSCRIPTS_SINCE ? `${TRANSCRIPTS_SINCE}T00:00:00Z` : undefined,
        }
      });

      allTranscripts = allTranscripts.concat(response.data.callTranscripts);
      console.log(`Retrieved ${response.data.callTranscripts.length} transcripts. Total: ${allTranscripts.length}`);

      cursor = response.data.records.cursor;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        console.error('Rate limit exceeded. Waiting before retrying...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        throw error;
      }
    }
  } while (cursor);

  return allTranscripts;
}

async function getExtensiveCallData(callId: string): Promise<GongExtensiveCallData | null> {
  try {
    const response: AxiosResponse<{ calls: GongExtensiveCallData[] }> = await gongApi.post('/v2/calls/extensive', {
      filter: { callIds: [callId] },
      contentSelector: {
        exposedFields: {
          metaData: true,
          parties: true
        }
      }
    });
    return response.data.calls[0] || null;
  } catch (error) {
    console.error(`Error fetching extensive data for call ${callId}:`, error);
    return null;
  }
}

async function upsertToDustDatasource(transcript: GongTranscript, extensiveData: GongExtensiveCallData | null) {
  const documentId = `gong-transcript-${transcript.callId}`;
  const speakerMap = new Map(extensiveData?.parties?.map(party => [party.speakerId, party.name]) || []);

  let content = `Call ID: ${transcript.callId}\n`;

  if (extensiveData?.metaData) {
    const { title, scheduled, started, duration, direction, system, scope, media, language } = extensiveData.metaData;
    if (title) content += `Title: ${title}\n`;
    if (scheduled) content += `Scheduled: ${scheduled}\n`;
    if (started) content += `Started: ${started}\n`;
    if (duration) content += `Duration: ${duration} seconds\n`;
    if (direction) content += `Direction: ${direction}\n`;
    if (system) content += `System: ${system}\n`;
    if (scope) content += `Scope: ${scope}\n`;
    if (media) content += `Media: ${media}\n`;
    if (language) content += `Language: ${language}\n`;
  }

  if (extensiveData?.parties && extensiveData.parties.length > 0) {
    content += '\nParticipants:\n';
    extensiveData.parties.forEach(party => {
      let participantInfo = `- ${party.name || 'Unknown'}`;
      if (party.emailAddress) participantInfo += ` (${party.emailAddress})`;
      if (party.title) participantInfo += `, Title: ${party.title}`;
      if (party.affiliation) participantInfo += `, Affiliation: ${party.affiliation}`;
      content += participantInfo + '\n';
    });
  }

  content += '\nTranscript:\n';
  transcript.transcript.forEach(monologue => {
    content += `\n${speakerMap.get(monologue.speakerId) || monologue.speakerId}: `;
    content += monologue.sentences.map(sentence => sentence.text).join(' ') + '\n';
  });

  try {
    await dustApi.post(`/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`, {
      text: content.trim()
    });
    console.log(`Upserted transcript ${transcript.callId} to Dust datasource`);
  } catch (error) {
    console.error(`Error upserting transcript ${transcript.callId} to Dust datasource:`, error);
  }
}

async function main() {
  try {
    const transcripts = await getGongTranscripts();
    console.log(`Found ${transcripts.length} transcripts.`);

    const limit = pLimit(THREADS_NUMBER);
    const tasks: Promise<void>[] = [];

    for (const transcript of transcripts) {
      tasks.push(limit(async () => {
        const extensiveData = await getExtensiveCallData(transcript.callId);
        await upsertToDustDatasource(transcript, extensiveData);
      }));
    }

    await Promise.all(tasks);
    console.log('All transcripts processed successfully.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
