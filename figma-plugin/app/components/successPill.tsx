import React from "react";

interface SuccessPillProps {
  show: boolean;
  message?: string;
  className?: string;
}

export const SuccessPill: React.FC<SuccessPillProps> = ({
  show,
  message = "Translation complete",
  className = "",
}) => (
  <div
    className={`
      absolute left-1/2 -translate-x-1/2 bottom-14 flex justify-center items-center w-3/4
      transition-all duration-300 ease-in-out
      ${show ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
      ${className}
    `}
    aria-hidden={!show}
  >
    <div className="bg-sky-100 rounded-lg px-2 py-1.5 shadow-lg flex items-center gap-1 w-fit">
      <svg
        key={show ? "success" : "idle"}
        className="w-5 h-5 mx-auto text-sky-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          className="checkmark-path"
          d="M7 13l3 3 7-7"
          stroke="currentColor"
          fill="none"
        />
      </svg>
      <span className="text-xs w-fit">{message}</span>
    </div>
  </div>
);

export default SuccessPill;