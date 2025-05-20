import React, { useEffect, useState, useRef, useCallback } from "react";
import { DocumentTextIcon, PhotoIcon } from "@heroicons/react/24/solid";
import AgentSelector from "@/app/components/agentSelector";
import CancelPill from "@/app/components/cancelPill";
import { getLayersForSelection } from "@/lib/getLayersForSelection";
import { getImageForSelection } from "@/lib/getImageForSelection";
import Markdown from 'markdown-to-jsx';
import {
  TableWrapper,
  JsonWrapper,
  ListWrapper,
  BlockquoteWrapper,
  MathWrapper,
  formatMessageContent
} from '@/app/components/messageWrappers';
import { XMarkIcon } from "@heroicons/react/24/outline";


interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant';
  attachedLayers?: number;
  attachedImage?: string;
  pending?: boolean;
  agent?: {
    name: string;
    pictureUrl: string;
  };
}

interface ChatProps {
  agents: any[];
  selectedAgent: string;
  setSelectedAgent: (id: string) => void;
  onChatTabClick: (clearFn: () => void) => void;
}

export default function Chat({ agents, selectedAgent, setSelectedAgent, onChatTabClick }: ChatProps) {
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [attachedLayers, setAttachedLayers] = useState<{text: string}[] | null>(null);
  const [attachedImage, setAttachedImage] = useState<Uint8Array | null>(null);
  const [attachLayersError, setAttachLayersError] = useState<string | null>(null);
  const [attachImageError, setAttachImageError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const selectedAgentData = agents.find((agent) => agent.sId === selectedAgent);

  const placeholder = selectedAgentData 
    ? `Ask a question to @${selectedAgentData.name} or select another agent...`
    : "Select an agent to start the converstation...";

  const welcomeMessages = [
    "Welcome aboard! 🚀",
    "Great to see you! ✨",
    "Hola! 💡",
    "Greetings! 🌈",
    "How can I help today? 🌟"
  ];
  const [welcomeMessageIndex] = useState(() => Math.floor(Math.random() * welcomeMessages.length));

  // UseEffect to scroll to the bottom of the chat when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //UseEffect to set default agent to gpt-4 if none were selected
  useEffect(() => {
    if (!selectedAgent) {
      const defaultAgent = agents.find(agent => agent.sId === "gpt-4");
      if (defaultAgent) {
        setSelectedAgent("gpt-4");
      } else {
        console.warn("Default agent 'gpt-4' not found in agents list");
      }
    }
  }, [selectedAgent, setSelectedAgent, agents]);

  // Function to handle canceling the generation
  const handleCancel = useCallback(async () => {
    try {
      if (abortController) {
        abortController.abort();
      }

      if (!conversationId || !currentMessageId) return;

      const response = await fetch('/api/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          messageIds: [currentMessageId]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel generation');
      }

      setIsLoading(false);
      setStreamedResponse("");
      
      setMessages(prev => 
        prev.map((msg, index) => 
          index === prev.length - 1 ? 
          { ...msg, content: msg.content + "\n\n_Message generation was interrupted._" } : 
          msg
        )
      );
    } catch (error) {
      console.error('Error cancelling generation:', error);
    }
  }, [abortController, conversationId, currentMessageId]);

  // function to clear the conversation and reset states
  const handleClearMessages = useCallback(async () => {
    await handleCancel();
    setMessages([]);
    setStreamedResponse("");
    setConversationId(null);
    setCurrentMessageId(null);
    setIsLoading(false);
    setUserInput("");
    setAttachedLayers(null);
    setAttachedImage(null);
  }, [handleCancel]);

  // UseEffect to clear the conversation when the chat tab is clicked
  useEffect(() => {
  onChatTabClick(handleClearMessages);
  return () => {
    onChatTabClick(() => {});
  };
}, [onChatTabClick, handleClearMessages]);

  // Function to debug the conversation (fetch the conversation data and log it)
  const handleDebugConversation = async () => {
    const response = await fetch(`/api/chat/debug/${conversationId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.error("Failed to fetch conversation debug info");
      return;
    }
    const data = await response.json();
    console.log("Debug conversation data:", data);
  };

  // Function to set attachedLayers to the selection
  const handleAttachTextLayers = async () => {
    try {
      const layers = await getLayersForSelection();
      if (layers.length === 0) {
        setAttachLayersError("No text layers in selection");
        setTimeout(() => setAttachLayersError(null), 3000);
        return;
      }
      
      const formattedLayers = layers.map(layer => ({
        text: layer.text
      }));
      
      setAttachedLayers(formattedLayers);
    } catch (error) {
      setAttachLayersError("Error accessing selection");
      setTimeout(() => setAttachLayersError(null), 3000);
    }
  };

  // Function to set attachedImage to the selection
  const handleAttachImage = async () => {
    try {
      const result = await getImageForSelection();
      if (result.error) {
        setAttachImageError(result.error);
        setTimeout(() => setAttachImageError(null), 3000);
        return;
      }
      setAttachedImage(result.image);
    } catch (error) {
      setAttachImageError("Error exporting image");
      setTimeout(() => setAttachImageError(null), 3000);
    }
  };

  // Function to handle sending the message
  const handleSendMessage = async () => {
    if (!userInput.trim() || !selectedAgent) return;

    const controller = new AbortController();
    setAbortController(controller);

    // Capture current attachments before resetting
    const layersToSend = attachedLayers ? [...attachedLayers] : null;
    const imageToSend = attachedImage ? attachedImage : null;

    const messageId = Date.now().toString();
    const newUserMessage: Message = {
      id: messageId,
      content: userInput,
      type: 'user',
      attachedLayers: layersToSend?.length,
      attachedImage: imageToSend ? "[image]" : undefined,
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      content: '',
      type: 'assistant',
      agent: {
        name: selectedAgentData?.name || '',
        pictureUrl: selectedAgentData?.pictureUrl || '',
      }
    };

    setMessages(prev => [...prev, newUserMessage, assistantMessage]);
    setUserInput("");
    setAttachedLayers(null);
    setAttachedImage(null);

    setIsLoading(true);

    try {
      let response;

      // Prepare content fragments
      let contentFragments: any[] = [];

      // Handle text layers
      if (layersToSend && layersToSend.length > 0) {
        contentFragments.push({
          title: "Selected Layers",
          content: layersToSend.map(layer => layer.text).join('\n'),
          contentType: "text/plain",
        });
      }

      // Handle image
      if (imageToSend) {
        // Upload image to DustAPI to get a URL
        const file = new File([imageToSend], "screenshot.png", { type: "image/png" });
        const uploadRes = await fetch("/api/chat/uploadImage", {
          method: "POST",
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Failed to upload image");
        const { fileId, url: downloadUrl } = await uploadRes.json();

        // Add image contentFragment
        contentFragments.push({
          title: "Frame Screenshot",
          fileId,
          url: downloadUrl,
        });
      }

      if (!conversationId) {
        // Create a new conversation with contentFragments (if any)
        response = await fetch("/api/chat/conversation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userMessage: userInput,
            configurationId: selectedAgent,
            contentFragments: contentFragments.length > 0 ? contentFragments : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const newConversationId = response.headers.get('X-Conversation-Id');
        const currentMessageId = response.headers.get('X-Message-Id');
        if (newConversationId) {
          setConversationId(newConversationId);
          setCurrentMessageId(currentMessageId);
        }
      } else {
        // For existing conversation, post content fragments first
        for (const fragment of contentFragments) {
          await fetch("/api/chat/contentFragment", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              conversationId,
              ...fragment,
            }),
            signal: controller.signal,
          });
        }

        // Then send message in existing conversation
        response = await fetch("/api/chat/message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversationId: conversationId,
            userMessage: userInput,
            configurationId: selectedAgent,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const currentMessageId = response.headers.get('X-Message-Id');
        if (currentMessageId) {
          setCurrentMessageId(currentMessageId);
        }
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      // Stream the response
      if (reader) {
        let content = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Decode the chunk and append to content
            const chunk = decoder.decode(value, { stream: true });
            // console.log("chunks:", chunk);
            content += chunk;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content }
                  : msg
              )
            );
          }
          console.log("final content:", content);
          // Flush any remaining bytes
          content += decoder.decode();
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content }
                : msg
            )
          );
        } catch (err) {
          console.error("Error streaming chunks", err);
        } finally {
          reader.releaseLock();
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      console.error('Error sending message:', error)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: 'Error: Failed to get response' }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
    }
  }


  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full max-w-4xl relative">

      {/* Display message list or first input */}
      {messages.length === 0 ? (
        <>
          {/* First input welcome */}
          <h3 className="text-gray-900 text-2xl font-semibold mb-1 mt-28 px-4">
            {welcomeMessages[welcomeMessageIndex]}
          </h3>
          <h5 className="text-gray-900 text-lg font-semibold mb-4 px-4">
            Start a conversation
          </h5>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pt-4 px-4 relative">

          {/* List of messages */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-3xl flex flex-col ${
                message.type === 'user'
                  ? 'bg-stone-50'
                  : 'bg-transparent'
              }`}
            >
              {message.type === 'assistant' && message.agent && (
                <div className="flex items-center gap-2 mb-3">
                  {message.agent.pictureUrl?.includes("/emojis/") ? (
                    <div className="text-xl w-6 h-6 flex items-center justify-center rounded-lg bg-gray-300">
                      {String.fromCodePoint(
                        parseInt(
                          message.agent.pictureUrl.split("/").pop() || "1f4b0",
                          16
                        )
                      )}
                    </div>
                  ) : (
                    <img
                      src={message.agent.pictureUrl}
                      alt={message.agent.name}
                      className="w-6 h-6 rounded-lg"
                    />
                  )}
                  <span className="text-sm font-semibold text-gray-900">
                    {message.agent.name}
                  </span>
                  <div className="flex items-center gap-2 mb-3">
                </div>
                </div>
              )}
              {isLoading && message.id === messages[messages.length - 1].id && (
                <span className="my-2 w-fit px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-xl">
                  <span className="thinking-text">Thinking</span>
                </span>
              )}
              <div className="prose prose-stone max-w-none whitespace-pre-wrap">
                {/* {message.content} */}
                <Markdown
                  options={{
                    overrides: {
                      table: TableWrapper,
                      th: {
                        props: {
                          className: 'py-2 px-4 bg-gray-50 text-sm text-gray-500 font-medium border border-gray-200 text-left',
                        },
                      },
                      td: {
                        props: {
                          className: 'py-2 px-4 border border-gray-200 text-left',
                        },
                      },
                      code: {
                        component: ({ children, className }) => {
                          // Handle visualization blocks
                          if (className === 'lang-visualization') {
                            return (
                              <p className="text-gray-500 text-sm">Visualizations are not supported in this chat interface</p>
                            );
                          }

                          // Handle block math
                          if (className === 'lang-math') {
                            return <MathWrapper inline={false}>{children as string}</MathWrapper>;
                          }
                          
                          // Handle inline math
                          if (className === 'math-inline') {
                            return <MathWrapper inline={true}>{children as string}</MathWrapper>;
                          }
                          
                          // Handle JSON
                          if (className === 'lang-json') {
                            try {
                              return <JsonWrapper>{children as string}</JsonWrapper>;
                            } catch {
                              return <code className="bg-gray-100 rounded px-1">{children}</code>;
                            }
                          }
                          
                          // Default code handling
                          return <code className="bg-gray-100 rounded px-1">{children}</code>;
                        },
                      },
                      pre: {
                        component: ({ children, className }) => {
                          if (className?.includes('language-json')) {
                            return children;
                          }
                          // Handle other code block types
                          return <pre className="bg-gray-50 rounded-xl p-4 border border-gray-100 my-4 overflow-x-auto">{children}</pre>;
                        },
                      },
                      ul: {
                        component: ({ children }) => (
                          <ListWrapper ordered={false}>{children}</ListWrapper>
                        ),
                      },
                      ol: {
                        component: ({ children }) => (
                          <ListWrapper ordered={true}>{children}</ListWrapper>
                        ),
                      },
                      li: {
                        props: {
                          className: 'text-gray-900 leading-relaxed',
                        },
                      },
                      blockquote: {
                        component: BlockquoteWrapper
                      },
                      p: {
                        props: {
                          className: 'text-gray-700 my-2 line',
                        },
                      },
                      h1: {
                        props: {
                          className: 'text-2xl font-semibold text-gray-900 my-4',
                        },
                      },
                      h2: {
                        props: {
                          className: 'text-xl font-semibold text-gray-900 my-3',
                        },
                      },
                      h3: {
                        props: {
                          className: 'text-lg font-semibold text-gray-900 my-2',
                        },
                      },
                      a: {
                        component: ({ children }: { children: React.ReactNode }) => (
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 my-4">
                            <p className="text-gray-500 text-sm font-mono">Links are not supported in this chat interface</p>
                          </div>
                        ),
                      },
                    },
                  }}
                >
                  {formatMessageContent(message.content)}
                </Markdown>
              </div>
              {message.type === 'user' && message.attachedLayers && message.attachedLayers > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-stone-100 mt-2">
                  <DocumentTextIcon className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700">
                    [text] {message.attachedLayers} layer{message.attachedLayers > 1 ? 's' : ''} sent
                  </span>
                </div>
              )}
              {message.type === 'user' && message.attachedImage && (
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-stone-100 mt-2">
                  <PhotoIcon className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700">
                    [image] Screenshot sent
                  </span>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Chat Input */}
      <div className="px-4 pb-4 relative">

        {/* Add Cancel Pill */}
        <div className="absolute -top-12 left-0 right-0 z-10 px-4">
          <CancelPill show={isLoading} onClick={handleCancel} />
        </div>

        <div className={`relative flex flex-col w-full border rounded-3xl p-2 bg-stone-50 border-stone-100 transition-all duration-300 ease-in-out ${inputFocused ? "outline outline-sky-200 outline-1" : "outline-none"}`}>
          
          {/* Text layers selection card */}
          {attachedLayers && attachedLayers.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-white rounded-xl border border-stone-100">
              <DocumentTextIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-700">[text] {attachedLayers.length} selected layers</span>
              <button 
                onClick={() => setAttachedLayers(null)}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Screenshot selection card */}
          {attachedImage && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-white rounded-xl border border-stone-100">
              <PhotoIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-700">[image] Frame screenshot</span>
              <button 
                onClick={() => setAttachedImage(null)}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Textarea and agent selector */}
          <div className="flex items-start w-full h-fit">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (userInput.trim() && selectedAgent && !isLoading) {
                    handleSendMessage();
                  }
                }
              }}
              placeholder={placeholder}
              className="flex w-full p-2 h-32 max-h-96 border-none outline-none bg-transparent text-gray-900 placeholder-gray-400 text-base font-light resize-none"
            />
            <AgentSelector 
              agents={agents}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
              position={messages.length === 0 ? 'middle' : 'bottom'}
            />
          </div>

          {/* Attach and send CTAs */}
          <div className="flex items-center justify-end mt-2 space-x-2">
            <button
              onClick={handleAttachTextLayers}
              className="flex items-center justify-center w-10 h-10 bg-white rounded-xl hover:bg-stone-200 border border-stone-100 relative group transition duration-200"
            >
              <DocumentTextIcon className="h-5 w-5" />
              <span 
                className={`absolute bg-white text-sm shadow-lg px-2 py-1 rounded-md -top-10 left-1/2 transform -translate-x-1/2 ${
                  attachLayersError 
                    ? 'opacity-100 text-red-500' 
                    : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 text-gray-900'
                } whitespace-nowrap transition-all duration-200 ease-in-out`}
              >
                {attachLayersError || 'Attach selection text layers'}
              </span>
            </button>
            <button 
              onClick={handleAttachImage}
              className="flex items-center justify-center w-10 h-10 bg-white rounded-xl hover:bg-stone-200 border border-stone-100 relative group transition duration-200"
            >
              <PhotoIcon className="h-5 w-5" />
              <span 
                className={`absolute bg-white text-sm shadow-lg px-2 py-1 rounded-md -top-10 left-1/2 transform -translate-x-1/2 ${
                  attachImageError 
                    ? 'opacity-100 text-red-500' 
                    : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 text-gray-900'
                } whitespace-nowrap transition-all duration-200 ease-in-out`}
              >
                {attachImageError || 'Attach selection screenshot'}
              </span>
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!userInput.trim() || !selectedAgent || isLoading}
              className="w-fit bg-sky-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-xl hover:bg-sky-400 transition duration-200 relative group"
            >
              Send
            </button>
            <button
              onClick={handleDebugConversation}
              className="flex items-center rounded-xl px-2 py-1 bg-gray-200 text-xs relative group"
            >
              Debug
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}