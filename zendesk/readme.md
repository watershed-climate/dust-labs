# Zendesk to Dust Data Sync

This script syncs ticket data from Zendesk to a Dust datasource. It retrieves tickets updated in the last 24 hours, along with their comments and user information, and upserts this data to a specified Dust datasource.

## Features

- Fetches tickets updated in the last 24 hours from Zendesk
- Retrieves detailed ticket information, comments, and user data
- Handles Zendesk API rate limiting
- Upserts formatted ticket data to a Dust datasource

## Prerequisites

- Node.js (v14 or later recommended)
- A Zendesk account with API access
- A Dust account with API access
- A way to run this script on your side every 24h (cron, etc.)

## Setup

1. Clone this repository:
   \```
   git clone https://github.com/your-username/zendesk-to-dust-sync.git
   cd zendesk-to-dust-sync
   \```

2. Create a `.env` file in the project root with the following variables:
   \```
   ZENDESK_SUBDOMAIN=your-zendesk-subdomain
   ZENDESK_EMAIL=your-zendesk-email
   ZENDESK_API_TOKEN=your-zendesk-api-token
   DUST_API_KEY=your-dust-api-key
   DUST_WORKSPACE_ID=your-dust-workspace-id
   DUST_DATASOURCE_ID=your-dust-datasource-id
   \```

   Replace the values with your actual Zendesk and Dust credentials.

## Usage

Run the script using:

\```
npx tsx zendesk.ts
\```

The script will:
1. Fetch tickets updated in the last 24 hours from Zendesk
2. Retrieve detailed information for each ticket, including comments and user data
3. Format the data
4. Upsert the formatted data to your specified Dust datasource

## Customization

You can adjust the `TICKETS_UPDATED_SINCE` constant in the script to change the time range for fetching updated tickets. The default is set to 24 hours ago.

## Regular Execution

It's recommended to run this script regularly to keep your Dust datasource up-to-date with your Zendesk data. You can set up a cron job or use a task scheduler to run the script at your preferred interval.

For example, to run the script daily, you could set up a cron job like this:

\```
0 1 * * * cd /path/to/zendesk-to-dust-sync && /usr/bin/npx tsx zendesk.ts >> /path/to/logfile.log 2>&1
\```

This would run the script every day at 1:00 AM.

Remember to adjust the `TICKETS_UPDATED_SINCE` constant in the script to match your execution interval. For example, if you're running the script daily, you might want to set it to fetch tickets updated in the last 25 hours to ensure no tickets are missed due to potential delays or timezone differences.

## Error Handling

The script includes basic error handling and logging. Check the console output for any errors or warnings during execution.

## Rate Limiting

The script respects Zendesk's rate limits and will pause if the rate limit is exceeded. If you encounter frequent rate limit errors, consider increasing the interval between script executions.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Dust documentation

You can find more information about Dust in the [Dust documentation](https://docs.dust.tt).
