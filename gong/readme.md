# Gong Transcript To Dust Datasource Exporter

## Example
![Example usage of the script](https://i.ibb.co/2s8yVC6/Screenshot-2024-08-30-at-11-59-13.png)

Example of transcripts added to the Dust datasource: 

```
Call ID: 337227464136619733
Title: Acme Corp and Dust
Scheduled: 2024-05-31T16:04:27.585874+02:00
Started: 2024-05-31T16:07:49.765+02:00
Duration: 1476 seconds
Direction: Conference
System: Google Meet
Scope: External
Media: Video
Language: fre

Participants:
- Alban Dumouilla (alban@dust.tt), Affiliation: Internal
- John Doe, Affiliation: Unknown

Transcript:

John Doe: Also see if there are possible integrations with Slack to summarize channels, discussions, things like that.

Alban Dumouilla: We're completely on Slack. Thanks, that's very relevant to us. Regarding the connectors we have today, you have Slack, Notion, Google Drive. Those are the main things you just mentioned. We also have GitHub, Intercom. I don't know if you use it, and Confluence. So if you use Notion, and you use Confluence, what's your CRM generally?

John Doe: We have the most well-known one, Salesforce... no, sorry, HubSpot. HubSpot for startups.

Alban Dumouilla: Do you have a ticketing system for clients?

John Doe: I don't work, I'm on the product side so I don't use HubSpot at all. But I imagine that yes, it's also a tag?

Alban Dumouilla: For now we don't have one, but we're looking into it. There's a chance we'll integrate Zendesk quite soon.

John Doe: Yes, because we have Zendesk too.

Alban Dumouilla: Okay, Zendesk works. I can, I've already done demos for if you have a help center or something like that in Zendesk for your customer support. We already have something that works. It's not a connector but it's via a desktop. I'm doing blog posts about it, I could be...
```

## Description

This script imports Gong transcripts to Dust datasources. It retrieves detailed call information and transcripts from the Gong API, processes the data, and then uploads it to Dust in a structured format.

## Features

- Fetches transcripts from Gong API
- Retrieves extensive call data for each transcript
- Processes and formats the data
- Uploads formatted transcripts to a Dust datasource
- Handles pagination for large datasets
- Implements rate limiting to avoid API throttling
- Supports parallel processing for improved performance

## Prerequisites

- Node.js (v14 or later recommended)
- npm (comes with Node.js)
- A Gong account with API access
- A Dust account with API access

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/your-username/gong-transcript-exporter.git
   ```

2. Navigate to the project directory:
   ```
   cd gong-transcript-exporter
   ```

3. Install the required dependencies:
   ```
   npm install
   ```

## Configuration

Create a `.env` file in the root directory of the project with the following contents:

```
GONG_BASE_URL=your_gong_base_url
GONG_ACCESS_KEY=your_gong_access_key
GONG_ACCESS_KEY_SECRET=your_gong_access_key_secret
DUST_API_KEY=your_dust_api_key
DUST_WORKSPACE_ID=your_dust_workspace_id
DUST_DATASOURCE_ID=your_dust_datasource_id
```

Replace the placeholder values with your actual Gong and Dust credentials.

## Usage

To run the script, use the following command:

```
npm run transcripts
```

This command executes the `gong-transcripts-to-dust.ts` file using `ts-node`.

## Customization

- `THREADS_NUMBER`: Adjust the number of parallel threads in the script to optimize performance based on your system capabilities and API rate limits.
- `TRANSCRIPTS_SINCE`: Modify this constant to change the date from which transcripts are fetched. Set to `null` to fetch all available transcripts.

## Output

The script will create or update documents in your specified Dust datasource. Each document will contain:

- Call metadata (ID, title, scheduled time, start time, duration, direction, system, scope, media type, language)
- Participant information
- The full transcript of the call, with speakers identified

## Error Handling

The script includes error handling for API rate limits and other common issues. If an error occurs, it will be logged to the console.

## Dependencies

- axios: ^1.4.0
- dotenv: ^16.0.3
- p-limit: ^3.1.0

## Dev Dependencies

- @types/node: ^18.16.3
- ts-node: ^10.9.1
- typescript: ^5.0.4

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.

## Disclaimer

This script is not officially associated with Gong or Dust. Use it at your own risk and ensure you comply with the terms of service for both Gong and Dust APIs.

## Support

If you encounter any problems or have any questions, please open an issue in this repository.
