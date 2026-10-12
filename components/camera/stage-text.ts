/**
 * Where the text of the live camera stage sits (issue 618, owner feedback 2026-10-12: "the hint is half hidden behind the round shutter button").
 *
 * The shutter is a `fixed` button, at the bottom centre of the window for a device that reports portrait (a desktop window does: its screen
 * orientation angle is 0 whatever the window's shape), at the right or left centre for a phone held sideways. The stage is the camera's own shape
 * fitted into the window, so on a desktop or a tall phone stage it reaches the bottom of the window and the shutter lies over the bottom of the
 * stage. Text drawn at the bottom of the stage (the frame hint, the capture notice, the readout) was then under the button.
 *
 * So the lines of text sit at the TOP of the stage, in one column under the view controls: nothing else is fixed to the top of the stage, and a
 * line cannot sit on another. Never put a line of text at the bottom of the stage again: `stage-text.test.ts` fails on it.
 */
export const STAGE_TOP_CLASS = 'pointer-events-none absolute inset-x-0 top-2 z-20 flex flex-col items-center gap-2 px-2 text-center text-xs';
