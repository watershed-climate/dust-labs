# Mayday to Dust Import

This script imports knowledge base articles from Mayday into a Dust datasource. It fetches all published articles from Mayday's API and upserts them into a specified Dust datasource.

## Installation

1. Clone this repository:

   ```bash
   git clone git@github.com:dust-tt/dust-labs.git
   cd mayday-to-dust-import
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```
   MAYDAY_CLIENT_ID=your_mayday_client_id
   MAYDAY_CLIENT_SECRET=your_mayday_client_secret
   DUST_API_KEY=your_dust_api_key
   DUST_WORKSPACE_ID=your_dust_workspace_id
   DUST_DATASOURCE_ID=your_dust_datasource_id
   ```

   Replace the placeholders with your actual credentials and IDs.

## Usage

Run the import script:

```bash
npm run import
```

This will start the import process, fetching articles from Mayday and upserting them into your Dust datasource.

## What the Script Does

1. **Environment Setup**: The script first checks for required environment variables and sets up API configurations for both Mayday and Dust.

2. **Rate Limiting**: It uses Bottleneck to implement rate limiting for both Mayday and Dust API calls to avoid overwhelming the servers.

3. **Authentication**: The script obtains an access token from Mayday using the provided client credentials.

4. **Fetching Articles**: It retrieves all published articles from Mayday, paginating through the results.

5. **Processing and Upserting**: For each article, the script formats the content and upserts it into the specified Dust datasource.

6. **Error Handling and Logging**: The script includes error handling and logging to help diagnose issues during the import process.

## Script Details

- `getAccessToken()`: Obtains an access token from Mayday API.
- `getAllContents()`: Fetches all published articles from Mayday, handling pagination.
- `upsertToDustDatasource()`: Formats and upserts a single article to the Dust datasource.
- `main()`: Orchestrates the entire import process.

## Configuration

You can adjust the following parameters in the script:

- `limit` in `getAllContents()`: Number of articles to fetch per page from Mayday.
- Rate limiting settings in `maydayLimiter` and `dustLimiter`.

## Error Handling

The script includes error handling for API calls and will log any errors encountered during the process. If an error occurs while upserting an article to Dust, the script will log the error and continue with the next article.

## Dependencies

- axios: For making HTTP requests
- dotenv: For loading environment variables
- bottleneck: For rate limiting API calls

## Development

To lint the code:

```bash
npm run lint
```

To build the TypeScript code:

```bash
npm run build
```

## Notes

- Ensure you have the necessary permissions and API access for both Mayday and Dust before running the script.
- The script is set to fetch only published articles of type "Article". Modify the parameters in `getAllContents()` if you need different criteria.
- The script formats the article content to include metadata such as title, creation date, and update date. Adjust the formatting in `upsertToDustDatasource()` if needed.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

If you encounter any issues or have questions, ask in the Dust community support: https://community.dust.tt
