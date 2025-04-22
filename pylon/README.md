# Pylon to Dust Data Sync

This script is a Node.js application designed to sync Pylon issue data into Dust datasources. It fetches issues and accounts from Pylon, enriches issue data with corresponding account information, and uploads this to a specified Dust datasource.

## Usage Example

Example of issue summary added to the Dust datasource:

```
Pylon Issue Summary for 205b0e91-b8b6-424b-8c83-1adb2416f037: Enum options for legal form field

Metadata:
Issue Details:
ID: 205b0e91-b8b6-424b-8c83-1adb2416f037
State: closed
Domain: payset.co.uk
Account Type: customer

Dates & Times:
Created: 2025-04-21T10:50:00Z
Resolution: 2025-04-22T07:51:18Z

People:
Requester: (Unknown)
Assignee: (Unassigned)

CSAT Responses:

External Issues:

Description:
hey team, a question on the legal form field:
is is possible to have this field as an enum with predefined values set by us rather than an open text field?
for confirmation's sake, I'm referring to Legal form, not Entity legal form
```

## Features

- Configurable issue fetching by date range
- Enriches issues with account data
- Collects comprehensive issue metadata, including:
  - State, domain, account type
  - Dates and times
  - People involved (requester, assignee)
  - CSAT responses
  - External issues
  - Description
- Rate limiting for both Pylon and Dust APIs
- Detailed logging and error handling

## Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)
- Pylon account with API access
- Dust account with API access
- Create a folder and fetch its data source id (starts with dsv_)

## Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:dust-tt/dust-labs.git
   cd dust-labs
   cd pylon
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:

   ```
   # Required variables
   PYLON_API_KEY=your_pylon_api_key
   DUST_API_KEY=your_dust_api_key
   DUST_WORKSPACE_ID=your_workspace_id
   DUST_DATASOURCE_ID=your_datasource_id
   DUST_RATE_LIMIT=100
   PYLON_MAX_CONCURRENT=5

   # Optional filters
   PYLON_START_DATE=2024-01-01
   PYLON_END_DATE=2024-12-31
   ```

## Usage

To run the script:

```bash
npm run issues
```

The script will:
1. Validate environment variables and configuration
2. Fetch Pylon issues and accounts (with optional date filters)
3. Enrich issues with account information
4. Upload formatted data to your Dust datasource

## How It Works

1. The script connects to Pylon using the provided API key
2. It fetches issues within the specified date range (if configured)
3. It fetches all accounts and maps them to issues
4. The data is formatted into a hierarchical document structure
5. The formatted documents are upserted to the specified Dust datasource
6. Rate limiting is applied to respect both Pylon and Dust API constraints

## Error Handling

The script includes comprehensive error handling:
- Validates required environment variables
- Handles API rate limits
- Provides detailed error logging
- Continues processing on individual issue failures

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
