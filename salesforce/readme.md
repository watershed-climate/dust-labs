# Salesforce to Dust Data Sync

This script synchronizes account data from Salesforce to Dust, updating a specified Dust datasource with the latest account information. It's designed to run periodically, fetching recently updated accounts and their related data from Salesforce, then formatting and uploading this information to Dust.

## Usage example
![Example usage of the script](https://i.ibb.co/PCHQcqv/Screenshot-2024-08-20-at-09-15-30.png)

Example of account summary added to the Dust datasource: 

```
Account Summary for Burlington Textiles Corp of America

Basic Account Details:
Company Name: Burlington Textiles Corp of America
Industry: Apparel
Annual Revenue: $350,000,000
Number of Employees: 9000
Phone: (336) 222-7000
Website: www.burlington.com

Locations:
Billing Address: 525 S. Lexington Ave, Burlington, NC, 27215, USA
Shipping Address: 

Key Contacts:
No contacts found

Account Status:
Type: Customer - Direct
Rating: Warm
Account Source: N/A
Created Date: 2022-10-17T08:54:06.000+0000
Last Modified Date: 2022-10-17T08:54:06.000+0000
Last Activity Date: 2022-11-23

Sales Information:
Open Opportunities:
- Express Logistics Portable Truck Generators
    Stage: Qualification, Amount: $8,889, Close Date: 2024-11-23
    Last Modified: 2024-08-19T14:06:45.000+0000

Account Health:
Recent Support Cases:
No recent support cases

Additional Information:
No additional information provided.
```

## Features

- Supports both username/password and OAuth 2.0 authentication methods for Salesforce
- Fetches accounts updated in the last 24 hours
- Retrieves detailed account information, including related contacts, opportunities, and cases
- Formats account data into a comprehensive summary
- Uploads the formatted data to a specified Dust datasource
- Processes accounts in batches to handle large volumes of data efficiently

## Prerequisites

- Node.js (v14 or later recommended)
- npm (Node Package Manager)
- A Salesforce account with API access
- A Dust account with API access
- Necessary environment variables (see Configuration section)

## Installation

1. Clone this repository:
   ```bash
   git clone git@github.com:dust-tt/dust-labs.git
   cd dust-labs/salesforce
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Create a `.env` file in the root directory of the project with the following variables:

```env
SF_LOGIN_URL=your_sfdc_login_url
DUST_API_KEY=your_dust_api_key
DUST_WORKSPACE_ID=your_dust_workspace_id
DUST_DATASOURCE_ID_SALESFORCE=your_dust_datasource_id

# For username/password authentication:
SF_USERNAME=your_salesforce_username
SF_PASSWORD=your_salesforce_password
SF_SECURITY_TOKEN=your_salesforce_security_token

# For OAuth 2.0 authentication:
SF_CLIENT_ID=your_salesforce_client_id
SF_CLIENT_SECRET=your_salesforce_client_secret
```

Choose either the username/password or OAuth 2.0 authentication method and set the corresponding variables.

## Usage

Run the script with:

```bash
npx tsx sfdc-accounts-to-dust.ts
```

The script will:
1. Connect to Salesforce using the provided credentials
2. Fetch accounts updated in the last 24 hours
3. Retrieve detailed information for each account
4. Format the account data into a comprehensive summary
5. Upload the formatted data to the specified Dust datasource

## Customization

### Modifying the Time Range

To change the time range for fetching updated accounts, modify the `UPDATED_SINCE` constant in the script:

```typescript
const UPDATED_SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
```

### Adjusting Batch Size

The script processes accounts in batches to avoid hitting Salesforce API limits. To adjust the batch size, modify the `batchSize` variable in the `main` function:

```typescript
const batchSize = 200; // Change this value as needed
```

### Customizing Account Summary Format

To modify the format of the account summary uploaded to Dust, edit the `upsertToDustDatasource` function. The `content` variable contains the template for the account summary.

## Error Handling

The script includes basic error handling and logging. Errors are logged to the console. For production use, consider implementing more robust error handling and logging mechanisms.

## Security Considerations

- Never commit your `.env` file or any files containing sensitive information to version control.
- Use environment variables or a secure secrets management system for storing credentials in production environments.
- Regularly rotate your Salesforce and Dust API keys and tokens.
- Ensure your Salesforce Connected App has the minimum required permissions.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
