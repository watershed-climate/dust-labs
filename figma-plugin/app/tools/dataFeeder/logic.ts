import { figmaAPI } from "@/lib/figmaAPI";
import { getLayersForSelection } from "@/lib/getLayersForSelection";
import { updateLayers, cancelGeneration } from "@/lib/updateLayers";

export async function feedLayers(
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
  Replace only the repetitive or placeholder "text" fields in each object of the following JSON array with realistic and appropriate data, based on the type of content. 
  Do not replace table headers, unique labels, or non-repetitive texts.
  - If the text looks like a date, replace it with a random but plausible date.
  - If the text looks like a name, replace it with a realistic random name.
  - If the text looks like a value (number, price, percentage, etc.), replace it with a random but plausible value of the same type.
  - If the text looks like an email, phone number, or address, replace it with a realistic random example.
  For other types of dummy or placeholder text, replace with realistic content matching the context.
  Preserve the original formatting, capitalization, and structure as much as possible.
  Do not modify the "id" field.
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

export async function cancelFeeding() {
  try {
    await cancelGeneration();
    console.log("Data feeding cancelled");
  } catch (error) {
    console.error("Error cancelling data feeding:", error);
  }
}