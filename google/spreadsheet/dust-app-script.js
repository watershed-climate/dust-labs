// Google Sheets plugin for interacting with the Dust API.
// Ensure you replace the placeholder values with your actual Dust API credentials.

const WORKSPACE_ID = "DUST_WORKSPACE_ID"; // Your workspace ID from Dust
const API_KEY = "DUST_API_KEY"; // Your API key from Dust

// Base URL for the Dust API.
const BASE_URL = `https://dust.tt/api/v1/w/${WORKSPACE_ID}`;

// Base URL for viewing conversations in the Dust App.
const CONVERSATION_APP_BASE_URL = `https://dust.tt/w/${WORKSPACE_ID}/assistant`;

const ERROR_PREFIX = "Error:";

/**
 * Interact with a Dust assistant.
 *
 * @param {string} assistantName - The name of the Dust assistant to interact with.
 * @param {string} prompt - The user's prompt or question.
 * @param {string|Array<Array<string>>} input - The single cell value or range of cells to use.
 * @return {string} The assistant's response or an error message.
 * @customfunction
 */
/**
 * Interact with a Dust assistant.
 *
 * @param {string} assistantName - The name of the Dust assistant to interact with.
 * @param {string} prompt - The user's prompt or question.
 * @param {string|Array<Array<string>>} input - The single cell value or range of cells to use.
 * @return {string} The assistant's response or an error message.
 * @customfunction
 */
function DUST(
  assistantName = "SecuritySam",
  prompt = "answer",
  input = "are you soc2"
) {
  // Create a cache key based on the cell location
  const cacheKey = createCacheKey();

  // Try to get the cached result and metadata
  const cache = CacheService.getDocumentCache();
  const cachedData = cache.get(cacheKey);

  if (cachedData != null) {
    const { result, timestamp, lastArgs } = JSON.parse(cachedData);
    const currentArgs = JSON.stringify({ assistantName, prompt, input });

    // If the arguments haven't changed, return the cached result
    if (lastArgs === currentArgs) {
      return result;
    }
  }

  let concatenatedInput;

  if (Array.isArray(input)) {
    concatenatedInput = input.map((row) => row.join(" ")).join("\n");
  } else {
    concatenatedInput = input;
  }

  try {
    const assistantId = findAssistant(assistantName);
    if (!assistantId) {
      return wrapWithError(`Assistant "${assistantName}" not found.`);
    }

    const content = createConversationAndGetContent(
      assistantId,
      prompt,
      concatenatedInput
    );
    if (!content) {
      return wrapWithError(
        "Failed to create conversation or retrieve response."
      );
    }

    // Store the result, timestamp, and current arguments in cache
    const cacheData = JSON.stringify({
      result: content,
      timestamp: new Date().getTime(),
      lastArgs: JSON.stringify({ assistantName, prompt, input }),
    });
    cache.put(cacheKey, cacheData, 21600); // Cache for 6 hours (21600 seconds)

    return content;
  } catch (error) {
    console.error("Error in DUST function:", error);
    return wrapWithError(
      "An unexpected error occurred. Please check the logs."
    );
  }
}

/**
 * Create a unique cache key based on the cell location.
 *
 * @return {string} A unique cache key.
 */
function createCacheKey() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cell = sheet.getActiveCell();
  return `DUST_${sheet.getName()}_${cell.getA1Notation()}`;
}

/**
 * Retrieve the ID of the specified assistant.
 *
 * @param {string} assistantName - Name of the assistant to find.
 * @return {string|null} The assistant ID if found, null otherwise.
 */
function findAssistant(assistantName) {
  const url =
    `${BASE_URL}/assistant/agent_configurations/search?q=` + assistantName;
  const options = {
    method: "get",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    muteHttpExceptions: true, // Allows handling HTTP errors manually.
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      console.error(`HTTP error: Received status code ${statusCode}`);
      return null;
    }

    const responseText = response.getContentText();
    if (!responseText) {
      console.error("API response is empty");
      return null;
    }

    const result = JSON.parse(responseText);
    if (!result || !result.agentConfigurations.length) {
      console.log("No assistants found in the API response");
      return null;
    }

    const assistant = result.agentConfigurations[0];
    if (!assistant) {
      console.log(`Assistant "${assistantName}" not found.`);
      return null;
    }

    return assistant.sId;
  } catch (error) {
    console.error(`Error in searchAssistant: ${error}`);
    return null;
  }
}

/**
 * Create a new conversation with the specified Dust assistant and retrieve the last agent message content.
 *
 * @param {string} assistantId - ID of the assistant to interact with.
 * @param {string} prompt - User's prompt or question.
 * @param {string} input - Input from the specified cell.
 * @return {string|null} The content of the assistant's response, or null on failure.
 */
function createConversationAndGetContent(assistantId, prompt, input) {
  const url = `${BASE_URL}/assistant/conversations`;
  const payload = {
    message: {
      content: `${prompt}\nInput: ${input}`,
      mentions: [{ configurationId: assistantId }],
      context: {
        username: "gsheet",
        timezone: Session.getScriptTimeZone(),
        fullName: "Google Sheets User",
        email: "user@example.com",
        profilePictureUrl: "",
        origin: "gsheet",
      },
    },
    blocking: true,
    title: "Google Sheets Conversation",
    visibility: "unlisted",
  };

  const options = {
    method: "post",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(payload),
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    const { sId: conversationId, content } = result.conversation;

    return getLastAgentMessageContent(conversationId, content);
  } catch (error) {
    console.error(`Error in createConversationAndGetContent: ${error}`);
    return null;
  }
}

/**
 * Retrieve the latest message content from the assistant.
 *
 * @param {string} conversationId - ID of the conversation.
 * @param {Array} content - Content array from the conversation.
 * @return {string} The assistant's response or an error message.
 */
function getLastAgentMessageContent(conversationId, content) {
  const appConversationLink = `${CONVERSATION_APP_BASE_URL}/${conversationId}`;
  const wrapErrorWithConversationLink = (text) =>
    createLink(appConversationLink, `${ERROR_PREFIX} ${text}`);

  const lastAgentMessage = content
    .flat()
    .reverse()
    .find(({ type }) => type === "agent_message");

  if (!lastAgentMessage) {
    return wrapErrorWithConversationLink("No agent message found.");
  }

  return lastAgentMessage.status === "succeeded"
    ? lastAgentMessage.content
    : wrapErrorWithConversationLink("No assistant response found.");
}

/**
 * Create a hyperlink in Google Sheets.
 *
 * @param {string} url - The URL to link to.
 * @param {string} text - The text to display for the link.
 * @return {string} A Google Sheets hyperlink formula.
 */
function createLink(url, text) {
  return `=HYPERLINK("${url}", "${text}")`;
}

/**
 * Wrap an error message with a standardized prefix.
 *
 * @param {string} msg - The error message to wrap.
 * @return {string} The wrapped error message.
 */
function wrapWithError(msg) {
  return `${ERROR_PREFIX} ${msg}`;
}
