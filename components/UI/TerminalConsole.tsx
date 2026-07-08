import { ChevronRight } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

export interface LogLine {
  time: string;
  level: 'info' | 'ok' | 'warn' | 'error';
  text: string;
}

const LEVEL_COLOR: Record<LogLine['level'], string> = {
  info: 'text-console-muted',
  ok: 'text-accent-green',
  warn: 'text-accent-amber',
  error: 'text-accent-red',
};

/**
 * Command-line console panel: monospace scrollback of real system events
 * plus a live input. Supports a small set of real commands (not decorative)
 * so it's an actual control surface, not just a log viewer.
 */
export const TerminalConsole: React.FC<{
  lines: LogLine[];
  onCommand?: (cmd: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
}> = ({ lines, onCommand, placeholder = 'Type a command…', className = '' }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, history]);

  const submit = async () => {
    const cmd = input.trim();
    if (!cmd) return;
    setHistory((h) => [...h, cmd]);
    setInput('');
    if (onCommand) await onCommand(cmd);
  };

  return (
    <div
      className={`bg-console-bg border border-console-border rounded-sm ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-console-border px-4 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-red" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent-amber" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-console-muted">
          system terminal
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-56 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed"
      >
        {lines.length === 0 && (
          <div className="text-console-muted">// no activity yet</div>
        )}
        {lines.map((l, i) => (
          <div key={i} className="flex gap-3">
            <span className="shrink-0 text-console-muted">{l.time}</span>
            <span className={LEVEL_COLOR[l.level]}>{l.text}</span>
          </div>
        ))}
        {history.map((h, i) => (
          <div key={`h-${i}`} className="flex gap-2 text-console-text">
            <ChevronRight size={12} className="mt-0.5 text-accent-cyan" />
            <span>{h}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-console-border px-4 py-2.5">
        <span className="font-mono text-accent-cyan">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={placeholder}
          className="w-full bg-transparent font-mono text-sm text-console-text placeholder:text-console-muted focus:outline-none"
        />
      </div>
    </div>
  );
};

export default TerminalConsole;
