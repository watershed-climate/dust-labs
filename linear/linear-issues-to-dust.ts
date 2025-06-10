import axios from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";
import * as fs from "fs";
import * as path from "path";
import { 
  LinearClient, 
  Issue, 
  Comment, 
  Attachment, 
  IssueLabel, 
  WorkflowState,
  User,
  IssueHistory,
  IssueRelation,
  LinearFetch,
} from "@linear/sdk";

dotenv.config();

// Constants
const LINEAR_MAX_BATCH_SIZE = 50;
const LINEAR_RATE_LIMIT_PER_HOUR = 1500;

// Checkpoint file configuration
const CHECKPOINT_FILE = process.env.CHECKPOINT_FILE || 'linear-sync-checkpoint.json';
const ENABLE_CHECKPOINTING = process.env.ENABLE_CHECKPOINTING !== 'false'; // Default to enabled

// Logging configuration
const LOG_TO_FILE = process.env.LOG_TO_FILE !== 'false'; // Default to enabled
const LOG_FILE = process.env.LOG_FILE || `linear-sync-${new Date().toISOString().split('T')[0]}-${Date.now()}.log`;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // info, debug, error

// Simple but effective logging system that captures ALL console output
let logStream: fs.WriteStream | null = null;

if (LOG_TO_FILE) {
  try {
    // Ensure log directory exists
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    logStream.write(`\n${'='.repeat(80)}\n`);
    logStream.write(`[${new Date().toISOString()}] Linear to Dust Sync - Started\n`);
    logStream.write(`${'='.repeat(80)}\n`);
    
    // Intercept ALL console output
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      const timestamp = new Date().toISOString();
      originalLog(...args);
      if (logStream) {
        logStream.write(`[${timestamp}] ${message}\n`);
      }
    };
    
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      const timestamp = new Date().toISOString();
      originalError(...args);
      if (logStream) {
        logStream.write(`[${timestamp}] ERROR: ${message}\n`);
      }
    };
    
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      const timestamp = new Date().toISOString();
      originalWarn(...args);
      if (logStream) {
        logStream.write(`[${timestamp}] WARN: ${message}\n`);
      }
    };
    
    console.log(`🔧 File logging enabled: ${LOG_FILE}`);
    
  } catch (error) {
    console.error('Failed to initialize log file:', error);
    logStream = null;
  }
} else {
  console.log(`🔧 File logging disabled`);
}

// Function to close log file
function closeLogFile() {
  if (logStream) {
    logStream.write(`[${new Date().toISOString()}] ${'='.repeat(80)}\n`);
    logStream.write(`[${new Date().toISOString()}] Linear to Dust Sync - Ended\n`);
    logStream.write(`[${new Date().toISOString()}] ${'='.repeat(80)}\n\n`);
    logStream.end();
  }
}

// Linear API credentials and query parameters
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_UPDATED_SINCE = process.env.LINEAR_UPDATED_SINCE;
const LINEAR_TEAM_KEY = process.env.LINEAR_TEAM_KEY;
const LINEAR_PROJECT_ID = process.env.LINEAR_PROJECT_ID;
const LINEAR_STATE = process.env.LINEAR_STATE;
const LINEAR_LABEL = process.env.LINEAR_LABEL;

// Optional data fetching configuration
const FETCH_CONFIG = {
  comments: process.env.FETCH_COMMENTS === 'true',
  attachments: process.env.FETCH_ATTACHMENTS == 'true',
  labels: process.env.FETCH_LABELS == 'true',
  relations: process.env.FETCH_RELATIONS == 'true',
  history: process.env.FETCH_HISTORY == 'true',
  subscribers: process.env.FETCH_SUBSCRIBERS == 'true',
  hierarchy: process.env.FETCH_HIERARCHY == 'true', // parent and children
  cycle: process.env.FETCH_CYCLE == 'true',
  organization: process.env.FETCH_ORGANIZATION == 'true',
};

// Dust API credentials
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

