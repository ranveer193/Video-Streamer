import { useEffect } from 'react';

/**
 * Calls `handler` whenever a click/touch fires outside of `ref`.
 * Used by all dropdown menu components to close on outside click.
 */
function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler(e);
    };

    // mousedown fires before blur so menus close before focus shifts elsewhere
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, enabled]);
}

export default useClickOutside;