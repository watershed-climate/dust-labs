import axios from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";
import { 
  LinearClient, 
  Issue, 
  IssueConnection, 
  Comment, 
  Attachment, 
  IssueLabel, 
  Team, 
  WorkflowState, 
  User,
  IssueHistory,
  IssueRelation,
  Document
} from "@linear/sdk";

dotenv.config();

const DEFAULT_UPDATED_SINCE = "24h"; // Default to 24 hours
const DEFAULT_DUST_RATE_LIMIT = 120; // requests per minute
const DEFAULT_LINEAR_MAX_CONCURRENT = 5; // concurrent requests

// Linear API credentials and query parameters
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_UPDATED_SINCE = process.env.LINEAR_UPDATED_SINCE || DEFAULT_UPDATED_SINCE;
const LINEAR_TEAM_KEY = process.env.LINEAR_TEAM_KEY;
const LINEAR_PROJECT_ID = process.env.LINEAR_PROJECT_ID;
const LINEAR_STATE = process.env.LINEAR_STATE;
const LINEAR_LABEL = process.env.LINEAR_LABEL;

// Dust API credentials
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

// Rate limiting configuration
const DUST_RATE_LIMIT = parseInt(process.env.DUST_RATE_LIMIT || DEFAULT_DUST_RATE_LIMIT.toString(), 10);
const LINEAR_MAX_CONCURRENT = parseInt(process.env.LINEAR_MAX_CONCURRENT || DEFAULT_LINEAR_MAX_CONCURRENT.toString(), 10);

