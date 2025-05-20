import { figmaAPI } from "@/lib/figmaAPI";

export async function getImageForSelection() {
  return await figmaAPI.run(async (figma) => {
    const { selection } = figma.currentPage;
    
    if (selection.length === 0) {
      return { image: null, error: "No selection found" };
    }

    try {
      // Get the first selected node
      const node = selection[0];
      
      if (!('exportAsync' in node)) {
        return { image: null, error: "Selected element cannot be exported as image" };
      }

      // Export the node as PNG
      const bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 }
      });

      return { 
        image: bytes,
        error: null 
      };
    } catch (error) {
      return { 
        image: null, 
        error: "Failed to export image" 
      };
    }
  });
}