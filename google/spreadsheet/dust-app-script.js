const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbz2yh-g3cBIiJrC0usxzEcdai0-jxPF4Fw1_wJiaQKnhZ8s5kHzw3P77RwsDHtNeBoK/exec";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Dust")
    .addItem("Ask Assistant", "processSelected")
    .addItem("Configure Credentials", "showCredentialsDialog")
    .addToUi();
}

function showCredentialsDialog() {
  var ui = SpreadsheetApp.getUi();
  var docProperties = PropertiesService.getDocumentProperties();

  var result = ui.prompt(
    "Dust Configuration",
    "Enter your API token:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() == ui.Button.OK) {
    docProperties.setProperty("dustToken", result.getResponseText());
  }

  result = ui.prompt(
    "Dust Configuration",
    "Enter your workspace ID:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() == ui.Button.OK) {
    docProperties.setProperty("workspaceId", result.getResponseText());
  }
}

function processSelected() {
  const ui = SpreadsheetApp.getUi();
  const docProperties = PropertiesService.getDocumentProperties();
  const token = docProperties.getProperty("dustToken");
  const workspaceId = docProperties.getProperty("workspaceId");

  if (!token || !workspaceId) {
    ui.alert("Please configure Dust credentials first");
    return;
  }

  const htmlOutput = HtmlService.createHtmlOutput(
    `
      <style>
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
        select, input {
          width: 100%;
          padding: 8px;
          margin-bottom: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        select {
          background: white;
        }
        .error {
          color: red;
          display: none;
          margin-bottom: 10px;
        }
      </style>
      <form id="myForm">
        <div style="margin-bottom: 10px;">
          <label for="assistant">Assistant:</label><br>
          <select id="assistant" name="assistant" required>
            <option value="">Loading assistants...</option>
          </select>
          <div id="loadError" class="error">Failed to load assistants</div>
        </div>
        <div style="margin-bottom: 10px;">
          <label for="instructions">Instructions (optional):</label><br>
          <textarea id="instructions" name="instructions" rows="4" style="width: 100%;"></textarea>
        </div>
        <input type="submit" value="Submit" id="submitBtn">
        <input type="button" value="Hide Dialog" id="closeBtn" onclick="google.script.host.close()" style="display: none;">
        <div id="spinner" class="spinner"></div>
        <div id="status"></div>
      </form>
      <script>
        // Fetch assistants when dialog opens
        google.script.run
          .withSuccessHandler(function(data) {
            const select = document.getElementById('assistant');
            select.innerHTML = '';
            if (data.error) {
              const errorDiv = document.getElementById('loadError');
              errorDiv.textContent = '❌ ' + data.error;
              errorDiv.style.display = 'block';
              select.innerHTML = '<option value="">Failed to load assistants</option>';
              return;
            }
            data.assistants.forEach(a => {
              const option = document.createElement('option');
              option.value = a.id;
              option.textContent = a.name;
              select.appendChild(option);
            });
          })
          .withFailureHandler(function(error) {
            const select = document.getElementById('assistant');
            select.innerHTML = '<option value="">Failed to load assistants</option>';
            const errorDiv = document.getElementById('loadError');
            errorDiv.textContent = '❌ ' + error;
            errorDiv.style.display = 'block';
          })
          .fetchAssistants();

        document.getElementById('myForm').addEventListener('submit', function(e) {
          e.preventDefault();
          document.getElementById('spinner').style.display = 'block';
          document.getElementById('submitBtn').disabled = true;
          document.getElementById('closeBtn').style.display = 'inline-block';
          document.getElementById('status').innerHTML = '🤖 Processing cells...<br>Results will appear in cells to the right of your selection.<br>You can hide this dialog if you want';
          google.script.run
            .withSuccessHandler(function() {
              document.getElementById('status').textContent = '🎉 All done!';
              document.getElementById('spinner').style.display = 'none';
            })
            .withFailureHandler(function(error) {
              document.getElementById('spinner').style.display = 'none';
              document.getElementById('submitBtn').disabled = false;
              document.getElementById('closeBtn').style.display = 'none';
              document.getElementById('status').textContent = '❌ Oops! something went wrong: ' + error;
            })
            .processWithAssistant(
              document.getElementById('assistant').value,
              document.getElementById('instructions').value
            );
        });
      </script>
    `
  )
    .setWidth(500)
    .setHeight(600);

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
    SpreadsheetApp.getUi().alert("Please configure Dust credentials first");
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
