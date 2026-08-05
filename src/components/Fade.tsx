/**
 * The app's one piece of choreography: a panel arriving.
 *
 * CURB has exactly two moments worth animating, and this is the smaller one —
 * the sheet swapping between the trip controls and an area's detail. The other
 * is the 6pm sweep, which belongs to the map renderers because it is a property
 * change on hundreds of polygons rather than a view appearing.
 *
 * Everything else is instant on purpose. This app is read at a stoplight; a
 * transition is a delay before an answer, and the answer is the product.
 *
 * REDUCE MOTION IS A HARD ZERO
 *
 * Not a shorter duration — zero. Someone with vestibular sensitivity is not
 * asking for brisker animation, they are asking for none, and a 90ms slide is
 * still a slide. The component still mounts its children identically, so the
 * two paths differ only in whether anything moves.
 */

import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { duration } from '../theme';

/** How far the sheet travels. Small enough to read as "settling", not "flying in". */
const SLIDE_DISTANCE = 16;

/**
 * react-native-web has no native animation thread and warns when asked for one,
 * so the flag is platform-conditional rather than always true. Both properties
 * animated here are native-driver safe on iOS.
 */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function Fade({
  children,
  reduceMotion = false,
  /** Add a short upward travel. For panels that arrive from an edge. */
  slide = false,
  style,
}: {
  children: ReactNode;
  reduceMotion?: boolean;
  slide?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  /*
   * Lazy state rather than a ref, on purpose.
   *
   * An `Animated.Value` has to survive re-renders and must never be recreated,
   * which is what a ref is for — but the value is then read during render to
   * build the style, and reading `ref.current` in render is exactly what the
   * refs lint rule is there to catch. A state initialiser that never sets again
   * gives the same single instance while staying a legal render-time read.
   *
   * Starts settled when motion is off, so the first frame is already correct
   * and nothing has to be animated to zero to get there.
   */
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.standard,
      // Ease-out: fast at the start, settling at the end. An ease-in-out on an
      // entrance reads as hesitation.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: slide
            ? [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [SLIDE_DISTANCE, 0],
                  }),
                },
              ]
            : [],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