const requiredEnvVars = [
  'LINEAR_API_KEY',
  'DUST_API_KEY',
  'DUST_WORKSPACE_ID',
  'DUST_DATASOURCE_ID'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Please provide values for the following environment variables: ${missingEnvVars.join(', ')}`
  );
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

/**
 * Get issues updated in the specified time period with optional filters
 */
async function getRecentlyUpdatedIssues(): Promise<Issue[]> {
  console.log(`Fetching Linear issues with the following filters:`);
  console.log(`- Updated in the last: ${LINEAR_UPDATED_SINCE}`);
  if (LINEAR_TEAM_KEY) console.log(`- Team: ${LINEAR_TEAM_KEY}`);
  if (LINEAR_PROJECT_ID) console.log(`- Project ID: ${LINEAR_PROJECT_ID}`);
  if (LINEAR_STATE) console.log(`- State: ${LINEAR_STATE}`);
  if (LINEAR_LABEL) console.log(`- Label: ${LINEAR_LABEL}`);
  
  try {
    // Calculate the date for the updated since filter
    const now = new Date();
    let updatedSince: Date;
    
    if (LINEAR_UPDATED_SINCE.endsWith('h')) {
      const hours = parseInt(LINEAR_UPDATED_SINCE.slice(0, -1), 10);
      updatedSince = new Date(now.getTime() - hours * 60 * 60 * 1000);
    } else if (LINEAR_UPDATED_SINCE.endsWith('d')) {
      const days = parseInt(LINEAR_UPDATED_SINCE.slice(0, -1), 10);
      updatedSince = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    } else {
      // Default to 24 hours if format is invalid
      updatedSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Format date for Linear API (ISO string)
    const updatedSinceStr = updatedSince.toISOString();
    
    // Build filter object
    const filter: Record<string, any> = {
      updatedAt: { gte: updatedSinceStr }
    };
    
    // Add optional filters if provided
    if (LINEAR_TEAM_KEY) {
      // Get team by key first
      const teams = await linearClient.teams();
      const teamNodes = teams.nodes;
      const team = teamNodes.find((t: Team) => t.key === LINEAR_TEAM_KEY);
      
      if (team) {
        filter.team = { id: { eq: team.id } };
      } else {
        console.warn(`Team with key "${LINEAR_TEAM_KEY}" not found. Ignoring team filter.`);
      }
    }
    
    if (LINEAR_PROJECT_ID) {
      filter.project = { id: { eq: LINEAR_PROJECT_ID } };
    }
    
    if (LINEAR_STATE) {
      // Get state by name
      const states = await linearClient.workflowStates();
      const stateNodes = states.nodes;
      const state = stateNodes.find((s: WorkflowState) => s.name === LINEAR_STATE);
      
      if (state) {
        filter.state = { id: { eq: state.id } };
      } else {
        console.warn(`State "${LINEAR_STATE}" not found. Ignoring state filter.`);
      }
    }
    
    if (LINEAR_LABEL) {
      // We'll handle label filtering after fetching issues
      // as the Linear API doesn't support direct filtering by label name
    }
    
    // Fetch issues with filters
    const issues = await linearClient.issues({
      filter
    });
    
    // Paginate through all results
    const allIssues: Issue[] = [];
    let issueConnection: IssueConnection | undefined = issues;
    
    while (issueConnection) {
      const nodes = await issueConnection.nodes;
      allIssues.push(...nodes);
      
      // Get next page if available
      if (issueConnection.pageInfo.hasNextPage) {
        issueConnection = await issueConnection.fetchNext();
      } else {
        issueConnection = undefined;
      }
    }
    
    // Apply label filter if specified
    let filteredIssues = allIssues;
    if (LINEAR_LABEL) {
      filteredIssues = await Promise.all(
        allIssues.map(async issue => {
          const labels = await issue.labels();
          const labelNodes = await labels.nodes;
          return { issue, hasLabel: labelNodes.some((label: IssueLabel) => label.name === LINEAR_LABEL) };
        })
      ).then(results => 
        results.filter(result => result.hasLabel).map(result => result.issue)
      );
    }
    
    console.log(`Retrieved ${filteredIssues.length} issues from Linear`);
    return filteredIssues;
    
  } catch (error) {
    console.error("Error fetching Linear issues:", error);
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
 * Format issue comments
 */
async function formatComments(issue: Issue): Promise<string> {
  try {
    const comments = await issue.comments();
    const commentNodes = await comments.nodes;
    
    if (commentNodes.length === 0) {
      return "No comments";
    }
    
    const formattedComments = await Promise.all(
      commentNodes.map(async (comment: Comment) => {
        const user = await comment.user;
        const createdAt = comment.createdAt;
        
        // Use the reactionData attribute to get reactions
        const reactionData = comment.reactionData;
        const reactionText = Object.keys(reactionData).length > 0 
          ? `\nReactions: ${Object.entries(reactionData).map(([key, value]) => `${key}: ${value}`).join(', ')}`
          : '';
        
        return `[${createdAt.toISOString()}] Author: ${user?.name || 'Unknown'} (${user?.email || 'No email'})
${comment.body}${reactionText}`;
      })
    );
    
    return formattedComments.join("\n");
  } catch (error) {
    console.error("Error formatting comments:", error);
    return "Error retrieving comments";
  }
}

/**
 * Format issue attachments
 */
async function formatAttachments(issue: Issue): Promise<string> {
  try {
    const attachments = await issue.attachments();
    const attachmentNodes = await attachments.nodes;
    
    if (attachmentNodes.length === 0) {
      return "No attachments";
    }
    
    const formattedAttachments = attachmentNodes.map((attachment: Attachment) => 
      `${attachment.title}: ${attachment.url}`
    );
    
    return formattedAttachments.join("\n");
  } catch (error) {
    console.error("Error formatting attachments:", error);
    return "Error retrieving attachments";
  }
}

/**
 * Format issue labels
 */
async function formatLabels(issue: Issue): Promise<string> {
  try {
    const labels = await issue.labels();
    const labelNodes = await labels.nodes;
    
    if (labelNodes.length === 0) {
      return "No labels";
    }
    
    return labelNodes.map((label: IssueLabel) => `${label.name}${label.description ? ` (${label.description})` : ''}`).join(", ");
  } catch (error) {
    console.error("Error formatting labels:", error);
    return "Error retrieving labels";
  }
}

/**
 * Format issue relations
 */
async function formatRelations(issue: Issue): Promise<string> {
  try {
    const relations = await issue.relations();
    const relationNodes = await relations.nodes;
    
    if (relationNodes.length === 0) {
      return "No relations";
    }
    
    const formattedRelations = await Promise.all(
      relationNodes.map(async (relation: IssueRelation) => {
        const relatedIssue = await relation.relatedIssue;
        if (!relatedIssue) {
          return 'Related issue not found';
        }
        return `${relation.type}: ${relatedIssue.identifier} - ${relatedIssue.title}`;
      })
    );
    
    return formattedRelations.join("\n");
  } catch (error) {
    console.error("Error formatting relations:", error);
    return "Error retrieving relations";
  }
}

/**
 * Format issue history
 */
async function formatHistory(issue: Issue): Promise<string> {
  try {
    const history = await issue.history();
    const historyNodes = await history.nodes;
    
    if (historyNodes.length === 0) {
      return "No history";
    }
    
    // Get the 10 most recent history items
    const recentHistory = historyNodes.slice(0, 10);
    
    const formattedHistory = await Promise.all(
      recentHistory.map(async (historyItem: IssueHistory) => {
        const user = await historyItem.actor;
        return `[${historyItem.createdAt.toISOString()}] ${user?.name || 'System'}: ${
          historyItem.fromState && historyItem.toState 
            ? `Changed status from "${historyItem.fromState}" to "${historyItem.toState}"`
            : 'Made changes'
        }`;
      })
    );
    
    return formattedHistory.join("\n");
  } catch (error) {
    console.error("Error formatting history:", error);
    return "Error retrieving history";
  }
}

/**
 * Format issue subscribers
 */
async function formatSubscribers(issue: Issue): Promise<string> {
  try {
    const subscribers = await issue.subscribers();
    const subscriberNodes = await subscribers.nodes;
    
    if (subscriberNodes.length === 0) {
      return "No subscribers";
    }
    
    return subscriberNodes.map((user: User) => `${user.name} (${user.email})`).join(", ");
  } catch (error) {
    console.error("Error formatting subscribers:", error);
    return "Error retrieving subscribers";
  }
}

/**
 * Format parent and sub-issues
 */
async function formatIssueHierarchy(issue: Issue): Promise<{parent: string, children: string}> {
  try {
    // Get parent issue if exists
    const parent = await issue.parent;
    const parentInfo = parent ? `${parent.identifier}: ${parent.title}` : "No parent issue";
    
    // Get children/sub-issues
    const children = await issue.children();
    const childNodes = await children.nodes;
    
    let childrenInfo = "No sub-issues";
    if (childNodes.length > 0) {
      childrenInfo = childNodes.map((child: Issue) => `${child.identifier}: ${child.title}`).join("\n");
    }
    
    return {
      parent: parentInfo,
      children: childrenInfo
    };
  } catch (error) {
    console.error("Error formatting issue hierarchy:", error);
    return {
      parent: "Error retrieving parent issue",
      children: "Error retrieving sub-issues"
    };
  }
}

/**
 * Format cycle information
 */
async function formatCycle(issue: Issue): Promise<string> {
  try {
    const cycle = await issue.cycle;
    
    if (!cycle) {
      return "Not assigned to any cycle";
    }
    
    return `${cycle.name} (${cycle.startsAt.toISOString()} to ${cycle.endsAt.toISOString()})`;
  } catch (error) {
    console.error("Error formatting cycle:", error);
    return "Error retrieving cycle";
  }
}

/**
 * Format milestone information
 */
async function formatMilestone(issue: Issue): Promise<string> {
  try {
    // Get project first
    const project = await issue.project;
    
    if (!project) {
      return "Not associated with any milestone";
    }
    
    // Get milestone from project
    const milestone = await project;
    
    if (!milestone) {
      return "Project not associated with any milestone";
    }
    
    return `${milestone.name} (${milestone.targetDate ? milestone.targetDate.toISOString().split('T')[0] : 'No target date'})`;
  } catch (error) {
    console.error("Error formatting milestone:", error);
    return "Error retrieving milestone";
  }
}

/**
 * Format linked documents
 */
async function formatDocuments(issue: Issue): Promise<string> {
  try {
    const documents = await linearClient.documents();
    const documentNodes = documents.nodes;
    
    // Filter documents that mention this issue
    const linkedDocs = documentNodes.filter((doc: Document) => 
      doc.content && doc.content.includes(issue.id)
    );
    
    if (linkedDocs.length === 0) {
      return "No linked documents";
    }
    
    return linkedDocs.map((doc: Document) => 
      `${doc.title}'}`
    ).join("\n");
  } catch (error) {
    console.error("Error formatting documents:", error);
    return "Error retrieving documents";
  }
}

