"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/app/components/header";
import Chat from "@/app/chat/chat";
import Tools from "./components/tools";
import 'katex/dist/katex.min.css';

export default function Plugin() {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "tools">("chat");
  const [clearChat, setClearChat] = useState<() => void>(() => {});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch agents when the plugin mounts
  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await fetch("/api/agents", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Error fetching agents: ${response.statusText}`);
        }

        const data = await response.json();
        setAgents(data);
      } catch (error) {
        console.error("Error fetching agents:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAgents();
  }, []);

  const handleChatTabClear = useCallback((clearFn: () => void) => {
    setClearChat(() => clearFn);
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-white text-gray-900 h-full">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} onChatTabClick={clearChat} />
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        activeTab === "chat" ? (
          <Chat 
            agents={agents} 
            selectedAgent={selectedAgent || ""}
            setSelectedAgent={setSelectedAgent}
            onChatTabClick={handleChatTabClear}
          />
        ) : (
          <Tools
            selectedTool={selectedTool}
            setSelectedTool={setSelectedTool}
            agents={agents}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
          />
        )
      )}
    </div>
  );
}