// Validate required environment variables
const requiredEnvVars = [
  'LINEAR_API_KEY',
  'DUST_API_KEY',
  'DUST_WORKSPACE_ID',
  'DUST_DATASOURCE_ID',
  'DUST_RATE_LIMIT',
  'LINEAR_MAX_CONCURRENT'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Please provide values for the following environment variables: ${missingEnvVars.join(', ')}`
  );
}

// Rate limiting configuration
const DUST_RATE_LIMIT = parseInt(process.env.DUST_RATE_LIMIT as string);
const LINEAR_MAX_CONCURRENT = parseInt(process.env.LINEAR_MAX_CONCURRENT as string);

// API timeout configuration
const LINEAR_API_TIMEOUT = parseInt(process.env.LINEAR_API_TIMEOUT || '30000'); // Default 30 seconds
const LINEAR_API_RETRY_ATTEMPTS = parseInt(process.env.LINEAR_API_RETRY_ATTEMPTS || '3'); // Default 3 retries

// Global caches to reduce redundant API calls
const CACHE = {
  organization: null as any,
  users: new Map<string, any>(),
  teams: new Map<string, any>(),
  projects: new Map<string, any>(),
  states: new Map<string, any>()
};

console.log(`🔧 Configuration loaded:`);
console.log(`   - Linear rate limit: ${LINEAR_RATE_LIMIT_PER_HOUR}/hour`);
console.log(`   - Linear max concurrent: ${LINEAR_MAX_CONCURRENT}`);
console.log(`   - Linear API timeout: ${LINEAR_API_TIMEOUT}ms`);
console.log(`   - Linear retry attempts: ${LINEAR_API_RETRY_ATTEMPTS}`);
console.log(`   - Dust rate limit: ${DUST_RATE_LIMIT}/minute`);
console.log(`   - Linear batch size: ${LINEAR_MAX_BATCH_SIZE}`);
console.log(`   - Checkpointing: ${ENABLE_CHECKPOINTING ? '✅ Enabled' : '❌ Disabled'}`);
console.log(`   - Checkpoint file: ${CHECKPOINT_FILE}`);
console.log(`   - File logging: ${LOG_TO_FILE ? '✅ Enabled' : '❌ Disabled'}`);
if (LOG_FILE) {
  console.log(`   - Log file: ${LOG_FILE}`);
}

// Initialize Linear client
const linearClient = new LinearClient({
  apiKey: LINEAR_API_KEY as string
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

// Add rate limiting for Linear API
const linearLimiter = new Bottleneck({
  maxConcurrent: LINEAR_MAX_CONCURRENT,
  minTime: 1000 / (LINEAR_RATE_LIMIT_PER_HOUR * 0.95), // Slightly below the limit
  reservoir: LINEAR_RATE_LIMIT_PER_HOUR,
  reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
  reservoirRefreshAmount: LINEAR_RATE_LIMIT_PER_HOUR
});

// Add debug logging for rate limiter
linearLimiter.on("idle", () => {
  console.log("🟢 Linear rate limiter is idle");
});

linearLimiter.on("depleted", () => {
  console.log("🔴 Linear rate limiter depleted - waiting for reservoir refresh");
});

linearLimiter.on("failed", (error, jobInfo) => {
  console.error("🚨 Rate limiter job failed:", error);
});

linearLimiter.on("retry", (error, jobInfo) => {
  console.warn("🔄 Rate limiter retrying job:", error);
});

// Add periodic queue monitoring
setInterval(() => {
  const counts = linearLimiter.counts();
  if (counts.QUEUED > 0 || counts.RUNNING > 0) {
    console.log(`📊 Linear rate limiter status: QUEUED=${counts.QUEUED}, RUNNING=${counts.RUNNING}, DONE=${counts.DONE}`);
  }
}, 15000); // Log every 15 seconds if there's queue activity

// Interface definitions
interface Section {
  prefix?: string | null;
  content?: string | null;
  sections: Section[];
}

interface CheckpointData {
  timestamp: string;
  totalIssues: number;
  processedIssues: string[]; // Array of issue IDs that have been successfully processed
  failedIssues: { issueId: string; error: string }[]; // Array of failed issue IDs with error details
  lastProcessedIndex: number;
  filters: {
    updatedSince?: string;
    teamKey?: string;
    projectId?: string;
    state?: string;
    label?: string;
  };
}

// Checkpoint management functions
function saveCheckpoint(data: CheckpointData): void {
  if (!ENABLE_CHECKPOINTING) return;
  
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Checkpoint saved: ${data.processedIssues.length}/${data.totalIssues} issues processed`);
  } catch (error) {
    console.error('❌ Failed to save checkpoint:', error);
  }
}

function loadCheckpoint(): CheckpointData | null {
  if (!ENABLE_CHECKPOINTING) return null;
  
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`📖 Checkpoint loaded: ${data.processedIssues.length}/${data.totalIssues} issues already processed`);
      return data;
    }
  } catch (error) {
    console.error('❌ Failed to load checkpoint:', error);
  }
  return null;
}

function clearCheckpoint(): void {
  if (!ENABLE_CHECKPOINTING) return;
  
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log(`🗑️  Checkpoint file cleared`);
    }
  } catch (error) {
    console.error('❌ Failed to clear checkpoint:', error);
  }
}

function shouldSkipIssue(issueId: string, checkpoint: CheckpointData | null): boolean {
  if (!checkpoint) return false;
  return checkpoint.processedIssues.includes(issueId);
}

function isResumeCompatible(checkpoint: CheckpointData): boolean {
  // Check if the current filters match the checkpoint filters
  const currentFilters = {
    updatedSince: LINEAR_UPDATED_SINCE,
    teamKey: LINEAR_TEAM_KEY,
    projectId: LINEAR_PROJECT_ID,
    state: LINEAR_STATE,
    label: LINEAR_LABEL
  };
  
  return JSON.stringify(currentFilters) === JSON.stringify(checkpoint.filters);
}

// Utility function for timing operations
function timeOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  const startTime = Date.now();
  console.log(`⏰ Starting operation: ${operationName}`);
  
  return operation().then(result => {
    const duration = Date.now() - startTime;
    console.log(`✅ Completed operation: ${operationName} (${duration}ms)`);
    return result;
  }).catch(error => {
    const duration = Date.now() - startTime;
    console.log(`❌ Failed operation: ${operationName} (${duration}ms)`);
    throw error;
  });
}

/**
 * Wrap Linear API calls with rate limiting and better error handling
 */
