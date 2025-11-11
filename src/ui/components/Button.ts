export function createButton(
  text: string,
  onClick: () => void,
  className: string = ''
): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = text;
  button.className = `btn ${className}`;
  button.addEventListener('click', onClick);
  return button;
}

