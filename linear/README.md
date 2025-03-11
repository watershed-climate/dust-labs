# Linear to Dust Integration

This script imports Linear issues into a Dust datasource, making them searchable and accessible through Dust's AI capabilities.

## Features

This integration captures comprehensive data from Linear, including:

- **Issue Details**: ID, number, title, description, priority, estimates, dates, etc.
- **Relationships**: Parent/child issues, issue relations, linked documents
- **Team Context**: Team, project, milestone, cycle information
- **People**: Creator, assignee, subscribers
- **Activity**: Comments with reactions, issue history, attachments
- **Organization**: Organization name, URL, and creation date
- **Status Tracking**: Current state, completion dates, cancellation info
- **Labels and Tags**: All associated labels with descriptions

## Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Linear API key
- Dust API key, workspace ID, and datasource ID

## Setup

1. Clone this repository
2. Navigate to the `linear` directory
3. Install dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn install
   ```
4. Copy the example environment file:
   ```
   cp example.env .env
   ```
5. Edit the `.env` file and fill in your API keys and other required information:
   ```
   LINEAR_API_KEY=your_linear_api_key
   DUST_API_KEY=your_dust_api_key
   DUST_WORKSPACE_ID=your_dust_workspace_id
   DUST_DATASOURCE_ID=your_dust_datasource_id
   ```

## Usage

By default, the script imports Linear issues updated in the last 24 hours. You can change this by setting the `LINEAR_UPDATED_SINCE` variable in your `.env` file (see [Time Configuration](#time-configuration) below).

Run the script:

```
npm run issues
```

or

```
yarn issues
```

## Configuration Options

You can customize the script behavior by setting these environment variables in your `.env` file:

### Time Configuration

The time period for fetching issues is fully configurable using the `LINEAR_UPDATED_SINCE` variable:

```
LINEAR_UPDATED_SINCE=24h  # Default: fetch issues updated in the last 24 hours
```

You can use these formats:
- Hours: `12h`, `24h`, `48h`, etc.
- Days: `1d`, `7d`, `30d`, etc.

Examples:
- `LINEAR_UPDATED_SINCE=12h` - Fetch issues updated in the last 12 hours
- `LINEAR_UPDATED_SINCE=3d` - Fetch issues updated in the last 3 days
- `LINEAR_UPDATED_SINCE=14d` - Fetch issues updated in the last 2 weeks

### Issue Filters
- `LINEAR_TEAM_KEY`: Filter issues by team key (e.g., "ENG")
- `LINEAR_PROJECT_ID`: Filter issues by project ID
- `LINEAR_STATE`: Filter issues by state name (e.g., "In Progress", "Done")
- `LINEAR_LABEL`: Filter issues by label name (e.g., "bug", "feature")

### Rate Limiting
- `DUST_RATE_LIMIT`: Maximum requests per minute to Dust API (default: 120)
- `LINEAR_MAX_CONCURRENT`: Maximum concurrent requests to Linear API (default: 5)

## Filtering Examples

To import only bugs from the Engineering team updated in the last 3 days:

```
LINEAR_UPDATED_SINCE=3d
LINEAR_TEAM_KEY=ENG
LINEAR_LABEL=bug
```

To import only completed issues from a specific project:

```
LINEAR_STATE=Done
LINEAR_PROJECT_ID=your_project_id
```

## How It Works

1. The script authenticates with Linear using your API key
2. It fetches all issues updated within the specified time period (configurable via `LINEAR_UPDATED_SINCE`)
3. It applies any additional filters (team, project, state, label)
4. For each issue, it retrieves comprehensive related data:
   - Basic issue information (title, description, priority, etc.)
   - Team and project context
   - Assignee and creator details
   - Comments and reactions
   - Issue relations and hierarchy (parent/child issues)
   - Issue history and status changes
   - Cycle and milestone information
   - Labels and subscribers
5. It formats the issue data into a structured text document
6. It uploads each document to your Dust datasource

## Data Structure

Each issue is formatted as a structured text document with sections for:

- Organization information
- Basic issue details
- Team and project context
- People (creator, assignee, subscribers)
- Dates (created, updated, completed, etc.)
- Issue hierarchy (parent and sub-issues)
- Related issues
- Attachments
- Recent history
- Comments with reactions

## Troubleshooting

- **Rate Limiting**: The script includes rate limiting to avoid hitting API limits. If you're processing a large number of issues, it may take some time to complete.
- **Authentication Errors**: Double-check your API keys in the `.env` file.
- **Missing Data**: Some fields may be empty if they don't exist in Linear or if permissions are insufficient.
- **Filtering Issues**: If you're not seeing expected results, check that your filter values match exactly what's in Linear.
