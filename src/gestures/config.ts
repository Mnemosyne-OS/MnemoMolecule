/** What this cartridge's hand gestures are called and how fast they go. */
export const CARTRIDGE_ID = '@mnemosyne-plugins/mnemo-molecule';
/** One speed per hand move the person can tune: turning and coming closer. */
export const SPEED_KEYS = ['turn', 'zoom'] as const;
export type SpeedKey = (typeof SPEED_KEYS)[number];
/** The cartridge's own action, taught by the person in « My gestures ». */
export const SPIN_ACTION = 'spin';
