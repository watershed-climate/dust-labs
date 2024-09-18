function convertMarkdownToHtml(markdown) {
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
    .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2' target='_blank'>$1</a>")
    .replace(/`(.*?)`/gim, "<code>$1</code>")
    .replace(/```([\s\S]*?)```/g, (match, p1) => '<pre><code>' + p1.trim() + '</code></pre>')
    .replace(/(?:\r\n|\r|\n)/g, '<br>')
    .replace(/:cite\[[^\]]+\]/g, '');
}

(async function() {
  const client = ZAFClient.init();
  const isProd = true;
  window.client = client;
  window.useAnswer = useAnswer; 

  try {
    await client.on('app.registered');
    await loadAssistants();
    hideLoadingSpinner();
    showAssistantSelect();
    restoreSelectedAssistant();
    toggleInputVisibility();
  } catch (error) {
    hideLoadingSpinner();
    showErrorMessage(error.message || 'Failed to load assistants. Please try again later.');
  }

  await client.invoke('resize', { width: '100%', height: '400px' });

  const sendToDustButton = document.getElementById('sendToDustButton');
  const userInput = document.getElementById('userInput');

  sendToDustButton.addEventListener('click', handleSubmit);

  userInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  });

  userInput.addEventListener('input', autoResize);

  function autoResize() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  }

  async function handleSubmit() {
    try {
      const data = await client.get('ticket');
      sendTicketToDust(data.ticket);
    } catch (error) {
      console.error('Error getting ticket data:', error);
    }
  }

  function toggleInputVisibility() {
    const selectElement = document.getElementById('assistantSelect');
    const inputWrapper = document.getElementById('inputWrapper');
    
    inputWrapper.style.display = selectElement.value ? 'block' : 'none';
  }

  async function checkUserValidity(dustWorkspaceId, dustApiKey, userEmail) {
    console.log('CHECKING USER EMAIL', userEmail);
    const validationUrl = `https://dust.tt/api/v1/w/${dustWorkspaceId}/members/validate`;
    const options = {
      url: validationUrl,
      type: 'POST',
      headers: {
        'Authorization': `Bearer ${dustApiKey}`,
      },
      secure: isProd,
      data: { email: userEmail },
    };

    try {
      const response = await client.request(options);
      if (response && response.valid) {
        console.log('User is valid:', response);
        return true;
      } else {
        console.error('User is not valid:', response);
        return false;
      }
    } catch (error) {
      console.error('Error validating user:', error);
      return false;
    }
  }

  async function loadAssistants() {
    const metadata = await client.metadata();
    const dustApiKey = isProd ? "{{setting.dust_api_key}}" : metadata.settings.dust_api_key;
    const dustWorkspaceId = isProd ? "{{setting.dust_workspace_id}}" : metadata.settings.dust_workspace_id;

    const userData = await client.get('currentUser');
    const userEmail = userData.currentUser.email;

    const isValid = await checkUserValidity(dustWorkspaceId, dustApiKey, userEmail);
    if (!isValid) {
      throw new Error('You need a Dust.tt account to use this app. Please contact your administrator to enable access to Dust');
    }

    const authorization = `Bearer ${dustApiKey}`;
    const assistantsApiUrl = `https://dust.tt/api/v1/w/${dustWorkspaceId}/assistant/agent_configurations`;
    
    const options = {
      url: assistantsApiUrl,
      type: 'GET',
      headers: {
        'Authorization': authorization,
      },
      secure: isProd,
    };

    const response = await client.request(options);
    if (response && response.agentConfigurations && Array.isArray(response.agentConfigurations)) {
      const assistants = response.agentConfigurations;

      if (assistants.length === 0) {
        throw new Error('No assistants found');
      }

      const selectElement = document.getElementById('assistantSelect');
      assistants.forEach((assistant) => {
        if (assistant && assistant.sId && assistant.name) {
          const option = new Option(`@${assistant.name}`, assistant.sId);
          selectElement.appendChild(option);
        }
      });

      $(selectElement).select2({
        placeholder: 'Select an assistant',
        allowClear: true
      }).on('change', (e) => {
        localStorage.setItem('selectedAssistant', e.target.value);
        toggleInputVisibility();
      });
    } else {
      throw new Error('Unexpected API response format');
    }
  }

  function hideLoadingSpinner() {
    document.getElementById('loadingSpinner').style.display = 'none';
  }

  function showAssistantSelect() {
    document.getElementById('assistantSelect').style.display = 'block';
  }

  function showErrorMessage(message) {
    const errorElement = document.createElement('div');
    errorElement.textContent = message;
    errorElement.style.color = 'grey';
    errorElement.style.textAlign = 'center';
    document.getElementById('assistantSelectWrapper').appendChild(errorElement);
  }

  function restoreSelectedAssistant() {
    const savedAssistant = localStorage.getItem('selectedAssistant');
    if (savedAssistant) {
      const selectElement = document.getElementById('assistantSelect');
      $(selectElement).val(savedAssistant).trigger('change');
    }
  }

  async function sendTicketToDust(ticket) {
    const dustResponse = document.getElementById('dustResponse');
    const userInput = document.getElementById('userInput');
  
    try {
      const metadata = await client.metadata();
      const dustApiKey = isProd ? "{{setting.dust_api_key}}" : metadata.settings.dust_api_key;
      const dustWorkspaceId = isProd ? "{{setting.dust_workspace_id}}" : metadata.settings.dust_workspace_id;
      const dustApiUrl = `https://dust.tt/api/v1/w/${dustWorkspaceId}/assistant/conversations`;
      const authorization = `Bearer ${dustApiKey}`;
  
      const selectedAssistantId = document.getElementById('assistantSelect').value;
      const selectedAssistantName = $('#assistantSelect option:selected').text();
      const userInputValue = userInput.value;
  
      const userData = await client.get('currentUser');
      const userFullName = userData.currentUser.name;
  
      const data = await client.get('ticket');

      const uniqueId = generateUniqueId();
  
      const ticketInfo = {
        id: ticket.id || 'Unknown',
        subject: ticket.subject || 'No subject',
        description: ticket.description || 'No description',
        status: ticket.status || 'Unknown',
        priority: ticket.priority || 'Not set',
        type: ticket.type || 'Not specified',
        tags: Array.isArray(ticket.tags) ? ticket.tags.join(', ') : 'No tags',
        createdAt: ticket.createdAt || 'Unknown',
        updatedAt: ticket.updatedAt || 'Unknown',
        assignee: (ticket.assignee && ticket.assignee.user && ticket.assignee.user.name) || 'Unassigned',
        assignee_email: (ticket.assignee && ticket.assignee.user && ticket.assignee.user.email) || 'Unassigned',
        group: (ticket.group && ticket.group.name) || 'No group',
        organization: (ticket.organization && ticket.organization.name) || 'No organization',
        customerName: 'Unknown',
        customerEmail: 'Unknown'
      };
  
      if (data && data.ticket && data.ticket.requester) {
        ticketInfo.customerName = data.ticket.requester.name || 'Unknown';
        ticketInfo.customerEmail = data.ticket.requester.email || 'Unknown';
      }
  
      // Append the user message to the div
      dustResponse.innerHTML += `
        <div class="user-message" id="user-${uniqueId}">
          <strong>${userFullName}:</strong>
          <pre>${userInputValue}</pre>
        </div>
      `;
  
      // Add spinner below user message with the selected assistant's name
      dustResponse.innerHTML += `
        <div id="${'assistant-' + uniqueId}" class="assistant-message">
          <h4>${selectedAssistantName}:</h4>
          <div class="spinner"></div>
        </div>
      `;
  
      // Scroll to the bottom of the dustResponse div
      dustResponse.scrollTop = dustResponse.scrollHeight;
  
      // Clear the user input
      userInput.value = '';
  
      // Fetch ticket comments
      const commentsResponse = await client.request(`/api/v2/tickets/${ticket.id}/comments.json`);
      const comments = commentsResponse.comments;
      
      // Collect unique user IDs from comments
      const userIds = [...new Set(comments.map(comment => comment.author_id))];
      
      // Fetch user details
      const userResponses = await Promise.all(userIds.map(id => client.request(`/api/v2/users/${id}.json`)));
      const users = userResponses.map(response => response.user);
      const userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});

      const formattedComments = comments.map(comment => {
        const author = userMap[comment.author_id];
        const authorName = author ? author.name : 'Unknown';
        const role = author ? (author.role === 'end-user' ? 'Customer' : 'Agent') : 'Unknown';

        return `${authorName} (${role}): ${comment.body}`;
      }).join('\n');

      const previousMessages = getPreviousMessages();
      const ticketSummary = `
      ### TICKET SUMMARY                
      Zendesk Ticket #${ticketInfo.id}
      Subject: ${ticketInfo.subject}
      Customer Name: ${ticketInfo.customerName}
      Customer Email: ${ticketInfo.customerEmail}
      Status: ${ticketInfo.status}
      Priority: ${ticketInfo.priority}
      Type: ${ticketInfo.type}
      Tags: ${ticketInfo.tags}
      Created At: ${ticketInfo.createdAt}
      Updated At: ${ticketInfo.updatedAt}
      Assignee: ${ticketInfo.assignee} (${ticketInfo.assignee_email})
      Group: ${ticketInfo.group}
      
      Conversation History:
      ${formattedComments}
      ### END TICKET SUMMARY
      
      ### CURRENT CONVERSATION
      ${previousMessages}
      `;

      const payload = {
        message: {
          content: ticketSummary,
          mentions: [
            {
              configurationId: selectedAssistantId
            }
          ],
          context: {
            username: userFullName.replace(/\s/g, ''),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            fullName: userFullName,
            email: userData.currentUser.email,
            profilePictureUrl: "",
            origin: "zendesk"
          }
        },
        title: `Zendesk Ticket #${ticketInfo.id} - ${ticketInfo.customerName}`,
        visibility: "unlisted",
        blocking: true
      };

      const options = {
        url: dustApiUrl,
        type: 'POST',
        contentType: 'application/json',
        headers: {
          'Authorization': authorization,
        },
        data: JSON.stringify(payload),
        secure: isProd,
      };

      const response = await client.request(options);

      const answer = response.conversation.content[1][0];
      const answerAgent = answer.configuration.name;
      const answerMessage = answer.content;

      // Remove the spinner
      const assistantMessageElement = document.getElementById(`assistant-${uniqueId}`);
      if (assistantMessageElement) {
        const htmlAnswer = convertMarkdownToHtml(answerMessage);
        assistantMessageElement.innerHTML = `
          <h4>@${answerAgent}:</h4>
          <pre class="markdown-content">${htmlAnswer}</pre>
          <button class="use-button" onclick="useAnswer(this)">Use answer</button>
        `;
      }

      // Scroll to the bottom of the dustResponse div
      dustResponse.scrollTop = dustResponse.scrollHeight;

      await client.invoke('resize', { width: '100%', height: '600px' });
    } catch (error) {
      console.error('Error sending ticket to Dust:', error);
      
       // Remove the spinner and show error message
      const assistantMessageElement = document.getElementById(`assistant-${uniqueId}`);
      if (assistantMessageElement) {
        assistantMessageElement.innerHTML = `
          <h4>Error:</h4>
          <pre>Error sending ticket to Dust. Please try again.</pre>
        `;
      }
    
      // Scroll to the bottom of the dustResponse div
      dustResponse.scrollTop = dustResponse.scrollHeight;
    } finally {
      userInput.disabled = false; // Re-enable the textarea
      sendToDustButton.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
        </svg>
      `;
    }
  }

  async function useAnswer(button) {
    const answerContent = button.previousElementSibling.innerHTML;
    const formattedAnswer = answerContent.replace(/\n/g, '<br>');
    try {
      await client.invoke('ticket.editor.insert', formattedAnswer);
      console.log('Answer inserted into ticket editor');
    } catch (error) {
      console.error('Error inserting answer into ticket editor:', error);
    }
  }

  function generateUniqueId() {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function getPreviousMessages() {
    const dustResponse = document.getElementById('dustResponse');
    const messages = dustResponse.getElementsByTagName('div');
    let previousMessages = '';
  
    for (const messageDiv of messages) {
      const senderElement = messageDiv.querySelector('strong, h4');
      const contentElement = messageDiv.querySelector('pre');
      
      if (senderElement && contentElement) {
        const sender = senderElement.textContent.trim();
        const content = contentElement.textContent.trim();
        previousMessages += `${sender} ${content}\n\n`;
      }
    }
  
    return previousMessages;
  }
})();
