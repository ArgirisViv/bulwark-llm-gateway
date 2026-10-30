import { useEffect, useMemo, useRef, useState } from "react";
import { IconCommand, IconSearch } from "./icons";
import { Kbd } from "./ui";

export type Command = { id: string; title: string; group: string; hint?: string; run: () => void };

export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.group} ${command.title}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => Math.min(results.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = results[cursor];
      if (command) {
        onClose();
        command.run();
      }
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="palette-layer" onKeyDown={onKeyDown}>
      <div className="scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <IconSearch size={16} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command or jump to a view…"
            aria-label="Command"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="palette-list">
          {results.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                className={index === cursor ? "is-active" : ""}
                onMouseMove={() => setCursor(index)}
                onClick={() => {
                  onClose();
                  command.run();
                }}
              >
                <span className="palette-group">{command.group}</span>
                <span className="palette-title">{command.title}</span>
                {command.hint && <Kbd>{command.hint}</Kbd>}
              </button>
            </li>
          ))}
          {!results.length && <li className="palette-empty">No matching commands</li>}
        </ul>
        <div className="palette-foot">
          <IconCommand size={13} /> Bulwark command palette
        </div>
      </div>
    </div>
  );
}
