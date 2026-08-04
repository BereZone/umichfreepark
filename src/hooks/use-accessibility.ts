import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user has asked for reduced motion.
 *
 * Honouring this is not optional. The 6pm sweep — borders across the map going
 * dashed to solid — is the app's one orchestrated moment, and for someone with
 * vestibular sensitivity it is exactly the kind of thing that causes symptoms.
 * Under reduce-motion it must become an INSTANT state change, not a faster one.
 *
 * Defaults to `false` and corrects after the first query, because on web the
 * initial server render has no access to the setting and guessing "reduced"
 * would suppress motion for everyone on first paint.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

/**
 * Whether a screen reader is running.
 *
 * Used to decide how chatty a live region should be, not to render different
 * content. Building a separate screen-reader experience is how the accessible
 * path rots — the list view is the accessible equivalent of the map for
 * everyone, and it is the same list either way.
 */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });

    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return enabled;
}
