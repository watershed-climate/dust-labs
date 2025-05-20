import Translator from "./translator";
import DataFeeder from "./dataFeeder";
import UXWriter from "./UXWritingEnhancer";
import ComponentFinder from "./componentFinder";

export const tools = [
  {
    id: "translator",
    name: "Translator",
    description: "Translate all the text layers in the selection into the selected language.",
    icon: "💬", // You can replace this with an appropriate emoji or image URL
    color: "blue", // Optional: Add a color for the tool
    author: "Lilian Desvaux de Marigny", // Optional: Add author name
    Component: Translator,
  },
  {
    id: "uxwriter",
    name: "UX Writer",
    description: "Check and enhance the copy of all the text layers in the selection based on our tone of voice and guidelines.",
    icon: "🖋️", // You can replace this with an appropriate emoji or image URL
    color: "green", // Optional: Add a color for the tool
    author: "Lilian Desvaux de Marigny", // Optional: Add author name
    Component: UXWriter,
  },
  {
    id: "datafeeder",
    name: "Data Feeder",
    description: "Replace all dummy text layers in the selection with realistic and appropriate data.",
    icon: "📊", // You can replace this with an appropriate emoji or image URL
    color: "red", // Optional: Add a color for the tool
    author: "Lilian Desvaux de Marigny", // Optional: Add author name
    Component: DataFeeder,
  },
  // {
  //   id: "componentfinder",
  //   name: "Component Finder",
  //   description: "Search for the best component for the use-case you are working on, and insert it if found.",
  //   icon: "🔎", // You can replace this with an appropriate emoji or image URL
  //   color: "yellow", // Optional: Add a color for the tool
  //   author: "Lilian Desvaux de Marigny", // Optional: Add author name
  //   Component: ComponentFinder,
  // },
  // Add other tools here as needed
];