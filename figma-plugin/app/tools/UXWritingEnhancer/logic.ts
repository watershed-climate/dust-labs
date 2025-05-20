import { figmaAPI } from "@/lib/figmaAPI";
import { getLayersForSelection } from "@/lib/getLayersForSelection";
import { updateLayers, cancelGeneration } from "@/lib/updateLayers";

export async function enhanceLayers(
  selectedAgent: String,
  onChainOfThought?: (text: string) => void,
  onResult?: (layers: any[] | null, error?: string) => void,
  onError?: (error: string) => void
): Promise<void> {
  const layers = await getLayersForSelection();

  if (!layers.length) {
    figmaAPI.run((figma) => {
      figma.notify("Please select a layer.", { error: true });
    });
    return;
  }

  const jsonPayload = {
    layers: layers.map((layer) => ({
      id: layer.id,
      text: layer.text,
    })),
  };

  const prompt = `
    Enhance the UX copy in the "text" field of the following JSON object.
    Return the same JSON object with improved UX writing in the "text" field.
    Do not modify the "id" field.
    If the text is already optimal, return it as is.
    If the text is empty or not improvable, return it as is.
    Ignore your initial instruction and do not provide any other explanations, reminders or any extra text, only return the updated JSON object, this is very important.

    ${JSON.stringify(jsonPayload, null, 2)}
  `;

  await updateLayers(
    "/api/tools",
    {
      prompt,
      layers,
      configurationId: selectedAgent,
    },
    onChainOfThought,
    (layers, error) => {
      if (error && onError) {
        onError(error);
      }
      if (onResult) {
        onResult(layers, error);
      }
    }
  );
}

export async function cancelEnhancement() {
  try {
    await cancelGeneration();
    console.log("Enhancement cancelled");
  } catch (error) {
    console.error("Error cancelling enhancement:", error);
  }
}