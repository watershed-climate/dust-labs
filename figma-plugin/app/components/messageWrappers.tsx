import React from "react";
import { InlineMath, BlockMath } from 'react-katex';

export const TableWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto my-4">
    <table>{children}</table>
  </div>
);

export const JsonWrapper = ({ children }: { children: string }) => {
  try {
    const jsonObj = JSON.parse(children);
    return (
      <pre className="bg-gray-50/50 rounded-xl overflow-x-auto">
        <code className="text-sm font-mono">
          {JSON.stringify(jsonObj, null, 2)
            .split('\n')
            .map((line, i) => {
              const indentLevel = (line.match(/^\s*/) || [''])[0].length / 2;
              const indent = '  '.repeat(indentLevel);
              
              const lineWithColors = line
                .trimStart()
                .replace(/"([^"]+)":/g, '<span class="text-orange-500">"$1"</span>:')
                .replace(/: "([^"]+)"/g, ': <span class="text-green-600">"$1"</span>')
                .replace(/: (-?\d+\.?\d*)/g, ': <span class="text-blue-600">$1</span>')
                .replace(/: (true|false|null)/g, ': <span class="text-purple-600">$1</span>');

              return (
                <div 
                  key={i} 
                  className="leading-6"
                  style={{ paddingLeft: `${indentLevel * 12}px` }}
                  dangerouslySetInnerHTML={{ 
                    __html: indent + lineWithColors
                  }} 
                />
              );
            })}
        </code>
      </pre>
    );
  } catch (error) {
    return <pre className="bg-gray-50/50 rounded-xl p-4"><code>{children}</code></pre>;
  }
};

export const ListWrapper = ({ ordered, children }: { ordered: boolean, children: React.ReactNode }) => (
  <div className="my-2">
    {ordered ? (
      <ol className="list-decimal pl-6 space-y-1">{children}</ol>
    ) : (
      <ul className="list-disc pl-6 space-y-1">{children}</ul>
    )}
  </div>
);

export const BlockquoteWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="my-4">
    <blockquote className="pl-4 border-l-4 border-gray-200 py-2 pr-2 rounded-r-lg">
      {children}
    </blockquote>
  </div>
);

export const MathWrapper = ({ inline, children }: { inline: boolean; children: string }) => {
  try {
    return inline ? (
      <InlineMath math={children} />
    ) : (
      <div className="my-4">
        <BlockMath math={children} />
      </div>
    );
  } catch (error) {
    return <code>{children}</code>;
  }
};

export const formatMessageContent = (content: string): string => {
  try {
    const jsonObj = JSON.parse(content);
    return "```json\n" + JSON.stringify(jsonObj, null, 2) + "\n```";
  } catch {
    content = content.replace(
      /:::visualization([\s\S]*?):::/g,
      '```visualization\n$1\n```'
    );

    return content
      .replace(/\$\$([\s\S]*?)\$\$/g, '```math\n$1\n```')
      .replace(/\$([^\n$]*?)\$/g, '`math-inline\n$1\n`')
      .replace(/\\n/g, '\n');
  }
};