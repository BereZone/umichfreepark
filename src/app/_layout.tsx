import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, useColorScheme, type ColorValue } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TripProvider } from '../state/trip';
import { colorsFor, type } from '../theme';

/**
 * Tabs rather than a stack.
 *
 * The list is the accessible equivalent of the map, so it has to be reachable
 * in one action from anywhere — not pushed onto a stack the user has to know
 * to navigate into. Tabs also keep both views alive, so switching between them
 * preserves the destination and duration rather than resetting them.
 */
export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <TripProvider>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.text,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Map',
                // Text glyphs rather than an icon font: nothing to download,
                // nothing to fail, and they scale with Dynamic Type.
                tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="◈" />,
              }}
            />
            <Tabs.Screen
              name="list"
              options={{
                title: 'List',
                tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="≡" />,
              }}
            />
            <Tabs.Screen
              name="learn"
              options={{
                title: 'Learn',
                tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="?" />,
              }}
            />
          </Tabs>
          <StatusBar style="auto" />
        </TripProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function TabGlyph({ color, glyph }: { color: ColorValue; glyph: string }) {
  return (
    // Hidden from assistive tech: the glyph repeats the tab's own title, and
    // VoiceOver reading "black diamond, Map" is worse than "Map". Decorative
    // imagery next to its own label should be silent.
    <Text style={[type.heading, { color }]} accessibilityElementsHidden importantForAccessibility="no">
      {glyph}
    </Text>
  );
}
