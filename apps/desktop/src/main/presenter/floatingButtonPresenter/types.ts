export interface FloatingButtonConfig {
  /** Whether the floating button is enabled */
  enabled: boolean;
  /** Floating button position */
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Offset from the screen edge */
  offset: {
    x: number;
    y: number;
  };
  /** Floating button size */
  size: {
    width: number;
    height: number;
  };
  /** Whether to keep always on top */
  alwaysOnTop: boolean;
  /** Opacity (0-1) */
  opacity: number;
}

export interface FloatingButtonState {
  /** Whether it is currently visible */
  isVisible: boolean;
  /** Current position */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FloatingButtonEvents {
  /** Floating button clicked */
  "floating-button-clicked": void;
  /** Floating button visibility changed */
  "floating-button-visibility-changed": { visible: boolean };
  /** Floating button position changed */
  "floating-button-position-changed": { x: number; y: number };
}

export const DEFAULT_FLOATING_BUTTON_CONFIG: FloatingButtonConfig = {
  enabled: true,
  position: "bottom-right",
  offset: {
    x: 20,
    y: 20,
  },
  size: {
    width: 60,
    height: 60,
  },
  alwaysOnTop: true,
  opacity: 1,
};
