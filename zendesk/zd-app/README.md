# Dust.tt AI Agent Zendesk App

This Zendesk App allows you to converse with Dust.tt AI agents directly within your Zendesk interface. It provides a seamless integration between your customer support workflow and the powerful AI capabilities of Dust.tt.

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Features](#features)
4. [Usage](#usage)
5. [Troubleshooting](#troubleshooting)

## Installation

To install this Zendesk App, follow these steps:

2. Log in to your Zendesk account as an administrator.
3. Navigate to the Admin Center > Apps > Manage.
4. Go to the app marketplace and search for "Dust".
5. Currently, the app is in preview only so contact us at support@dust.tt if you want to try it out.

## Configuration

After installation, you need to configure the app with your Dust.tt credentials:

1. In the Zendesk Admin Center, go to Apps > Manage.
2. Find the Dust app and click on it.
3. In the app settings, enter your Dust API key and Workspace ID and your Dust workspace region.
4. Save the changes.

Make sure that the users who will be using this app have valid Dust.tt accounts associated with their Zendesk email addresses.

## Features

- Select from available Dust.tt AI agents within your workspace.
- Send ticket information and user queries to the selected AI agent.
- View AI-generated responses directly in the Zendesk interface.
- Insert AI-generated answers into the ticket editor with a single click.
- Persistent selection of the last used AI agent.
- Markdown support for rich text formatting in AI responses.

## Usage

1. Open a ticket in Zendesk.
2. In the app panel, select an AI agent from the dropdown menu.
3. Type your query or request in the text area.
4. Click the "Send to Dust" button or press Enter to submit.
5. Wait for the AI to generate a response.
6. Review the AI-generated answer.
7. Click "Use answer" to insert the response into the ticket editor.

### Notes:

- The app will automatically include relevant ticket information when sending queries to the AI.
- Previous messages in the current session are included for context.
- You can resize the app panel as needed.

## Troubleshooting

If you encounter issues:

- Ensure your Dust.tt API key and Workspace ID are correctly configured.
- Verify that your Zendesk email is associated with a valid Dust.tt account.
- Check your browser console for any error messages.
- Try refreshing the Zendesk page or restarting your browser.

For security reasons, API requests are made through Zendesk's secure proxy to protect your Dust.tt credentials.

If you encounter any issues or have questions, ask in the Dust community support: https://community.dust.tt
