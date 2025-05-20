"use client";

import { figmaAPI } from "@/lib/figmaAPI";
import { getLayersForSelection } from "@/lib/getLayersForSelection";
import { CompletionRequestBody } from "@/lib/types";
import { useState, useEffect } from "react";
import { z } from "zod";

// Standalone async function to fetch agents
async function fetchAgents(): Promise<any[]> {
  try {
    const response = await fetch("/api/completion", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching agents: ${response.statusText}`);
    }

    const data = await response.json();
    return data; // Return the list of agents
  } catch (error) {
    console.error("Error fetching agents:", error);
    return [];
  }
}

async function streamAIResponse(body: z.infer<typeof CompletionRequestBody>): Promise<string> {
  const resp = await fetch("/api/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const reader = resp.body?.pipeThrough(new TextDecoderStream()).getReader();

  if (!reader) {
    throw new Error("Error reading response");
  }

  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += value; // Accumulate the streamed text
  }

  return text; // Return the final translated text
}

export default function Plugin() {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedLayerCount, setSelectedLayerCount] = useState(0); // Track the number of selected layers
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  const languages = [
    { value: "English", label: "English", flag: "🇬🇧" },
    { value: "French", label: "French", flag: "🇫🇷" },
    { value: "Spanish", label: "Spanish", flag: "🇪🇸" },
    { value: "German", label: "German", flag: "🇩🇪" },
  ];

  // Function to update the selected layer count
  const updateSelectedLayerCount = async () => {
    const layers = await getLayersForSelection(); // Get selected layers
    setSelectedLayerCount(layers.length); // Update the count
  };

  // Use effect to fetch agents and listen for selection changes in Figma
  useEffect(() => {
    async function initialize() {
      const agents = await fetchAgents(); // Fetch agents using the standalone function
      setAgents(agents);
      const uxWritingPal = agents.find(agent => agent.name === "UXWritingPal");
      
      console.log("agents", agents);
      if (uxWritingPal) {
        // Set UXWritingPal as default if found
        setSelectedAgent(uxWritingPal.id);
      } else if (agents.length > 0) {
        // Fallback to first agent if UXWritingPal not found
        setSelectedAgent(agents[0].id);
      }
      console.log("selected agent", selectedAgent);
    }

    initialize();

    // Listen for selection changes in Figma
    const cleanup = figmaAPI.onSelectionChange(async () => {
      await updateSelectedLayerCount(); // Update the count on selection change
    });

    return cleanup; // Cleanup the listener on unmount
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-white text-gray-900 p-5">
      <div className="pb-2 w-full">
        <div className="flex flex-col gap-1 items-start">
          <h3 className="text-gray-900 dark:text-gray-100 text-2xl font-bold mb-1">How's it going? 🚀</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-start">
          <div className="flex flex-col grow basis-0 gap-1 items-start">
            <h5 className="text-gray-900 dark:text-gray-100 text-sm font-semibold">Translate your designs</h5>
            <p className="text-sm text-gray-500 dark:text-gray-400"></p>
          </div>
        </div>
      </div>
      <div className="w-full max-w-sm">
        {/* Section to display the number of selected text layers */}
        <div className="mb-4">
        <div
          className={`border rounded-xl p-4 text-sm font-light flex justify-center items-center border-dashed transition duration-200 ${
            selectedLayerCount > 0
              ? "border-blue-200 bg-blue-50 text-blue-500"
              : "border-gray-200 bg-gray-50 text-gray-400"
          }`}
        >
          <div className="h-min">
            {selectedLayerCount > 0
              ? `${selectedLayerCount} layer(s) selected`
              : "Select some layers to translate"}
          </div>
        </div>
        </div>

        {/* Section to select the target language */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select a Language</label>
            <div className="relative flex">
              <button
                className="w-full flex items-center justify-between border border-gray-100 rounded-lg p-2 text-sm bg-gray-50"
                onClick={() => setLanguageDropdownOpen((prev) => !prev)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl w-8 h-8 flex items-center justify-center rounded-full bg-gray-200">{languages.find((lang) => lang.value === selectedLanguage)?.flag}</span>
                  <span className="text-gray-900 font-semibold">{languages.find((lang) => lang.value === selectedLanguage)?.label}</span>
                </div>
                <span className="text-gray-500 text-xs pl-1 pr-1">▼</span>
              </button>
              {languageDropdownOpen && (
                <div className="absolute mt-14 w-full border border-gray-200 rounded-xl bg-white shadow-lg z-10 p-1">
                  {languages.map((lang) => (
                    <div
                      key={lang.value}
                      className={`pl-3 pr-3 pt-1 pb-1 w-full flex items-center gap-2 cursor-pointer rounded-md ${
                        lang.value === selectedLanguage ? "bg-blue-100" : "hover:bg-gray-50"
                      }`}
                      onClick={() => {
                        setSelectedLanguage(lang.value);
                        setLanguageDropdownOpen(false);
                      }}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span className="text-sm">{lang.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>

        {/* Dropdown to select the agent */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select an Agent</label>
          <div className="relative flex">
            <button
              className="w-full flex items-center justify-between border border-gray-100 rounded-lg p-2 text-sm bg-gray-50"
              onClick={() => setAgentDropdownOpen((prev) => !prev)}
            >
              {selectedAgent ? (
                <div className="flex flex-col items-start gap-2 w-full">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {agents.find((agent) => agent.id === selectedAgent)?.pictureUrl.includes("/emojis/") ? (
                        // Extract background color and apply it as a class
                        <div
                          className={`text-xl w-8 h-8 flex items-center justify-center rounded-full ${
                            agents
                              .find((agent) => agent.id === selectedAgent)
                              ?.pictureUrl.split("/")[5] || "bg-gray-300"
                          }`}
                        >
                          {String.fromCodePoint(
                            parseInt(
                              agents
                                .find((agent) => agent.id === selectedAgent)
                                ?.pictureUrl.split("/").pop() || "1f4b0",
                              16
                            )
                          )}
                        </div>
                      ) : (
                        <img
                          src={agents.find((agent) => agent.id === selectedAgent)?.pictureUrl || ""}
                          alt="Agent"
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                      <div className="flex flex-col text-left">
                        <span className="text-gray-900 font-semibold">
                          {agents.find((agent) => agent.id === selectedAgent)?.name || "Select an Agent"}
                        </span>
                      </div>
                    </div>
                    <span className="text-gray-500 text-xs pr-1 pl-1">▼</span>
                  </div>
                  <div className="text-gray-500 text-xs text-left">
                    {agents.find((agent) => agent.id === selectedAgent)?.description || ""}
                  </div>
                </div>
              ) : (
                <span className="text-gray-500">Select an Agent</span>
              )}
            </button>
            {agentDropdownOpen && (
              <div className="absolute h-64 overflow-scroll bottom-0 mb-24 w-full border border-gray-200 rounded-xl bg-white shadow-lg z-10 p-1">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`pl-3 pr-3 pt-2 pb-2 w-full flex items-start gap-3 cursor-pointer rounded-md ${
                      agent.id === selectedAgent ? "bg-blue-100" : "hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSelectedAgent(agent.id);
                      setAgentDropdownOpen(false);
                    }}
                  >
                     {agent.pictureUrl.includes("/emojis/") ? (
                      // Extract background color and apply it as a class
                      <div
                        className={`text-xl w-8 h-8 pr-2 pl-2 flex items-center justify-center rounded-full ${
                          agent.pictureUrl.split("/")[5] || "bg-gray-300"
                        }`}
                      >
                        {String.fromCodePoint(
                          parseInt(agent.pictureUrl.split("/").pop() || "1f4b0", 16)
                        )}
                      </div>
                    ) : (
                      <img
                        src={agent.pictureUrl}
                        alt="Agent"
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{agent.name}</span>
                      <span className="text-xs text-gray-400">{agent.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Button to start the translation */}
        <div className="text-center">
          <button
            className="w-full bg-blue-500 text-white font-medium py-2 px-4 rounded-xl hover:opacity-80 transition duration-200"
            disabled={loading} // Disable button while loading
          >
            {loading ? "Processing..." : "Translate"}
          </button>
        </div>
      </div>
    </div>
  );
}


