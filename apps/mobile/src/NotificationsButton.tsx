import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useBudgetAlerts } from "./useBudgetData";

export default function NotificationsButton() {
  const router = useRouter();
  const alerts = useBudgetAlerts();
  const unread = alerts.data?.filter(({ alert }) => !alert.read).length ?? 0;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={alerts.error ? "Notifications, unable to load" : `Notifications${unread ? `, ${unread} unread` : ""}`}
    onPress={() => router.push("/notifications")}
    style={{ padding: 8 }}
  >
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="#47584c" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
    {unread > 0 && <Text style={{ position: "absolute", top: 0, right: -3, color: "#fff", backgroundColor: "#b42318", borderRadius: 10, overflow: "hidden", fontSize: 10, fontWeight: "700", paddingHorizontal: 4 }}>{unread > 99 ? "99+" : unread}</Text>}
  </Pressable>;
}
