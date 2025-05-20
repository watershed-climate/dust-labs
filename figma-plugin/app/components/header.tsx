import { ChatBubbleLeftRightIcon, WrenchScrewdriverIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useCallback, useState } from "react";

interface HeaderProps {
  activeTab: "chat" | "tools";
  setActiveTab: (tab: "chat" | "tools") => void;
  onChatTabClick?: () => void; // Add this
}

export default function Header({ activeTab, setActiveTab, onChatTabClick }: HeaderProps) {
  const [isChatHovered, setIsChatHovered] = useState(false);
  const handleChatTabClick = useCallback(() => {
    setActiveTab("chat");
    onChatTabClick?.();
  }, [setActiveTab, onChatTabClick]);

  return (
    <div className="w-full bg-stone-50 border-b border-gray-100">
      <div className="flex justify-start gap-4 px-4 pt-4">
        {/* Chat Tab */}
        <button
          onClick={handleChatTabClick}
          onMouseEnter={() => setIsChatHovered(true)}
          onMouseLeave={() => setIsChatHovered(false)}
          className={`flex items-center pb-3 px-2 transition duration-200 font-semibold border-b-2 space-x-2 ${
            activeTab === "chat"
              ? "text-black border-black"
              : "text-gray-500 border-transparent hover:text-black"
          }`}
        >
          <div className="relative w-5 h-5 overflow-hidden">
            <ChatBubbleLeftRightIcon
              className={`absolute h-5 w-5 transition-all duration-200 ${
                isChatHovered 
                  ? 'opacity-0 -translate-y-full' 
                  : 'opacity-100 translate-y-0'
              }`}
            />
            <PlusIcon
              className={`absolute h-5 w-5 transition-all duration-200 ${
                isChatHovered 
                  ? 'opacity-100 translate-y-0' 
                  : 'opacity-0 translate-y-full'
              }`}
            />
          </div>
          <span>Chat</span>
        </button>

        {/* Tools Tab */}
        <button
          onClick={() => setActiveTab("tools")}
          className={`flex items-center pb-3 px-2 transition duration-200 font-semibold border-b-2 space-x-2 ${
            activeTab === "tools"
              ? "text-black border-black"
              : "text-gray-500 border-transparent hover:text-black"
          }`}
        >
          <WrenchScrewdriverIcon className="h-5 w-5" />
          <span>Tools</span>
        </button>
      </div>
    </div>
  );
}