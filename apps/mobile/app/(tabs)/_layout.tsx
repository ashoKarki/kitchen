import { Tabs } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { usePushStatus } from "../../src/pushStatus";

type KitchenTab = "pantry" | "shopping" | "expenses" | "budgets" | "insights" | "settings";

const tabIcons: Record<KitchenTab, string[]> = {
  pantry: ["M3 10 12 3l9 7", "M5 9v12h14V9", "M9 21v-7h6v7"],
  shopping: ["M3 10h18l-2 11H5L3 10Z", "M8 10l4-7 4 7", "M8 14v3", "M12 14v3", "M16 14v3"],
  expenses: ["M6 3h12v18l-3-2-3 2-3-2-3 2V3Z", "M9 8h6", "M9 12h6", "M9 16h3"],
  budgets: ["M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z", "M4 7h16", "M15 13h5", "M15 13a1 1 0 1 0 0 .01"],
  insights: ["M4 20V4", "M4 20h17", "M8 16v-4", "M13 16V8", "M18 16V5"],
  settings: ["M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z", "m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"]
};

function TabIcon({ name, color, size }: { name: KitchenTab; color: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {tabIcons[name].map((path, index) => name === "budgets" && index === 3
        ? <Circle key={path} cx={17.5} cy={13} r={0.75} fill={color} />
        : <Path
          key={path}
          d={path}
          stroke={color}
          strokeWidth={name === "settings" ? 1.5 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />)}
    </Svg>
  );
}

export default function TabLayout() {
  const pushStatus = usePushStatus();
  return (
    <View style={{ flex: 1, backgroundColor: "#f5f8f2" }}>
      {(pushStatus.startsWith("Push registration failed") || pushStatus.startsWith("Kitchen setup failed")) && (
        <Text accessibilityRole="alert" style={{ backgroundColor: "#fff0ee", color: "#a53b32", padding: 10 }}>
          {pushStatus}
        </Text>
      )}
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: "#ffffff" },
          headerTintColor: "#26392e",
          tabBarActiveTintColor: "#31835d",
          tabBarInactiveTintColor: "#8a928c",
          tabBarStyle: { backgroundColor: "#ffffff" },
          tabBarIconStyle: { marginTop: 2 }
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Pantry", tabBarLabel: "Pantry", tabBarIcon: ({ color, size }) => <TabIcon name="pantry" color={color} size={size} /> }} />
        <Tabs.Screen name="shopping" options={{ title: "Shopping List", tabBarLabel: "Shopping", tabBarIcon: ({ color, size }) => <TabIcon name="shopping" color={color} size={size} /> }} />
        <Tabs.Screen name="expenses" options={{ title: "Expenses", tabBarLabel: "Expenses", tabBarIcon: ({ color, size }) => <TabIcon name="expenses" color={color} size={size} /> }} />
        <Tabs.Screen name="budgets" options={{ title: "Budgets", tabBarLabel: "Budgets", tabBarIcon: ({ color, size }) => <TabIcon name="budgets" color={color} size={size} /> }} />
        <Tabs.Screen name="insights" options={{ title: "Insights", tabBarLabel: "Insights", tabBarIcon: ({ color, size }) => <TabIcon name="insights" color={color} size={size} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarLabel: "Settings", tabBarIcon: ({ color, size }) => <TabIcon name="settings" color={color} size={size} /> }} />
      </Tabs>
    </View>
  );
}
