import React from "react";
import { StopIcon } from "@heroicons/react/24/solid";

interface CancelPillProps {
  show: boolean;
  onClick: () => void;
  className?: string;
}

export const CancelPill: React.FC<CancelPillProps> = ({
  show,
  onClick,
  className = "",
}) => (
  <div
    className={`
      absolute left-1/2 -translate-x-1/2 flex justify-center items-center w-3/4
      transition-all duration-300 ease-in-out
      ${show ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
      ${className}
    `}
    aria-hidden={!show}
  >
    <div 
      onClick={onClick}
      className="bg-white hover:bg-stone-50 rounded-lg px-2 py-1.5 shadow-lg flex items-center gap-2 w-fit cursor-pointer border border-gray-100"
    >
      <StopIcon className="w-5 h-5 text-gray-700" />
      <span className="text-xs text-gray-700 font-medium">Stop generation</span>
    </div>
  </div>
);

export default CancelPill;