function safeLinearFetch<T>(fetchFn: () => LinearFetch<T> | undefined, operationName?: string): Promise<T> {
  // Create an outer timeout that wraps the entire rate-limited operation
  const outerTimeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Bottleneck scheduler timeout after ${LINEAR_API_TIMEOUT * 2}ms: ${operationName || 'unknown'}`));
    }, LINEAR_API_TIMEOUT * 2); // Give scheduler 2x the API timeout
  });

  return Promise.race([
    linearLimiter.schedule(async () => {
    let lastError: any;
    
    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= LINEAR_API_RETRY_ATTEMPTS; attempt++) {
      if (operationName) {
        const retryText = attempt > 1 ? ` (attempt ${attempt}/${LINEAR_API_RETRY_ATTEMPTS})` : '';
        console.log(`🔄 Linear API call: ${operationName}${retryText}`);
      }
      
      const startTime = Date.now();
      const linearFetch = fetchFn();
      
      if (!linearFetch) {
        if (operationName) {
          console.log(`⚠️  Linear API call returned undefined: ${operationName}`);
        }
        return Promise.resolve(undefined as T);
      }
      
      // Create a timeout promise that will reject after the configured timeout
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Linear API call timeout after ${LINEAR_API_TIMEOUT}ms: ${operationName || 'unknown'}`));
        }, LINEAR_API_TIMEOUT);
      });
      
      try {
        // Add additional debugging around the LinearFetch call
        if (operationName) {
          console.log(`🏁 Starting LinearFetch.then() for: ${operationName}`);
        }
        
        // Race between the actual API call and the timeout
        const result = await Promise.race([
          linearFetch.then((result) => {
            const duration = Date.now() - startTime;
            if (operationName) {
              const retryText = attempt > 1 ? ` (attempt ${attempt}/${LINEAR_API_RETRY_ATTEMPTS})` : '';
              console.log(`✅ Linear API call completed: ${operationName}${retryText} (${duration}ms)`);
            }
            return result;
          }).catch((apiError) => {
            const duration = Date.now() - startTime;
            if (operationName) {
              const retryText = attempt > 1 ? ` (attempt ${attempt}/${LINEAR_API_RETRY_ATTEMPTS})` : '';
              console.error(`❌ Linear API call failed: ${operationName}${retryText} (${duration}ms)`, apiError.message || apiError);
            }
            throw apiError;
          }),
          timeoutPromise
        ]);
        
        // Clear the timeout if the API call completed successfully
        clearTimeout(timeoutId!);
        return result;
        
      } catch (error: any) {
        // Clear the timeout in case of any error
        clearTimeout(timeoutId!);
        
        const duration = Date.now() - startTime;
        lastError = error;
        
        // Check if this is a retryable error
        const isRetryable = 
          error.message.includes('timeout') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('rate limit') ||
          error.message.includes('network') ||
          error.message.includes('connection');
        
        if (attempt < LINEAR_API_RETRY_ATTEMPTS && isRetryable) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          if (operationName) {
            console.warn(`🔄 Retrying ${operationName} in ${backoffTime}ms (attempt ${attempt + 1}/${LINEAR_API_RETRY_ATTEMPTS})`);
          }
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue; // Retry the loop
        }
        
        // Log final error details
        if (operationName) {
          const retryText = attempt > 1 ? ` (final attempt ${attempt}/${LINEAR_API_RETRY_ATTEMPTS})` : '';
          console.error(`❌ Linear API call failed: ${operationName}${retryText} (${duration}ms)`, error.message);
        }
        
        // Check if it's a rate limit error
        if (error.message && error.message.includes('rate limit')) {
          console.error('🚨 Rate limit hit! Consider increasing delays or reducing concurrency.');
        }
        
        // Check if it's a timeout error
        if (error.message && error.message.includes('timeout')) {
          console.error('⏰ API call timed out - this might indicate a network issue or very slow response.');
          console.error('💡 Consider reducing LINEAR_MAX_CONCURRENT or increasing LINEAR_API_TIMEOUT.');
        }
        
        // Check for connection errors
        if (error.message && (error.message.includes('ECONNRESET') || error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT'))) {
          console.error('🌐 Network connectivity issue detected. All retry attempts exhausted.');
        }
        
        throw error;
      }
    }
    
    // This should never be reached, but just in case
    throw lastError || new Error(`Failed to complete ${operationName} after ${LINEAR_API_RETRY_ATTEMPTS} attempts`);
    }),
    outerTimeoutPromise
  ]);
}

/**
 * Get issues updated in the specified time period with optional filters
 */
async function getIssues(): Promise<Issue[]> {
  console.log(`\n🔍 Fetching Linear issues with the following filters:`);
  if (LINEAR_UPDATED_SINCE) console.log(`   - Updated since: ${LINEAR_UPDATED_SINCE}`);
  if (LINEAR_TEAM_KEY) console.log(`   - Team: ${LINEAR_TEAM_KEY}`);
  if (LINEAR_PROJECT_ID) console.log(`   - Project ID: ${LINEAR_PROJECT_ID}`);
  if (LINEAR_STATE) console.log(`   - State: ${LINEAR_STATE}`);
  if (LINEAR_LABEL) console.log(`   - Label: ${LINEAR_LABEL}`);
  
  try {
    const filter: Record<string, any> = {};

    // Calculate the date for the updated since filter
    if (LINEAR_UPDATED_SINCE) {
      console.log(`📅 Processing date filter: ${LINEAR_UPDATED_SINCE}`);
      const updatedSince = new Date(process.env.LINEAR_UPDATED_SINCE as string);
  
      if (isNaN(updatedSince.getTime())) {
        throw new Error(
          `Invalid LINEAR_UPDATED_SINCE date format: "${process.env.LINEAR_UPDATED_SINCE}". Expected format: YYYY-MM-DD`
        );
      }

      filter.updatedAt = { gte: updatedSince.toISOString() };
      console.log(`   - Date filter applied: ${updatedSince.toISOString()}`);
    }

    // Add optional filters if provided
    if (LINEAR_TEAM_KEY) {
      console.log(`🏢 Looking up team: ${LINEAR_TEAM_KEY}`);
      // Get team by key directly
      const team = await safeLinearFetch(() => linearClient.team(LINEAR_TEAM_KEY), `get team ${LINEAR_TEAM_KEY}`);
      
      if (team) {
        filter.team = { id: { eq: team.id } };
        console.log(`   - Team filter applied: ${team.name} (${team.id})`);
      } else {
        console.warn(`⚠️  Team with key "${LINEAR_TEAM_KEY}" not found. Ignoring team filter.`);
      }
    }
    
    if (LINEAR_PROJECT_ID) {
      filter.project = { id: { eq: LINEAR_PROJECT_ID } };
      console.log(`   - Project filter applied: ${LINEAR_PROJECT_ID}`);
    }
    
    if (LINEAR_STATE) {
      console.log(`🔄 Looking up workflow state: ${LINEAR_STATE}`);
      // Get state by name
      const states = await safeLinearFetch(() => linearClient.workflowStates(), 'get workflow states');
      const stateNodes = states.nodes;
      const state = stateNodes.find((s: WorkflowState) => s.name === LINEAR_STATE);
      
      if (state) {
        filter.state = { id: { eq: state.id } };
        console.log(`   - State filter applied: ${state.name} (${state.id})`);
      } else {
        console.warn(`⚠️  State "${LINEAR_STATE}" not found. Ignoring state filter.`);
      }
    }
    
    // Paginate through all results
    console.log(`\n📄 Starting pagination with batch size: ${LINEAR_MAX_BATCH_SIZE}`);
    const allIssues: Issue[] = [];
    let hasNextPage = true;
    let endCursor: string | undefined;
    let pageCount = 0;
    
    while (hasNextPage) {
      pageCount++;
      console.log(`   Fetching page ${pageCount}${endCursor ? ` (cursor: ${endCursor.substring(0, 10)}...)` : ''}`);
      
      const issueConnection = await safeLinearFetch(() => 
        linearClient.issues({
          filter,
          first: LINEAR_MAX_BATCH_SIZE,
          after: endCursor
        }), `get issues page ${pageCount}`
      );
      
      console.log(`   - Page ${pageCount}: Retrieved ${issueConnection.nodes.length} issues`);
      allIssues.push(...issueConnection.nodes);
      
      hasNextPage = issueConnection.pageInfo.hasNextPage;
      endCursor = issueConnection.pageInfo.endCursor;
      
      console.log(`   - Total so far: ${allIssues.length} issues`);
      if (hasNextPage) {
        console.log(`   - More pages available, continuing...`);
      }
    }

    console.log(`📊 Retrieved ${allIssues.length} issues from ${pageCount} pages`);

    // Apply label filter if specified
    let filteredIssues = allIssues;
    if (LINEAR_LABEL) {
      console.log(`\n🏷️  Applying label filter: ${LINEAR_LABEL}`);
      console.log(`   Checking labels for ${allIssues.length} issues...`);
      
      const labelCheckResults = await Promise.all(
        allIssues.map(async (issue, index) => {
          if (index % 10 === 0) {
            console.log(`   Progress: ${index + 1}/${allIssues.length} issues checked`);
          }
          const labels = await issue.labels();
          const labelNodes = labels.nodes;
          return { 
            issue, 
            hasLabel: labelNodes.some((label: IssueLabel) => label.name === LINEAR_LABEL) 
          };
        })
      );
      
      filteredIssues = labelCheckResults.filter(result => result.hasLabel).map(result => result.issue);
      console.log(`   - Label filter applied: ${filteredIssues.length}/${allIssues.length} issues match`);
    }
    
    console.log(`\n✅ Final result: ${filteredIssues.length} issues ready for processing`);
    return filteredIssues;
    
  } catch (error) {
    console.error("❌ Error fetching Linear issues:", error);
    throw error;
  }
}

