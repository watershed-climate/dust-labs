const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbz2yh-g3cBIiJrC0usxzEcdai0-jxPF4Fw1_wJiaQKnhZ8s5kHzw3P77RwsDHtNeBoK/exec";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Dust")
    .addItem("Call an Assistant", "processSelected")
    .addItem("Setup", "showCredentialsDialog")
    .addToUi();
}

function showCredentialsDialog() {
  var ui = SpreadsheetApp.getUi();
  var docProperties = PropertiesService.getDocumentProperties();

  var result = ui.prompt(
    "Setup Dust",
    "Your Dust Workspace ID:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() == ui.Button.OK) {
    docProperties.setProperty("workspaceId", result.getResponseText());
  }

  var result = ui.prompt(
    "Setup Dust",
    "Your Dust API Key:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() == ui.Button.OK) {
    docProperties.setProperty("dustToken", result.getResponseText());
  }
}

function processSelected() {
  const ui = SpreadsheetApp.getUi();
  const docProperties = PropertiesService.getDocumentProperties();
  const token = docProperties.getProperty("dustToken");
  const workspaceId = docProperties.getProperty("workspaceId");

  if (!token || !workspaceId) {
    ui.alert("Please configure your Dust credentials first");
    return;
  }

  const htmlOutput = HtmlService.createHtmlOutput(
    `
      <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
      <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
      
      <style>
        * {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .spinner {
          display: none;
          margin: 10px auto;
          width: 50px;
          height: 50px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        #status {
          text-align: center;
          margin: 15px 0;
          color: #666;
          line-height: 1.4;
        }
        #closeBtn {
          display: none;
          margin: 10px auto;
        }
        select, input, textarea {
          width: 100%;
          padding-top: 8px;
          padding-bottom: 8px;
          margin-bottom: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
        }
        select {
          background: white;
        }
        input[type="submit"], input[type="button"] {
          background-color: #61A5FA;
          color: white;
          border: none;
          padding: 10px 20px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        input[type="submit"]:hover, input[type="button"]:hover {
          background-color: #4884d9;
        }
        input[type="submit"]:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        .error {
          color: red;
          display: none;
          margin-bottom: 10px;
        }
        label {
          font-weight: 500;
          color: #333;
          margin-bottom: 5px;
          display: inline-block;
        }
        .select2-container {
          width: 100% !important;
          margin-bottom: 10px;
        }
        .select2-selection {
          height: 38px !important;
          padding: 4px !important;
        }
        .select2-selection__arrow {
          height: 36px !important;
        }
      </style>

      <form id="myForm">
        <div style="margin-bottom: 10px;">
          <label for="assistant">Assistant:</label><br>
          <select id="assistant" name="assistant" required disabled>
            <option value=""></option>
          </select>
          <div id="loadError" class="error">Failed to load assistants</div>
        </div>
        <div style="margin-bottom: 10px;">
          <label for="instructions">Instructions (optional):</label><br>
          <textarea id="instructions" name="instructions" rows="4" style="width:99%"></textarea>
        </div>
        <div id="status"></div>
        <input type="submit" value="Submit" id="submitBtn">
        <input type="button" value="Hide this window (processing will continue)" id="closeBtn" onclick="google.script.host.close()" style="display: none;">
        <div id="spinner" class="spinner"></div>
      </form>
      <script>
        // Initialize Select2 with disabled state and loading placeholder
        $(document).ready(function() {
          $('#assistant').select2({
            placeholder: 'Loading assistants...',
            allowClear: true,
            width: '100%',
            language: {
              noResults: function() {
                return 'No assistants found';
              }
            }
          });
        });

        // Fetch assistants when dialog opens
        google.script.run
          .withSuccessHandler(function(data) {
            const select = document.getElementById('assistant');
            
            if (data.error) {
              const errorDiv = document.getElementById('loadError');
              errorDiv.textContent = '❌ ' + data.error;
              errorDiv.style.display = 'block';
              $('#assistant').select2({
                placeholder: 'Failed to load assistants',
                allowClear: true,
                width: '100%'
              });
              return;
            }

            // Clear the loading option
            select.innerHTML = '';
            
            // Add empty option for placeholder
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            select.appendChild(emptyOption);
            
            // Add all assistants
            data.assistants.forEach(a => {
              const option = document.createElement('option');
              option.value = a.id;
              option.textContent = a.name;
              select.appendChild(option);
            });
            
            // Enable the select and update placeholder
            select.disabled = false;
            $('#assistant').select2({
              placeholder: 'Select an assistant',
              allowClear: true,
              width: '100%',
              language: {
                noResults: function() {
                  return 'No assistants found';
                }
              }
            });
            
            // If no assistants were loaded, show a message
            if (data.assistants.length === 0) {
              $('#assistant').select2({
                placeholder: 'No assistants available',
                allowClear: true,
                width: '100%'
              });
            }
          })
          .withFailureHandler(function(error) {
            const select = document.getElementById('assistant');
            const errorDiv = document.getElementById('loadError');
            errorDiv.textContent = '❌ ' + error;
            errorDiv.style.display = 'block';
            
            $('#assistant').select2({
              placeholder: 'Failed to load assistants',
              allowClear: true,
              width: '100%'
            });
          })
          .fetchAssistants();

        // Update the form submission to check for disabled state
        document.getElementById('myForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const assistantSelect = document.getElementById('assistant');
        
        if (assistantSelect.disabled) {
          alert('Please wait for assistants to load');
          return;
        }
        
        if (!assistantSelect.value) {
          alert('Please select an assistant');
          return;
        }

        document.getElementById('spinner').style.display = 'block';
        document.getElementById('submitBtn').style.display = 'none'; // Changed from disabled to display: none
        document.getElementById('closeBtn').style.display = 'block';
        document.getElementById('status').innerHTML = '🤖 Processing cells...<br>Results will appear in cells immediately to the right of your selection';
        
        google.script.run
          .withSuccessHandler(function() {
            google.script.host.close();
          })
          .withFailureHandler(function(error) {
            document.getElementById('spinner').style.display = 'none';
            document.getElementById('submitBtn').style.display = 'block'; // Show the submit button again on error
            document.getElementById('closeBtn').style.display = 'none';
            document.getElementById('status').textContent = '❌ Oops! something went wrong: ' + error;
          })
          .processWithAssistant(
            assistantSelect.value,
            document.getElementById('instructions').value
          );
});
      </script>
    `
  )
    .setWidth(600)
    .setHeight(400);

  ui.showModalDialog(htmlOutput, "Ask Assistant");
}

