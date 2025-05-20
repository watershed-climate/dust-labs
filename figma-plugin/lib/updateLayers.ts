import { figmaAPI } from "@/lib/figmaAPI";
import { getLayersForSelection } from "@/lib/getLayersForSelection";

interface StreamResponse {
  type: string;
  conversationId?: string;
  messageId?: string;
  text?: string;
  layers?: any[];
  error?: string;
}

let currentConversationId: string | null = null;
let currentMessageId: string | null = null;
let abortController: AbortController | null = null;

export async function cancelGeneration() {
  if (!currentConversationId || !currentMessageId) {
    console.warn('No active generation to cancel');
    return;
  }

  // Abort the ongoing fetch request
  if (abortController) {
    abortController.abort();
  }

  try {
    const response = await fetch('/api/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: currentConversationId,
        messageIds: [currentMessageId]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel generation: ${errorText}`);
    }

    const result = await response.json();
    
    currentConversationId = null;
    currentMessageId = null;
    
    return result;
  } catch (error) {
    console.error('Failed to cancel generation:', error);
    throw error;
  }
}

export async function updateLayers(
  endpoint: string,
  payload: any,
  onChainOfThought?: (text: string) => void,
  onResult?: (layers: any[] | null, error?: string) => void
): Promise<void> {
  // Create new abort controller for this request
  abortController = new AbortController();

  const layers = await getLayersForSelection();

  if (!layers.length) {
    figmaAPI.run((figma) => {
      figma.notify("Please select a layer.", { error: true });
    });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortController.signal // Add the abort signal
    });

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        let data: StreamResponse;
        try {
          data = JSON.parse(line);
        } catch (err) {
          console.warn("Skipping invalid JSON line:", line, err);
          continue; // Skip this line and continue
        }

        if (data.type === "ids") {
          currentConversationId = data.conversationId ?? null;
          currentMessageId = data.messageId ?? null;
        }

        if (data.type === "chain_of_thought" && onChainOfThought && typeof data.text === "string") {
          onChainOfThought(data.text);
        }
        if (data.type === "result" && onResult) {
          onResult(data.layers ?? null);

          // Update Figma layers with the new text
          await figmaAPI.run(async (figma, { translatedLayers }) => {
            if (Array.isArray(translatedLayers)) {
              for (const translatedLayer of translatedLayers) {
                const node = figma.getNodeById(translatedLayer.id);
                if (node && node.type === "TEXT") {
                  try {
                    if (node.fontName === figma.mixed) {
                      for (let i = 0; i < node.characters.length; i++) {
                        const fontName = node.getRangeFontName(i, i + 1) as FontName;
                        await figma.loadFontAsync(fontName);
                      }
                    } else {
                      await figma.loadFontAsync(node.fontName as FontName);
                    }
                    node.characters = translatedLayer.text || "";
                  } catch (error) {
                    figma.notify(`Failed to load font for layer ${translatedLayer.id}.`, { error: true });
                  }
                }
              }
            }
          }, { translatedLayers: data.layers });
        }
        if (data.error) {
          figmaAPI.run((figma) => {
            figma.notify("An error occurred while processing layers. Try again with a smaller selection", { error: true });
          });
          if (onResult) onResult(null, data.error);
          return;
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Request was cancelled');
      return;
    }
    figmaAPI.run((figma) => {
      figma.notify("An error occurred while processing layers. Please try again.", { error: true });
    });
    if (onResult) onResult(null, error instanceof Error ? error.message : String(error));
  } finally {
    abortController = null;
    currentConversationId = null;
    currentMessageId = null;
  }
}