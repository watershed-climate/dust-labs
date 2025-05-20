import { tools } from "../tools/index";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";

interface ToolsProps {
  selectedTool: string | null;
  setSelectedTool: (toolId: string | null) => void;
  agents: any[];
  selectedAgent: string | null;
  setSelectedAgent: (agentId: string | null) => void;
}

export default function Tools({
  selectedTool,
  setSelectedTool,
  agents,
  selectedAgent,
  setSelectedAgent,
}: ToolsProps) {
  const ToolComponent = selectedTool
    ? tools.find((tool) => tool.id === selectedTool)?.Component
    : null;

  return !selectedTool ? (
    <div className="flex flex-col gap-2 w-full p-4">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setSelectedTool(tool.id)}
          className="flex flex-col items-start rounded-xl p-3 transition duration-200  hover:bg-stone-50 h-fit border border-stone-100"
        >
          <div className="flex items-center">
            <div
              className={`w-8 h-8 pr-2 pl-2 flex items-center justify-center rounded-xl bg-${tool.color}-100 mr-2`}
            >
              <span className="text-xs">{tool.icon}</span>
            </div>
            <div className="flex flex-col items-start">
              <h2 className="text-base font-semibold text-left line-clamp-1 text-ellipsis">
                {tool.name}
              </h2>
              {/* <p className="text-[10px] text-gray-500 text-left text-ellipsis line-clamp-1">
                {tool.author}
              </p> */}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-left text-ellipsis line-clamp-2">
            {tool.description}
          </p>
        </button>
      ))}
    </div>
  ) : (
    <div className="w-full max-w-lg p-4 h-full flex flex-col items-start">
      <button
        onClick={() => setSelectedTool(null)}
        className="bg-white hover:bg-stone-50 p-2 border border-gray-100 rounded-xl text-sm transition duration-200 w-fit flex items-center space-x-1 mb-3"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
        <h3 className="text-gray-900 dark:text-gray-100 text-2xl font-bold mb-2">
          {tools.find((tool) => tool.id === selectedTool)?.name || "Tool Name"}
        </h3>
      <div className="mb-4">
        <span className="text-sm text-gray-500">{tools.find((tool) => tool.id === selectedTool)?.description || "Tool Description"}</span>
      </div>
      {ToolComponent && (
        <ToolComponent
          agents={agents}
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
        />
      )}
    </div>
  );
}