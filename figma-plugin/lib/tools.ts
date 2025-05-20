export interface Tool {
    id: string;
    name: string;
    description: string;
    icon: string; // Emoji or image URL
    Component: React.FC; // The UI component for the tool
  }