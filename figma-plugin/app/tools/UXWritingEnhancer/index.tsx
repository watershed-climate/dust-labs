import { useState, useEffect, useRef } from "react";
import { getLayersForSelection } from "@/lib/getLayersForSelection";
import { figmaAPI } from "@/lib/figmaAPI";
import { enhanceLayers, cancelEnhancement } from "./logic";
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import SuccessPill from "@/app/components/successPill";
import CancelPill from "@/app/components/cancelPill";


interface Agent {
  sId: string;
  name: string;
  pictureUrl: string;
  description?: string;
}


export default function UXWriter({ agents, selectedAgent, setSelectedAgent }: any) {
  const [selectedLayerCount, setSelectedLayerCount] = useState(0);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [chainOfThought, setChainOfThought] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chainOfThoughtRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter agents based on the search query
  const filteredAgents = agents.filter((agent: Agent) =>
    agent.name.toLowerCase().includes(agentSearchQuery.toLowerCase())
  );

  // Function to update the selected layer count
  const updateSelectedLayerCount = async () => {
    const layers = await getLayersForSelection();
    setSelectedLayerCount(layers.length);
  };

  // UseEffect to update the default agent
  useEffect(() => {
    const defaultAgentName = "UXWaccounting";
    const defaultAgent = agents.find((agent: Agent) => agent.name === defaultAgentName);
    if (defaultAgent) {
      setSelectedAgent(defaultAgent.sId);
    }
  }, [agents, setSelectedAgent]);

  // UseEffect to listen for selection changes and update the count
  useEffect(() => {
    updateSelectedLayerCount();

    // Optionally, add a listener for selection changes in Figma
    const cleanup = figmaAPI.onSelectionChange(async () => {
      await updateSelectedLayerCount();
    });

    return cleanup; // Cleanup the listener on unmount
  }, []);

  // UseEffect to listen for clicks outside the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setAgentDropdownOpen(false);
      }
    }
    if (agentDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [agentDropdownOpen]);

  // UseEffect to Auto-scroll chain of thought
  useEffect(() => {
    if (chainOfThoughtRef.current) {
      chainOfThoughtRef.current.scrollTop = chainOfThoughtRef.current.scrollHeight;
    }
  }, [chainOfThought]);

  const handleCancel = async () => {
    try {
      await cancelEnhancement();
      setLoading(false);
      setChainOfThought("");
    } catch (error) {
      setError("Failed to cancel enhancement");
    }
  };
  
  const handleEnhance = async () => {
    setLoading(true);
    setChainOfThought("");
    setShowSuccess(false);
    setError(null);
    await enhanceLayers(
      selectedAgent,
      (text) => setChainOfThought((prev) => prev + text),
      () => {
        setLoading(false);
        setChainOfThought("");
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      },
      (err) => {
        setLoading(false);
        setError(err);
      }
    );
  };

  return (
    <div className="w-full h-full flex flex-col justify-between">
      <div className="flex flex-col">
        {/* Display the number of selected layers */}
        <div className="mb-4">
          <div
            className={`border rounded-xl p-4 text-sm font-light flex justify-center items-center border-dashed transition duration-200 ${
              selectedLayerCount > 0
                ? "border-sky-200 bg-sky-50 text-sky-500"
                : "border-gray-200 bg-gray-50 text-gray-400"
            }`}
          >
            <div className="h-min">
              {selectedLayerCount > 0
                ? `${selectedLayerCount} text layer${selectedLayerCount > 1 ? "s" : ""} in selection`
                : "Select some layers with text to enhance"}
            </div>
          </div>
        </div>

        {/* Selected Agent Button */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
          <div className="relative flex" ref={dropdownRef}>
            <button
              className="w-full flex items-center justify-between rounded-lg p-2 text-sm bg-stone-100"
              onClick={() => setAgentDropdownOpen((prev) => !prev)}
            >
              {selectedAgent ? (
                <div className="flex flex-col items-start gap-2 w-full">
                  <div className="flex items-center justify-between w-full gap-1">
                    <div className="flex items-center gap-2">
                      {agents.find((agent: Agent) => agent.sId === selectedAgent)?.pictureUrl.includes("/emojis/") ? (
                        <div
                          className={`text-xs w-8 h-8 flex items-center justify-center rounded-full ${
                            agents
                              .find((agent: Agent) => agent.sId === selectedAgent)
                              ?.pictureUrl.split("/")[5] || "bg-gray-300"
                          }`}
                        >
                          {String.fromCodePoint(
                            parseInt(
                              agents
                                .find((agent: Agent) => agent.sId === selectedAgent)
                                ?.pictureUrl.split("/").pop() || "1f4b0",
                              16
                            )
                          )}
                        </div>
                      ) : (
                        <img
                          src={agents.find((agent: { sId: any; }) => agent.sId === selectedAgent)?.pictureUrl || ""}
                          alt="Agent"
                          className="w-8 h-8 rounded-xl"
                        />
                      )}
                      <div className="flex flex-col text-left">
                          <span className="text-gray-900 font-semibold">
                              {agents.find((agent: Agent) => agent.sId === selectedAgent)?.name || "Select an Agent"}
                          </span>
                        </div>
                    </div>
                    <span className="text-gray-500 text-xs pr-1 pl-1">▼</span>
                  </div>
                </div>
              ) : (
                <span className="text-gray-500">Select an Agent</span>
              )}
            </button>

            {/* Dropdown Menu */}
            {agentDropdownOpen && (
              <div className="absolute left-0 mt-14 h-60 w-full border border-gray-200 rounded-lg bg-white shadow-lg z-10 overflow-scroll">
                {/* Add search input */}
                <div className="sticky top-0 p-2 bg-white shadow-sm">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search agent"
                      value={agentSearchQuery}
                      onChange={(e) => setAgentSearchQuery(e.target.value)}
                      className="w-full placeholder:text-sm placeholder:font-light px-3 py-2 bg-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-200 transition-colors"
                    />
                    <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  </div>
                </div>
                
                {/* Update agents.map to filteredAgents.map */}
                <div className="p-1">
                  {filteredAgents.map((agent: any) => (
                    <div
                      key={agent.sId}
                      className={`p-2 flex items-start gap-2 cursor-pointer hover:bg-gray-100 rounded-md ${
                        agent.sId === selectedAgent ? "bg-sky-100" : ""
                      }`}
                      onClick={() => {
                        setSelectedAgent(agent.sId);
                        setAgentDropdownOpen(false);
                      }}
                    >
                      {agent.pictureUrl.includes("/emojis/") ? (
                            // Extract background color and apply it as a class
                            <div
                              className={`text-sm w-8 h-8 pr-2 pl-2 flex items-center justify-center rounded-full ${
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
                          <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-gray-900">{agent.name}</span>
                          <span className="text-xs text-gray-400">{agent.description}</span>
                        </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-3 pr-1 pl-1">
            <span>
              {selectedAgent
                ? (<>
                  <span className="font-semibold">UXWaccounting</span> or{" "}
                  <span className="font-semibold">UXWritingPal</span> are recommended for UX copy improvements.
                </>)
              : "Select an Agent"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 relative">

        {/* Cancel Pill */}
        <div className="absolute top-16 left-0 right-0 z-10">
          <CancelPill show={loading} onClick={handleCancel} />
        </div>

        {/* Chain of Thought */}
        {chainOfThought && (
          <div
            className="p-2 h-28 text-xs flex flex-col justify-end gap-2 w-full overflow-auto fade-top-shadow"
            ref={chainOfThoughtRef}
          >
            <pre className="w-full font-mono max-w-full break-words whitespace-pre-wrap">
              {chainOfThought}
            </pre>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-2 px-4 py-2 max-h-24 overflow-scroll bg-red-100 text-red-800 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {/* Success Pill */}
        <SuccessPill show={showSuccess} message="Enhancement complete" />

        {/* Enhance Button */}
        <div className="text-center">
        <button
            onClick={handleEnhance}
            className="w-full bg-sky-500 disabled:bg-stone-100 disabled:cursor-not-allowed text-white disabled:text-gray-400 font-medium py-2 px-4 rounded-xl hover:bg-sky-400 transition duration-200"
            disabled={loading || selectedLayerCount === 0}
          >
            {loading ? (
              <>
                <span className="thinking-text">Thinking</span>
              </>
            ) : (
              "Enhance"
            )}
          </button>
        </div>
      </div>
    </div>
  );
  }