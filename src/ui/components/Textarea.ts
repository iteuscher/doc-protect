export function createTextarea(
  placeholder?: string,
  value?: string,
  rows: number = 5
): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.rows = rows;
  if (placeholder) {
    textarea.placeholder = placeholder;
  }
  if (value) {
    textarea.value = value;
  }
  textarea.className = 'textarea';
  return textarea;
}

