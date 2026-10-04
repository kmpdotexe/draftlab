import { useId, useState } from 'react';
import type { ID } from '../../domain/id';
import { shareText, type Option } from './options';

interface Props {
  label: string;
  options: readonly Option[];
  /** The chosen id, or undefined for none. */
  value: ID | undefined;
  /** What the box shows when it is not being typed in. */
  valueName: string;
  /** The choice that clears the value, e.g. "No item". */
  noneLabel: string;
  onChange(id: ID | undefined): void;
}

const MAX_OPTIONS = 8;

const optionText = (option: Option): string => (option.share === null ? option.name : `${option.name} (${shareText(option.share)})`);

/**
 * A combobox over a fixed list of options (an item, a move): type to filter by name, arrows to move, Enter or a
 * click to choose, Escape to stop. The none choice comes last in the list.
 */
export function OptionPicker({ label, options, value, valueName, noneLabel, onChange }: Props) {
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const needle = (query ?? '').trim().toLowerCase();
  const shown =
    query === null
      ? []
      : [
          ...options.filter((option) => option.name.toLowerCase().includes(needle)).slice(0, MAX_OPTIONS),
          { id: '', name: noneLabel, share: null },
        ];
  const current = Math.min(active, Math.max(shown.length - 1, 0));

  const choose = (index: number) => {
    const option = shown[index];
    if (!option) return;
    onChange(option.id === '' ? undefined : option.id);
    setQuery(null);
    setActive(0);
  };

  return (
    <div className="picker">
      <label htmlFor={`${listId}-input`}>{label}</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? `${listId}-${current}` : undefined}
        autoComplete="off"
        placeholder={noneLabel}
        value={query ?? (value === undefined ? '' : valueName)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onBlur={() => setQuery(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (query === null) setQuery('');
            else setActive(Math.min(current + 1, shown.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(current);
          } else if (event.key === 'Escape') {
            setQuery(null);
          }
        }}
      />
      {shown.length > 0 && (
        <ul id={listId} role="listbox" className="options">
          {shown.map((option, index) => (
            <li
              key={option.id === '' ? '(none)' : option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {optionText(option)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