/**
 * Format issue description
 */
function formatDescription(description: string | null): string {
  return description || "No description provided";
}

/**
 * Format issue comments (if enabled)
 */
async function formatComments(issue: Issue): Promise<Section[] | null> {
  if (!FETCH_CONFIG.comments) {
    return null;
  }

  try {
    console.log(`      💬 Fetching comments for ${issue.identifier}`);
    const comments = await safeLinearFetch(() => issue.comments(), `get comments for ${issue.identifier}`);
    const commentNodes = comments.nodes;
    console.log(`         Found ${commentNodes.length} comments`);
    
    // Quick optimization: if no comments, return early without processing users
    if (commentNodes.length === 0) {
      console.log(`         ⚡ Skipping comment user processing (no comments)`);
      return [{
        prefix: "Comments",
        content: "No comments",
        sections: []
      }];
    }
    
    const commentSections = await Promise.all(
      commentNodes.map(async (comment: Comment, index) => {
        console.log(`         Processing comment ${index + 1}/${commentNodes.length}`);
        const user = await getCachedUser(() => comment.user, `get user for comment ${index + 1} (${issue.identifier})`);
        const createdAt = comment.createdAt;
        
        // Use the reactionData attribute to get reactions
        const reactionData = comment.reactionData;
        const reactionText = Object.keys(reactionData).length > 0 
          ? `\nReactions: ${Object.entries(reactionData).map(([key, value]) => `${key}: ${value}`).join(', ')}`
          : '';
        
        return {
          prefix: `Comment by ${user?.name || 'Unknown'} (${user?.email || 'No email'}) - ${createdAt.toISOString()}`,
          content: `${comment.body}${reactionText}`,
          sections: []
        } as Section;
      })
    );
    
    return [{
      prefix: "Comments",
      content: null,
      sections: commentSections
    }];
  } catch (error) {
    console.error(`❌ Error formatting comments for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format issue attachments (if enabled)
 */
async function formatAttachments(issue: Issue): Promise<Section | null> {
  if (!FETCH_CONFIG.attachments) {
    return null;
  }

  try {
    console.log(`      📎 Fetching attachments for ${issue.identifier}`);
    const attachments = await safeLinearFetch(() => issue.attachments(), `get attachments for ${issue.identifier}`);
    const attachmentNodes = attachments.nodes;
    console.log(`         Found ${attachmentNodes.length} attachments`);
    
    if (attachmentNodes.length === 0) {
      return {
        prefix: "Attachments",
        content: "No attachments",
        sections: []
      };
    }
    
    const attachmentSections = attachmentNodes.map((attachment: Attachment) => ({
      prefix: attachment.title,
      content: attachment.url,
      sections: []
    }));
    
    return {
      prefix: "Attachments",
      content: null,
      sections: attachmentSections
    };
  } catch (error) {
    console.error(`❌ Error formatting attachments for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format issue labels (if enabled)
 */
async function formatLabels(issue: Issue): Promise<string> {
  if (!FETCH_CONFIG.labels) {
    return "";
  }

  try {
    console.log(`      🏷️  Fetching labels for ${issue.identifier}`);
    const labels = await safeLinearFetch(() => issue.labels(), `get labels for ${issue.identifier}`);
    const labelNodes = labels.nodes;
    console.log(`         Found ${labelNodes.length} labels`);
    
    if (labelNodes.length === 0) {
      return "No labels";
    }
    
    return labelNodes.map((label: IssueLabel) => 
      `${label.name}${label.description ? ` (${label.description})` : ''}`
    ).join(", ");
  } catch (error) {
    console.error(`❌ Error formatting labels for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format issue relations (if enabled)
 */
async function formatRelations(issue: Issue): Promise<Section | null> {
  if (!FETCH_CONFIG.relations) {
    return null;
  }

  try {
    console.log(`      🔗 Fetching relations for ${issue.identifier}`);
    const relations = await safeLinearFetch(() => issue.relations(), `get relations for ${issue.identifier}`);
    const relationNodes = relations.nodes;
    console.log(`         Found ${relationNodes.length} relations`);
    
    // Quick optimization: if no relations, return early without processing related issues
    if (relationNodes.length === 0) {
      console.log(`         ⚡ Skipping relation processing (no relations)`);
      return {
        prefix: "Issue Relations",
        content: "No relations",
        sections: []
      };
    }
    
    const relationSections = await Promise.all(
      relationNodes.map(async (relation: IssueRelation, index) => {
        console.log(`         Processing relation ${index + 1}/${relationNodes.length}`);
        const relatedIssue = await safeLinearFetch(() => relation.relatedIssue, `get related issue ${index + 1}`);
        if (!relatedIssue) {
          return {
            prefix: relation.type,
            content: 'Related issue not found',
            sections: []
          };
        }
        return {
          prefix: relation.type,
          content: `${relatedIssue.identifier} - ${relatedIssue.title}`,
          sections: []
        };
      })
    );
    
    return {
      prefix: "Issue Relations",
      content: null,
      sections: relationSections
    };
  } catch (error) {
    console.error(`❌ Error formatting relations for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format issue history (if enabled)
 */
async function formatHistory(issue: Issue): Promise<Section | null> {
  if (!FETCH_CONFIG.history) {
    return null;
  }

  try {
    console.log(`      📋 Fetching history for ${issue.identifier}`);
    const history = await safeLinearFetch(() => issue.history(), `get history for ${issue.identifier}`);
    const historyNodes = history.nodes;
    console.log(`         Found ${historyNodes.length} history items`);
    
    if (historyNodes.length === 0) {
      return {
        prefix: "Recent History",
        content: "No history",
        sections: []
      };
    }
    
    // Get the 10 most recent history items
    const recentHistory = historyNodes.slice(0, 10);
    console.log(`         Processing ${recentHistory.length} recent history items`);
    
    const historySections = await Promise.all(
      recentHistory.map(async (historyItem: IssueHistory, index) => {
        console.log(`         Processing history item ${index + 1}/${recentHistory.length}`);
        const user = await getCachedUser(() => historyItem.actor, `get actor for history item ${index + 1} (${issue.identifier})`);
        const action = historyItem.fromState && historyItem.toState 
          ? `Changed status from "${historyItem.fromState}" to "${historyItem.toState}"`
          : 'Made changes';
        
        return {
          prefix: `${historyItem.createdAt.toISOString()} - ${user?.name || 'System'}`,
          content: action,
          sections: []
        };
      })
    );
    
    return {
      prefix: "Recent History",
      content: null,
      sections: historySections
    };
  } catch (error) {
    console.error(`❌ Error formatting history for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format issue subscribers (if enabled)
 */
async function formatSubscribers(issue: Issue): Promise<string> {
  if (!FETCH_CONFIG.subscribers) {
    return "";
  }

  try {
    console.log(`      👥 Fetching subscribers for ${issue.identifier}`);
    const subscribers = await safeLinearFetch(() => issue.subscribers(), `get subscribers for ${issue.identifier}`);
    const subscriberNodes = subscribers.nodes;
    console.log(`         Found ${subscriberNodes.length} subscribers`);
    
    if (subscriberNodes.length === 0) {
      return "No subscribers";
    }
    
    return subscriberNodes.map((user: User) => 
      `${user.name} (${user.email})`
    ).join(", ");
  } catch (error) {
    console.error(`❌ Error formatting subscribers for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format parent issue (if enabled)
 */
async function formatParentIssue(issue: Issue): Promise<Section | null> {
  if (!FETCH_CONFIG.hierarchy) {
    return null;
  }

  try {
    console.log(`      👆 Fetching parent issue for ${issue.identifier}`);
    const parent = await safeLinearFetch(() => issue.parent, `get parent for ${issue.identifier}`);
    
    return {
      prefix: "Parent Issue",
      content: parent ? `${parent.identifier}: ${parent.title}` : "No parent issue",
      sections: []
    };
  } catch (error) {
    console.error(`❌ Error formatting parent issue for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format child issues (if enabled)
 */
async function formatChildIssues(issue: Issue): Promise<Section | null> {
  if (!FETCH_CONFIG.hierarchy) {
    return null;
  }

  try {
    console.log(`      👇 Fetching child issues for ${issue.identifier}`);
    const children = await safeLinearFetch(() => issue.children(), `get children for ${issue.identifier}`);
    const childNodes = children.nodes;
    console.log(`         Found ${childNodes.length} child issues`);
    
    const childSections: Section[] = [];
    if (childNodes.length > 0) {
      childNodes.forEach((child: Issue) => {
        childSections.push({
          prefix: child.identifier,
          content: child.title,
          sections: []
        });
      });
    }
    
    return {
      prefix: "Sub-Issues",
      content: childNodes.length === 0 ? "No sub-issues" : null,
      sections: childSections
    };
  } catch (error) {
    console.error(`❌ Error formatting child issues for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Format cycle information (if enabled)
 */
async function formatCycle(issue: Issue): Promise<string> {
  if (!FETCH_CONFIG.cycle) {
    return "";
  }

  try {
    console.log(`      🔄 Fetching cycle for ${issue.identifier}`);
    const cycle = await safeLinearFetch(() => issue.cycle, `get cycle for ${issue.identifier}`);
    
    if (!cycle) {
      return "Not assigned to any cycle";
    }
    
    return `${cycle.name} (${cycle.startsAt.toISOString()} to ${cycle.endsAt.toISOString()})`;
  } catch (error) {
    console.error(`❌ Error formatting cycle for ${issue.identifier}:`, error);
    throw error;
  }
}

/**
 * Get user information with caching to reduce redundant API calls
 */
async function getCachedUser(userFetch: () => any, operationName: string): Promise<any> {
  if (!userFetch) return null;
  
  // For caching, we need a unique identifier. We'll use the operation name as a key
  // This isn't perfect but will catch many common cases
  const cacheKey = operationName;
  
  if (CACHE.users.has(cacheKey)) {
    console.log(`👤 Using cached user for ${operationName}`);
    return CACHE.users.get(cacheKey);
  }
  
  try {
    const user = await safeLinearFetch(userFetch, operationName);
    if (user && (user as any).id) {
      // Cache using the user ID as a more reliable key
      CACHE.users.set((user as any).id, user);
      // Also cache using the operation name for this specific context
      CACHE.users.set(cacheKey, user);
      console.log(`💾 User ${(user as any).name} cached (${CACHE.users.size} users in cache)`);
    }
    return user;
  } catch (error) {
    console.error(`❌ Error fetching user for ${operationName}:`, error);
    throw error;
  }
}

/**
 * Get organization information (if enabled) - with caching
 */
async function getOrganizationInfo(): Promise<Section | null> {
  if (!FETCH_CONFIG.organization) {
    return null;
  }

  // Return cached organization info if available
  if (CACHE.organization) {
    console.log(`🏢 Using cached organization information`);
    return CACHE.organization;
  }

  try {
    console.log(`🏢 Fetching organization information (first time)`);
    const organization = await safeLinearFetch(() => linearClient.organization, 'get organization');
    
    const orgInfo = {
      prefix: "Organization",
      content: `${organization.name} (Created: ${organization.createdAt.toISOString()})`,
      sections: []
    };
    
    // Cache for future use
    CACHE.organization = orgInfo;
    console.log(`💾 Organization info cached for future requests`);
    
    return orgInfo;
  } catch (error) {
    console.error("❌ Error getting organization info:", error);
    throw error;
  }
}

/**
 * Get human-readable priority label
 */
function getPriorityLabel(priority: number | null): string {
  if (priority === null) return 'No priority';
  
  switch (priority) {
    case 0:
      return 'No priority';
    case 1:
      return 'Urgent';
    case 2:
      return 'High';
    case 3:
      return 'Medium';
    case 4:
      return 'Low';
    default:
      return 'Custom priority';
  }
}

/**
 * Upsert issue to Dust datasource using sections
 */
async function upsertToDustDatasource(issue: Issue) {
  try {
    console.log(`📝 Processing issue: ${issue.identifier} - ${issue.title}`);
    console.log(`    🔄 Starting parallel data fetch operations...`);
    
    // Get related data - using rate-limited calls and respecting config
    const dataFetchStart = Date.now();
    const [
      team, 
      creator, 
      assignee, 
      project, 
      state, 
      comments, 
      attachments, 
      labels,
      relations,
      history,
      subscribers,
      parentIssue,
      childIssues,
      cycle,
      organizationInfo
    ] = await Promise.all([
      timeOperation(() => safeLinearFetch(() => issue.team, `get team for ${issue.identifier}`), `get team for ${issue.identifier}`),
      timeOperation(() => getCachedUser(() => issue.creator, `get creator for ${issue.identifier}`), `get creator for ${issue.identifier}`),
      timeOperation(() => getCachedUser(() => issue.assignee, `get assignee for ${issue.identifier}`), `get assignee for ${issue.identifier}`),
      timeOperation(() => safeLinearFetch(() => issue.project, `get project for ${issue.identifier}`), `get project for ${issue.identifier}`),
      timeOperation(() => safeLinearFetch(() => issue.state, `get state for ${issue.identifier}`), `get state for ${issue.identifier}`),
      timeOperation(() => formatComments(issue), `format comments for ${issue.identifier}`),
      timeOperation(() => formatAttachments(issue), `format attachments for ${issue.identifier}`),
      timeOperation(() => formatLabels(issue), `format labels for ${issue.identifier}`),
      timeOperation(() => formatRelations(issue), `format relations for ${issue.identifier}`),
      timeOperation(() => formatHistory(issue), `format history for ${issue.identifier}`),
      timeOperation(() => formatSubscribers(issue), `format subscribers for ${issue.identifier}`),
      timeOperation(() => formatParentIssue(issue), `format parent for ${issue.identifier}`),
      timeOperation(() => formatChildIssues(issue), `format children for ${issue.identifier}`),
      timeOperation(() => formatCycle(issue), `format cycle for ${issue.identifier}`),
      timeOperation(() => getOrganizationInfo(), `get organization info`)
    ]);
    
    const dataFetchDuration = Date.now() - dataFetchStart;
    console.log(`    ✅ All parallel data operations completed in ${dataFetchDuration}ms`);
    console.log(`    📊 Cache stats: ${CACHE.users.size} users cached, org cached: ${CACHE.organization ? 'yes' : 'no'}`);
    
    console.log(`    ✅ All related data fetched for ${issue.identifier}`);
    console.log(`    📊 Building document structure...`);
    
    const documentId = `linear-issue-${issue.id}`;
    
    // Create the main section with metadata
    const metadataSection: Section = {
      prefix: "Metadata",
      content: null,
      sections: [
        {
          prefix: "Issue Details",
          content: [
            `ID: ${issue.id}`,
            `Number: ${issue.number}`,
            `Identifier: ${issue.identifier}`,
            `URL: ${issue.url}`
          ].join('\n'),
          sections: []
        },
        {
          prefix: "Team & Project",
          content: [
            `Team: ${team?.name || 'No team'} (${team?.key || 'No key'})`,
            `Project: ${project?.name || 'No project'}`,
            `State: ${state?.name || 'Unknown state'} (${state?.type || 'Unknown type'})` 
          ].join('\n'),
          sections: []
        },
        {
          prefix: "Dates & Times",
          content: [
            `Created: ${issue.createdAt.toISOString()}`,
            `Updated: ${issue.updatedAt.toISOString()}`,
            `Started: ${issue.startedAt ? issue.startedAt.toISOString() : 'Not started'}`,
            `Completed: ${issue.completedAt ? issue.completedAt.toISOString() : 'Not completed'}`,
            `Canceled: ${issue.canceledAt ? issue.canceledAt.toISOString() : 'Not canceled'}`,
            `Auto Closed: ${issue.autoClosedAt ? issue.autoClosedAt.toISOString() : 'Not auto-closed'}`,
            `Auto Archived: ${issue.autoArchivedAt ? issue.autoArchivedAt.toISOString() : 'Not auto-archived'}`,
            `Due Date: ${issue.dueDate || 'No due date'}`,
            `Snoozed Until: ${issue.snoozedUntilAt ? issue.snoozedUntilAt.toISOString() : 'Not snoozed'}`
          ].join('\n'),
          sections: []
        },
        {
          prefix: "People",
          content: [
            `Creator: ${creator?.name || 'Unknown'} (${creator?.email || 'No email'})`,
            `Assignee: ${assignee?.name || 'Unassigned'} (${assignee?.email || 'No email'})`,
            ...(subscribers ? [`Subscribers: ${subscribers}`] : [])
          ].join('\n'),
          sections: []
        },
        {
          prefix: "Planning",
          content: [
            `Priority: ${issue.priority} (${getPriorityLabel(issue.priority)})`,
            `Estimate: ${issue.estimate !== null ? issue.estimate : 'No estimate'} points`,
            `Completed Estimate: ${issue.completedAt ? (issue.estimate !== null ? issue.estimate : 'No estimate') : 'Not completed'}`,
            ...(cycle ? [`Cycle: ${cycle}`] : []),
            ...(labels ? [`Labels: ${labels}`] : [])
          ].join('\n'),
          sections: []
        }
      ]
    };
    
    // Create the full document section structure with only enabled sections
    const sections: Section[] = [
      metadataSection,
      {
        prefix: "Description",
        content: formatDescription(issue.description ?? 'No description provided'),
        sections: []
      },
    ];
    
    // Add optional sections if they were fetched
    let sectionCount = 2; // metadata + description
    if (organizationInfo) { 
      sections.unshift(organizationInfo); 
      sectionCount++; 
    }
    if (parentIssue) { 
      sections.push(parentIssue); 
      sectionCount++; 
    }
    if (childIssues) { 
      sections.push(childIssues); 
      sectionCount++; 
    }
    if (relations) { 
      sections.push(relations); 
      sectionCount++; 
    }
    if (attachments) { 
      sections.push(attachments); 
      sectionCount++; 
    }
    if (comments) { 
      sections.push(...comments); 
      sectionCount += comments.length; 
    }
    if (history) { 
      sections.push(history); 
      sectionCount++; 
    }
    
    console.log(`    📄 Document structure built with ${sectionCount} sections`);
    
    const section: Section = {
      prefix: issue.identifier,
      content: issue.title,
      sections: sections
    };

    // Upsert to Dust
    console.log(`    🚀 Uploading to Dust datasource...`);
    const uploadStartTime = Date.now();
    
    await dustApi.post(
      `/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
      {
        section: section,
        title: `${issue.identifier}: ${issue.title}`,
      }
    );
    
    const uploadDuration = Date.now() - uploadStartTime;
    console.log(`    ✅ Successfully upserted ${issue.identifier} to Dust datasource (${uploadDuration}ms)`);
    
  } catch (error) {
    console.error(
      `❌ Error upserting issue ${issue.identifier} to Dust datasource:`,
      error
    );
    
    // Check if it's a rate limit error and provide helpful guidance
    const axiosError = error as any;
    if (axiosError.response?.status === 429 || (axiosError.message && axiosError.message.includes('rate limit'))) {
      console.error('🚨 Rate limit detected! The checkpoint system will help you resume from where you left off.');
    }
    
    throw error;
  }
}

/**
 * Heartbeat function to detect if script is hanging
 */
function startHeartbeat() {
  let lastActivity = Date.now();
  let heartbeatCount = 0;
  
  const updateActivity = () => {
    lastActivity = Date.now();
  };
  
  const heartbeatInterval = setInterval(() => {
    heartbeatCount++;
    const timeSinceActivity = Date.now() - lastActivity;
    
    if (timeSinceActivity > 120000) { // 2 minutes of no activity
      console.log(`💓 Heartbeat ${heartbeatCount}: Script appears to be hanging (${Math.round(timeSinceActivity/1000)}s since last activity)`);
      console.log(`   Consider killing and restarting to resume from checkpoint.`);
    } else if (heartbeatCount % 10 === 0) { // Every 10 beats (5 minutes)
      console.log(`💓 Heartbeat ${heartbeatCount}: Script is active (${Math.round(timeSinceActivity/1000)}s since last activity)`);
    }
  }, 30000); // Every 30 seconds
  
  // Track activity but don't interfere with logging
  const originalConsoleLog = console.log;
  const wrappedConsoleLog = (...args: any[]) => {
    updateActivity();
    originalConsoleLog(...args);
  };
  
  // Temporarily wrap console.log for activity tracking
  console.log = wrappedConsoleLog;
  
  return () => {
    clearInterval(heartbeatInterval);
    // Restore the previous console.log (which might be our logging version)
    console.log = originalConsoleLog;
  };
}

/**
 * Main function with checkpoint support
 */
async function main() {
  const totalStartTime = Date.now();
  const stopHeartbeat = startHeartbeat();
  
  try {
    console.log("\n🚀 Starting Linear to Dust sync process");
    console.log("=" .repeat(50));
    
    console.log("\n📋 Data fetching configuration:");
    Object.entries(FETCH_CONFIG).forEach(([key, value]) => {
      const status = value ? '✅ Enabled' : '❌ Disabled';
      console.log(`   - ${key}: ${status}`);
    });

    // Check for existing checkpoint
    let existingCheckpoint = loadCheckpoint();
    let isResuming = false;
    
    if (existingCheckpoint) {
      if (isResumeCompatible(existingCheckpoint)) {
        console.log(`\n🔄 Found compatible checkpoint from ${existingCheckpoint.timestamp}`);
        console.log(`   - ${existingCheckpoint.processedIssues.length} issues already processed`);
        console.log(`   - ${existingCheckpoint.failedIssues.length} issues previously failed`);
        isResuming = true;
      } else {
        console.log(`\n⚠️  Found incompatible checkpoint (different filters). Starting fresh.`);
        clearCheckpoint();
        existingCheckpoint = null;
      }
    }

    const recentIssues = await timeOperation(() => getIssues(), 'fetch all issues');
    console.log(
      `\n📊 Found ${recentIssues.length} issues matching the criteria.`
    );

    if (recentIssues.length === 0) {
      console.log("ℹ️  No issues to process. Exiting.");
      if (existingCheckpoint) {
        clearCheckpoint();
      }
      return;
    }

    // Filter out already processed issues if resuming
    let issuesToProcess = recentIssues;
    if (isResuming && existingCheckpoint) {
      issuesToProcess = recentIssues.filter(issue => !shouldSkipIssue(issue.id, existingCheckpoint));
      console.log(`📋 Resume mode: ${issuesToProcess.length} remaining issues to process`);
      if (existingCheckpoint.failedIssues.length > 0) {
        console.log(`⚠️  ${existingCheckpoint.failedIssues.length} issues failed in previous run:`);
        existingCheckpoint.failedIssues.forEach(failed => {
          console.log(`   - ${failed.issueId}: ${failed.error.substring(0, 100)}...`);
        });
      }
    }

    if (issuesToProcess.length === 0) {
      console.log("✅ All issues have already been processed!");
      clearCheckpoint();
      return;
    }

    // Initialize checkpoint data
    const checkpointData: CheckpointData = {
      timestamp: new Date().toISOString(),
      totalIssues: recentIssues.length,
      processedIssues: existingCheckpoint?.processedIssues || [],
      failedIssues: existingCheckpoint?.failedIssues || [],
      lastProcessedIndex: 0,
      filters: {
        updatedSince: LINEAR_UPDATED_SINCE,
        teamKey: LINEAR_TEAM_KEY,
        projectId: LINEAR_PROJECT_ID,
        state: LINEAR_STATE,
        label: LINEAR_LABEL
      }
    };

    // Use rate limiting to avoid hitting Dust API limits
    console.log(`\n⚙️  Setting up Dust rate limiter (${DUST_RATE_LIMIT} requests/minute)`);
    const limiter = new Bottleneck({
      maxConcurrent: LINEAR_MAX_CONCURRENT,
      minTime: 60 * 1000 / DUST_RATE_LIMIT,
    });

    // Add Dust rate limiter logging
    limiter.on("idle", () => {
      console.log("🟢 Dust rate limiter is idle");
    });

    limiter.on("depleted", () => {
      console.log("🔴 Dust rate limiter depleted - waiting...");
    });

    console.log(`\n🔄 Processing ${issuesToProcess.length} issues...`);
    console.log("=" .repeat(50));

    let processedCount = checkpointData.processedIssues.length;
    let errorCount = checkpointData.failedIssues.length;
    let sessionProcessedCount = 0;

    const tasks = issuesToProcess.map((issue, index) =>
      limiter.schedule(async () => {
        const issueStartTime = Date.now();
        console.log(`\n🚀 [${index + 1}/${issuesToProcess.length}] Starting processing of ${issue.identifier}`);
        
        try {
          await upsertToDustDatasource(issue);
          
          const issueDuration = Date.now() - issueStartTime;
          console.log(`✅ [${index + 1}/${issuesToProcess.length}] Completed ${issue.identifier} (${issueDuration}ms)`);
          
          // Update checkpoint
          checkpointData.processedIssues.push(issue.id);
          sessionProcessedCount++;
          processedCount++;
          
          console.log(`📈 Progress: ${processedCount}/${checkpointData.totalIssues} issues processed (${Math.round(processedCount / checkpointData.totalIssues * 100)}%)`);
          console.log(`    Session: ${sessionProcessedCount}/${issuesToProcess.length} new issues processed`);
          
          // Save checkpoint every 5 issues
          if (sessionProcessedCount % 5 === 0) {
            console.log(`💾 Saving checkpoint at ${sessionProcessedCount} issues...`);
            saveCheckpoint(checkpointData);
            
            const elapsed = Date.now() - totalStartTime;
            const rate = sessionProcessedCount / (elapsed / 1000 / 60); // issues per minute
            const remaining = issuesToProcess.length - sessionProcessedCount;
            const eta = remaining / rate; // minutes
            console.log(`⏱️  Processing rate: ${rate.toFixed(1)} issues/min, ETA: ${eta.toFixed(1)} minutes`);
          }
        } catch (error) {
          const issueDuration = Date.now() - issueStartTime;
          console.error(`❌ [${index + 1}/${issuesToProcess.length}] Failed ${issue.identifier} after ${issueDuration}ms`);
          
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Update checkpoint with failed issue
          checkpointData.failedIssues.push({
            issueId: issue.id,
            error: errorMessage
          });
          
          // Save checkpoint even for failures
          saveCheckpoint(checkpointData);
          
          console.error(`❌ Failed to process issue ${issue.identifier}:`, error);
          
          // Check if it's a rate limit error and suggest stopping
          const axiosError = error as any;
          if (axiosError.response?.status === 429 || (axiosError.message && axiosError.message.includes('rate limit'))) {
            console.error('🚨 Rate limit hit! You can restart the script to resume from the checkpoint.');
          }
        }
      })
    );

    await Promise.all(tasks);
    
    // Final checkpoint save
    saveCheckpoint(checkpointData);
    
    const totalDuration = Date.now() - totalStartTime;
    const avgTimePerIssue = totalDuration / sessionProcessedCount;
    
    console.log("\n" + "=" .repeat(50));
    console.log("🎉 Processing complete!");
    console.log(`📊 Summary:`);
    console.log(`   - Total issues in scope: ${checkpointData.totalIssues}`);
    console.log(`   - Successfully processed (all time): ${checkpointData.processedIssues.length}`);
    console.log(`   - Processed this session: ${sessionProcessedCount}`);
    console.log(`   - Failed issues: ${checkpointData.failedIssues.length}`);
    console.log(`   - Session time: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
    if (sessionProcessedCount > 0) {
      console.log(`   - Average time per issue: ${avgTimePerIssue.toFixed(0)}ms`);
      console.log(`   - Processing rate: ${(sessionProcessedCount / (totalDuration / 1000 / 60)).toFixed(1)} issues/min`);
    }
    console.log(`   - Cache efficiency: ${CACHE.users.size} users cached, org cached: ${CACHE.organization ? '✅' : '❌'}`);
    
    if (checkpointData.failedIssues.length > 0) {
      console.log(`\n⚠️  ${checkpointData.failedIssues.length} issues failed to process:`);
      checkpointData.failedIssues.forEach(failed => {
        console.log(`   - ${failed.issueId}: ${failed.error.substring(0, 100)}...`);
      });
      console.log(`\n💡 You can restart the script to retry failed issues or process new ones.`);
    } else {
      console.log(`\n✅ All issues processed successfully! Clearing checkpoint.`);
      clearCheckpoint();
    }
    
    if (errorCount > 0) {
      console.log(`\n📝 Checkpoint saved. Restart this script to resume from where it left off.`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error("💥 Fatal error occurred:", error);
    console.log(`\n📝 If a checkpoint exists, you can restart the script to resume.`);
    if (LOG_FILE) {
      console.log(`📄 Full logs available in: ${LOG_FILE}`);
    }
    stopHeartbeat();
    closeLogFile();
    process.exit(1);
  } finally {
    stopHeartbeat();
    if (LOG_FILE) {
      console.log(`\n📄 Complete logs saved to: ${LOG_FILE}`);
    }
    closeLogFile();
  }
}

main();