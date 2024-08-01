# Zendesk Ticket Exporter for Dust

This script exports Zendesk tickets updated in the last 24 hours to a Dust datasource. It retrieves ticket details, comments, user information, and custom statuses from Zendesk, then formats and uploads this data to Dust.

## Features

- Fetches tickets updated in the last 24 hours from Zendesk
- Retrieves full ticket details, including comments and user information
- Handles custom ticket statuses
- Manages API rate limits with built-in retries
- Uploads formatted ticket data to a Dust datasource
- Provides detailed logging of the export process

## Prerequisites

- Node.js (v14 or later recommended)
- npm (comes with Node.js)
- A Zendesk account with API access
- A Dust account with API access
- A way to run this script on your side every 24h (cron, etc.)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/zendesk-ticket-exporter-for-dust.git
   cd zendesk-ticket-exporter-for-dust
   ```

2. Install the required dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root with the following content:
   ```
   ZENDESK_SUBDOMAIN=your_zendesk_subdomain
   ZENDESK_EMAIL=your_zendesk_email
   ZENDESK_API_TOKEN=your_zendesk_api_token
   DUST_API_KEY=your_dust_api_key
   DUST_WORKSPACE_ID=your_dust_workspace_id
   DUST_DATASOURCE_ID=your_dust_datasource_id
   ```

   Replace the placeholders with your actual Zendesk and Dust credentials.

## Usage

Run the script with:

```
npm start
```

or

```
node index.js
```

The script will:
1. Fetch all tickets updated in the last 24 hours from Zendesk
2. Retrieve full details for each ticket, including comments and user information
3. Format the ticket data
4. Upload the formatted data to your specified Dust datasource

Progress and any errors will be logged to the console.

## Configuration

You can modify the following aspects of the script by editing the code:

- Time range for ticket retrieval (default is last 24 hours)
- Batch size for ticket retrieval (default is 100)
- Format of the data uploaded to Dust

## Rate Limiting

The script includes built-in handling for Zendesk's rate limits. If a rate limit is reached, the script will pause for 60 seconds before retrying. Rate limit information is logged to the console for each API call.

## Error Handling

The script includes basic error handling:
- API errors are logged to the console
- Rate limit errors trigger a retry after a 60-second wait
- Other errors will cause the script to exit

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This script is not officially associated with Zendesk or Dust. Use at your own risk.

## Support

If you encounter any problems or have any questions, please open an issue in this repository.