/**
 * Get organization information
 */
async function getOrganizationInfo(): Promise<string> {
  try {
    const organization = await linearClient.organization;
    
    return `
Organization: ${organization.name}
Created: ${organization.createdAt.toISOString()}
`;
  } catch (error) {
    console.error("Error getting organization info:", error);
    return "Error retrieving organization information";
  }
}

/**
 * Upsert issue to Dust datasource
 */
async function upsertToDustDatasource(issue: Issue) {
  try {
    // Get related data
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
      issueHierarchy,
      cycle,
      milestone,
      documents,
      organizationInfo
    ] = await Promise.all([
      issue.team,
      issue.creator,
      issue.assignee,
      issue.project,
      issue.state,
      formatComments(issue),
      formatAttachments(issue),
      formatLabels(issue),
      formatRelations(issue),
      formatHistory(issue),
      formatSubscribers(issue),
      formatIssueHierarchy(issue),
      formatCycle(issue),
      formatMilestone(issue),
      formatDocuments(issue),
      getOrganizationInfo()
    ]);
    
    const documentId = `linear-issue-${issue.id}`;
    
    // Format the content for Dust
    const content = `
${organizationInfo}

Issue ID: ${issue.id}
Number: ${issue.number}
Identifier: ${issue.identifier}
Title: ${issue.title}
URL: ${issue.url}
Description:
${formatDescription(issue.description ?? 'No description provided')}

Team: ${team?.name || 'No team'} (${team?.key || 'No key'})
Project: ${project?.name || 'No project'}
State: ${state?.name || 'Unknown state'} (${state?.type || 'Unknown type'})
Priority: ${issue.priority} (${getPriorityLabel(issue.priority)})
Creator: ${creator?.name || 'Unknown'} (${creator?.email || 'No email'})
Assignee: ${assignee?.name || 'Unassigned'} (${assignee?.email || 'No email'})
Created: ${issue.createdAt.toISOString()}
Updated: ${issue.updatedAt.toISOString()}
Started At: ${issue.startedAt ? issue.startedAt.toISOString() : 'Not started'}
Completed At: ${issue.completedAt ? issue.completedAt.toISOString() : 'Not completed'}
Canceled At: ${issue.canceledAt ? issue.canceledAt.toISOString() : 'Not canceled'}
Auto Closed At: ${issue.autoClosedAt ? issue.autoClosedAt.toISOString() : 'Not auto-closed'}
Auto Archived At: ${issue.autoArchivedAt ? issue.autoArchivedAt.toISOString() : 'Not auto-archived'}
Due Date: ${issue.dueDate || 'No due date'}
Estimate: ${issue.estimate !== null ? issue.estimate : 'No estimate'} points
Completed Estimate: ${issue.completedAt ? (issue.estimate !== null ? issue.estimate : 'No estimate') : 'Not completed'}
Snoozed Until: ${issue.snoozedUntilAt ? issue.snoozedUntilAt.toISOString() : 'Not snoozed'}
Cycle: ${cycle}
Milestone: ${milestone}
Sub-Issue Count: ${issue.children?.length ?? 0}
Labels: ${labels}
Subscribers: ${subscribers}

Parent Issue: ${issueHierarchy.parent}

Sub-Issues:
${issueHierarchy.children}

Issue Relations:
${relations}

Linked Documents:
${documents}

Attachments:
${attachments}

Recent History:
${history}

Comments:
${comments}
`.trim();

    // Upsert to Dust
    await dustApi.post(
      `/w/${DUST_WORKSPACE_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
      {
        text: content,
        title: issue.title,
      }
    );
    
    console.log(`Upserted issue ${issue.identifier} to Dust datasource`);
  } catch (error) {
    console.error(
      `Error upserting issue ${issue.identifier} to Dust datasource:`,
      error
    );
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
 * Main function
 */
async function main() {
  try {
    const recentIssues = await getRecentlyUpdatedIssues();
    console.log(
      `Found ${recentIssues.length} issues matching the criteria.`
    );

    if (recentIssues.length === 0) {
      console.log("No issues to process. Exiting.");
      return;
    }

    // Use rate limiting to avoid hitting Dust API limits
    const limiter = new Bottleneck({
      maxConcurrent: LINEAR_MAX_CONCURRENT,
      minTime: 60 * 1000 / DUST_RATE_LIMIT,
    });

    const tasks = recentIssues.map((issue) =>
      limiter.schedule(() => upsertToDustDatasource(issue))
    );

    await Promise.all(tasks);
    console.log("All issues processed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

main(); 