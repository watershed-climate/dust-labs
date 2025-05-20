import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useRef } from 'react';

interface Agent {
  sId: string;
  name: string;
  description: string;
  pictureUrl: string;
}

interface AgentSelectorProps {
  agents: Agent[];
  selectedAgent: string;
  setSelectedAgent: (id: string) => void;
  position?: 'middle' | 'bottom';
}

export default function AgentSelector({ agents, selectedAgent, setSelectedAgent, position }: AgentSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // UseEffect to listen for clicks outside the dropdown
    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          setDropdownOpen(false);
        }
      }
      if (dropdownOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [dropdownOpen]);
  
  // Add a filtered agents computation
  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAgentData = agents.find((agent) => agent.sId === selectedAgent);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center justify-between rounded-xl text-sm hover:bg-stone-200 border border-stone-100"
        onClick={() => setDropdownOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2 w-8">
          {selectedAgentData?.pictureUrl?.includes("/emojis/") ? (
            <div className="text-xl w-8 h-8 flex items-center justify-center rounded-lg bg-gray-300">
              {String.fromCodePoint(
                parseInt(
                  selectedAgentData?.pictureUrl.split("/").pop() || "1f4b0",
                  16
                )
              )}
            </div>
          ) : (
            <img
              src={selectedAgentData?.pictureUrl || ""}
              alt="Agent"
              className="w-8 h-8 rounded-xl"
            />
          )}
        </div>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className={`absolute right-0 mt-1 w-80 border border-gray-200 rounded-lg bg-white shadow-lg z-10 overflow-scroll ${
          position === 'bottom' ? 'h-80 bottom-full mb-2' : 'h-80 top-full'
        }`}>
          {/* Add search input */}
          <div className="sticky top-0 p-2 bg-white shadow-sm">
            <div className="relative">
              <input
                type="text"
                placeholder="Search agent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full placeholder:text-sm placeholder:font-light px-3 py-2 bg-gray-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-200 transition-colors"
              />
              <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
          </div>
          
          {/* Update agents.map to filteredAgents.map */}
          <div className='p-1'>
          {filteredAgents.map((agent: any) => (
            <div
            key={agent.sId}
            className={`p-2 flex items-start gap-2 cursor-pointer hover:bg-gray-100 rounded-md ${
                agent.sId === selectedAgent ? "bg-sky-100" : ""
            }`}
            onClick={() => {
                setSelectedAgent(agent.sId);
                setDropdownOpen(false);
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
  );
}