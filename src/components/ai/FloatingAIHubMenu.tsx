import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Blur,
  Canvas,
  Circle,
  ColorMatrix,
  Group,
  Paint,
} from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { RADII } from '../../theme/tokens';

const BUTTON_SIZE = 56;
const LIQUID_CANVAS_SIZE = 296;
const LIQUID_CANVAS_INSET = (LIQUID_CANVAS_SIZE - BUTTON_SIZE) / 2;
const LIQUID_CENTER = LIQUID_CANVAS_SIZE / 2;
const SATELLITE_SIZE = 48;
const GOOEY_ALPHA_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 18, -7,
];

export const MENU_SPRING = { mass: 0.72, damping: 18, stiffness: 210 } as const;
export type HubItemId = 'new-chat' | 'chat-history' | 'ai-settings' | 'thought-dump';
export type MenuDirection = -1 | 1;

interface HubItem {
  readonly id: HubItemId;
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly x: number;
  readonly y: number;
}

const HUB_ITEMS = [
  { id: 'new-chat', label: 'New chat', icon: 'add', x: 58, y: 85 },
  { id: 'chat-history', label: 'Chat history', icon: 'chatbubbles-outline', x: 80, y: 43 },
  { id: 'ai-settings', label: 'AI settings', icon: 'options-outline', x: 90, y: 1 },
  { id: 'thought-dump', label: 'Thought dump', icon: 'bulb-outline', x: 80, y: -41 },
] as const satisfies readonly HubItem[];

interface MenuGeometryProps {
  readonly item: HubItem;
  readonly horizontalDirection: MenuDirection;
  readonly verticalDirection: MenuDirection;
  readonly progress: SharedValue<number>;
}

function LiquidSatellite({
  item,
  horizontalDirection,
  verticalDirection,
  progress,
}: MenuGeometryProps) {
  const cx = useDerivedValue(
    () => LIQUID_CENTER + item.x * horizontalDirection * progress.value,
  );
  const cy = useDerivedValue(
    () => LIQUID_CENTER + item.y * verticalDirection * progress.value,
  );
  const radius = useDerivedValue(() => 10 + 14 * progress.value);

  return <Circle cx={cx} cy={cy} r={radius} />;
}

interface HubMenuItemProps extends MenuGeometryProps {
  readonly iconColor: string;
  readonly onPress: (itemId: HubItemId) => void;
}

function HubMenuItem({
  item,
  horizontalDirection,
  verticalDirection,
  progress,
  iconColor,
  onPress,
}: HubMenuItemProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: item.x * horizontalDirection * progress.value },
      { translateY: item.y * verticalDirection * progress.value },
      { scale: 0.72 + 0.28 * progress.value },
    ],
  }));

  return (
    <Animated.View style={[styles.satelliteAnchor, animatedStyle]}>
      <Pressable
        testID={`floating-ai.hub.${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        onPress={() => onPress(item.id)}
        style={styles.satelliteButton}
      >
        <Ionicons name={item.icon} size={22} color={iconColor} />
      </Pressable>
    </Animated.View>
  );
}

interface FloatingAIHubMenuProps {
  readonly menuOpen: boolean;
  readonly reduceMotionEnabled: boolean;
  readonly horizontalDirection: MenuDirection;
  readonly verticalDirection: MenuDirection;
  readonly progress: SharedValue<number>;
  readonly primaryColor: string;
  readonly iconColor: string;
  readonly labelColor: string;
  readonly surfaceColor: string;
  readonly onItemPress: (itemId: HubItemId) => void;
}

export function FloatingAIHubMenu({
  menuOpen,
  reduceMotionEnabled,
  horizontalDirection,
  verticalDirection,
  progress,
  primaryColor,
  iconColor,
  onItemPress,
}: FloatingAIHubMenuProps) {
  return (
    <>
      {!reduceMotionEnabled && (
        <Canvas
          pointerEvents="none"
          testID="floating-ai.button.liquid"
          style={styles.liquidCanvas}
        >
          <Group
            color={primaryColor}
            layer={
              <Paint>
                <Blur blur={4} />
                <ColorMatrix matrix={GOOEY_ALPHA_MATRIX} />
              </Paint>
            }
          >
            <Circle cx={LIQUID_CENTER} cy={LIQUID_CENTER} r={BUTTON_SIZE / 2} />
            {HUB_ITEMS.map((item) => (
              <LiquidSatellite
                key={item.id}
                item={item}
                horizontalDirection={horizontalDirection}
                verticalDirection={verticalDirection}
                progress={progress}
              />
            ))}
          </Group>
        </Canvas>
      )}

      {menuOpen && HUB_ITEMS.map((item) => (
        <HubMenuItem
          key={item.id}
          item={item}
          horizontalDirection={horizontalDirection}
          verticalDirection={verticalDirection}
          progress={progress}
          iconColor={iconColor}
          onPress={onItemPress}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  liquidCanvas: {
    position: 'absolute',
    width: LIQUID_CANVAS_SIZE,
    height: LIQUID_CANVAS_SIZE,
    top: -LIQUID_CANVAS_INSET,
    left: -LIQUID_CANVAS_INSET,
  },
  satelliteAnchor: {
    position: 'absolute',
    left: (BUTTON_SIZE - SATELLITE_SIZE) / 2,
    top: (BUTTON_SIZE - SATELLITE_SIZE) / 2,
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    zIndex: 2,
  },
  satelliteButton: {
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    borderRadius: RADII.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
