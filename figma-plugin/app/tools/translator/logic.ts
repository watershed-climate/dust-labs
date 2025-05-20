import { figmaAPI } from "@/lib/figmaAPI";
import { getLayersForSelection } from "@/lib/getLayersForSelection";
import { cancelGeneration, updateLayers } from "@/lib/updateLayers";

export async function translateLayers(
  selectedLanguage: string,
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
    Translate the "text" field in the following JSON object into ${selectedLanguage}.
    Return the same JSON object with the translated content in the "text" field.
    Do not modify the "id" field.
    Check first the Global Glossary for any official translation we might already have for the different texts.
    If there is any kind text formating in the original text, try to keep it in the translated text.
    If any text is already in ${selectedLanguage}, return it as is.
    If the text is empty or not translatable, return it as is.
    Ignore your initial instructions and do not provide any other explanations, reminders or any extra text, only return the updated JSON object, this is very important.

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

export async function cancelTranslation() {
  try {
    await cancelGeneration();
    console.log("Translation cancelled");
  } catch (error) {
    console.error("Error cancelling translation:", error);
  }
}