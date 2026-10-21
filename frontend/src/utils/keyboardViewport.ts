/**
 * The part of the screen the keyboard leaves, for the dialogs: on an iPhone the
 * keyboard lies over the page without resizing it, so a dialog as tall as the
 * screen had its foot (Add this book, Create Book) under the keys. The visible
 * height and its offset, as --vv-h and --vv-top on the root, follow the
 * keyboard; field.css and App.css size a dialog to them on a touch screen.
 */
export const followKeyboard = (): (() => void) => {
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!viewport) return () => undefined;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--vv-h', `${Math.round(viewport.height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(viewport.offsetTop)}px`);
  };
  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
  };
};

export default followKeyboard;
