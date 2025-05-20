import { figmaAPI } from "@/lib/figmaAPI";

export async function getLayersForSelection() {
  return await figmaAPI.run((figma) => {
    const { selection } = figma.currentPage;

    // Helper to check if a node and all its parents are visible
    const isNodeAndParentsVisible = (node: SceneNode): boolean => {
      let current: BaseNode | null = node;
      while (current) {
        if ("visible" in current && current.visible === false) {
          return false;
        }
        current = current.parent;
      }
      return true;
    };

    // Helper function to recursively find text nodes
    const findTextNodes = (node: SceneNode): { id: string; text: string }[] => {
      const layers: { id: string; text: string }[] = [];

      if (node.type === "TEXT" && isNodeAndParentsVisible(node)) {
        layers.push({ id: node.id, text: node.characters });
      } else if ("children" in node) {
        for (const child of node.children) {
          layers.push(...findTextNodes(child));
        }
      }

      return layers;
    };

    // Process all selected nodes
    const layers = selection.flatMap((node) => findTextNodes(node));

    return layers;
  });
}