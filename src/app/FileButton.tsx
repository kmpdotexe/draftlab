interface Props {
  /** The button's text; also the file input's accessible name. */
  label: string;
  /** The file types offered, as for `<input accept>`. */
  accept: string;
  /** The chosen file's text and name; null text when the file could not be read. */
  onText(text: string | null, fileName: string): void;
}

/** A button that opens the file picker and reads the chosen file as text. Choosing the same file again works. */
export function FileButton({ label, accept, onText }: Props) {
  return (
    <label className="file-button">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          let text: string;
          try {
            text = await file.text();
          } catch {
            onText(null, file.name);
            return;
          }
          onText(text, file.name);
        }}
      />
    </label>
  );
}
