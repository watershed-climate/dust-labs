# PagerDuty to Dust Sync

This script syncs PagerDuty on-call schedules to a Dust datasource, making the schedules searchable and accessible through Dust's API and interfaces.

## Overview

The script fetches all PagerDuty schedules for the next 30 days and creates/updates corresponding documents in a specified Dust datasource. Each schedule is converted to a structured text document containing:

- Schedule ID and name
- Description (if available)
- Time zone
- Detailed shift entries with:
  - Start and end times
  - On-call person's name and email

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A PagerDuty account with API access
- A Dust workspace with API access

## Installation

1. Clone the repository:

```bash
git clone git@github.com:dust-tt/dust-labs.git
cd dust-labs
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create a `.env` file in the project root with the following variables:

```
PAGERDUTY_API_KEY=your_pagerduty_api_key
DUST_API_KEY=your_dust_api_key
DUST_WORKSPACE_ID=your_workspace_id
DUST_VAULT_ID=your_vault_id
DUST_DATASOURCE_ID=your_datasource_id
```

## Environment Variables

| Variable             | Description                                    |
| -------------------- | ---------------------------------------------- |
| `PAGERDUTY_API_KEY`  | Your PagerDuty API key (v2)                    |
| `DUST_API_KEY`       | Your Dust API key                              |
| `DUST_WORKSPACE_ID`  | ID of your Dust workspace                      |
| `DUST_VAULT_ID`      | ID of the vault where documents will be stored |
| `DUST_DATASOURCE_ID` | ID of the datasource within the vault          |

## Usage

Run the script:

```bash
npm start
# or
yarn start
```

The script will:

1. Fetch all PagerDuty schedules for the next 30 days
2. Process each schedule and format it as a text document
3. Create or update documents in your Dust datasource
4. Handle rate limiting to avoid API throttling

## Features

- **Pagination**: Automatically handles PagerDuty's paginated responses
- **Rate Limiting**: Implements rate limiting to prevent API throttling
- **Error Handling**: Robust error handling for API calls
- **Automatic Document Updates**: Uses upsert functionality to create/update documents
- **Structured Content**: Creates well-formatted documents with clear sections

## Output Format

Each document in Dust will have the following structure:

```
Schedule ID: [ID]
Name: [Schedule Name]
Description: [Schedule Description]
Time Zone: [Time Zone]

# Schedule Entries

## Shift
Start: [Start DateTime]
End: [End DateTime]
On-Call: [Person Name] ([Email])

[Additional shifts...]
```

## Error Handling

The script includes comprehensive error handling for:

- Missing environment variables
- API request failures
- Rate limiting issues
- Data processing errors

All errors are logged to the console with relevant details.

## Limitations

- Currently fetches schedules for the next 30 days only
- Processes one schedule at a time to respect rate limits
- Requires appropriate API permissions in both PagerDuty and Dust

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details