function fetchAssistants() {
  const docProperties = PropertiesService.getDocumentProperties();
  const token = docProperties.getProperty("dustToken");
  const workspaceId = docProperties.getProperty("workspaceId");

  if (!token || !workspaceId) {
    SpreadsheetApp.getUi().alert("Please configure Dust credentials first");
    return;
  }

  try {
    const response = UrlFetchApp.fetch(
      `${WEBAPP_URL}?token=${encodeURIComponent(
        token
      )}&workspaceId=${encodeURIComponent(workspaceId)}`,
      {
        method: "get",
        muteHttpExceptions: true,
      }
    );

    return JSON.parse(response.getContentText());
  } catch (error) {
    return { error: error.toString() };
  }
}

function processWithAssistant(assistantId, instructions) {
  const docProperties = PropertiesService.getDocumentProperties();
  const token = docProperties.getProperty("dustToken");
  const workspaceId = docProperties.getProperty("workspaceId");

  if (!token || !workspaceId) {
    SpreadsheetApp.getUi().alert(
      "Please configure your Dust credentials first"
    );
    return;
  }

  const selected = SpreadsheetApp.getActiveRange();
  const requests = [];
  const cells = [];

  // Prepare all requests.
  for (let i = 0; i < selected.getNumRows(); i++) {
    for (let j = 0; j < selected.getNumColumns(); j++) {
      const cell = selected.getCell(i + 1, j + 1);
      const rightCell = cell.offset(0, 1);

      requests.push({
        url: WEBAPP_URL,
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          value: cell.getValue(),
          token: token,
          workspaceId: workspaceId,
          assistantId,
          prompt: instructions,
        }),
        muteHttpExceptions: true,
      });
      cells.push(rightCell);
    }
  }

  // Batch calls in groups of 20.
  const batchSize = 20;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const responses = UrlFetchApp.fetchAll(batch);

    responses.forEach((response, j) => {
      try {
        const result = JSON.parse(response.getContentText());
        if (result.error) {
          cells[i + j].setValue("Error: " + result.error);
        } else {
          const content = result.content.replace(/"/g, '""'); // escape quotes in content
          const appUrl = `https://dust.tt/w/${workspaceId}/assistant/${result.conversationId}`;
          cells[i + j].setFormula(`=HYPERLINK("${appUrl}", "${content}")`);
        }
      } catch (error) {
        cells[i + j].setValue("Error: " + error.toString());
      }
    });
  }
}
