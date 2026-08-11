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
import {
  FLOATING_AI_BUTTON_SIZE,
  FLOATING_AI_HUB_ITEMS,
  FLOATING_AI_HUB_SATELLITE_SIZE,
  type FloatingAIHubItem,
  type HubItemId,
  type MenuDirection,
} from './floatingAIButtonGeometry';

const LIQUID_CANVAS_SIZE = 296;
const LIQUID_CANVAS_INSET = (
  LIQUID_CANVAS_SIZE - FLOATING_AI_BUTTON_SIZE
) / 2;
const LIQUID_CENTER = LIQUID_CANVAS_SIZE / 2;
const GOOEY_ALPHA_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 18, -7,
];

export const MENU_SPRING = {
  mass: 0.72,
  damping: 18,
  stiffness: 210,
  overshootClamping: true,
} as const;

interface HubItemContent {
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
}

const HUB_ITEM_CONTENT = {
  'new-chat': { label: 'New chat', icon: 'add' },
  'chat-history': { label: 'Chat history', icon: 'chatbubbles-outline' },
  'ai-settings': { label: 'AI settings', icon: 'options-outline' },
  'thought-dump': { label: 'Thought dump', icon: 'bulb-outline' },
} as const satisfies Record<HubItemId, HubItemContent>;

interface MenuGeometryProps {
  readonly item: FloatingAIHubItem;
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
  const content = HUB_ITEM_CONTENT[item.id];
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
        accessibilityLabel={content.label}
        onPress={() => onPress(item.id)}
        style={styles.satelliteButton}
      >
        <Ionicons name={content.icon} size={22} color={iconColor} />
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
            <Circle
              cx={LIQUID_CENTER}
              cy={LIQUID_CENTER}
              r={FLOATING_AI_BUTTON_SIZE / 2}
            />
            {FLOATING_AI_HUB_ITEMS.map((item) => (
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

      {menuOpen && FLOATING_AI_HUB_ITEMS.map((item) => (
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
    left: (FLOATING_AI_BUTTON_SIZE - FLOATING_AI_HUB_SATELLITE_SIZE) / 2,
    top: (FLOATING_AI_BUTTON_SIZE - FLOATING_AI_HUB_SATELLITE_SIZE) / 2,
    width: FLOATING_AI_HUB_SATELLITE_SIZE,
    height: FLOATING_AI_HUB_SATELLITE_SIZE,
    zIndex: 2,
  },
  satelliteButton: {
    width: FLOATING_AI_HUB_SATELLITE_SIZE,
    height: FLOATING_AI_HUB_SATELLITE_SIZE,
    borderRadius: RADII.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
