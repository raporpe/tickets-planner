import { createContext, useContext } from 'react';

export const DetailContext = createContext({ openItem: () => {} });
export const useDetail = () => useContext(DetailContext);

const INTERACTIVE = 'button, a, input, textarea, select, [role="combobox"], [role="option"], [contenteditable="true"]';

/** Click handler for a card/row: opens the detail panel unless the click hit a control (or came from a portaled popup). */
export function openOnClick(openItem, id) {
  return (e) => {
    if (!e.currentTarget.contains(e.target)) return;
    if (e.target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    openItem(id);
  };
}
