/**
 * Chrome Android starts AudioContext as `suspended` unless it is created
 * (and resumed) in the user-gesture stack that started capture. Creating a
 * fresh context later, inside chunk processing, often leaves decodeAudioData
 * hanging or throwing.
 */
export async function unlockAudioContext(
  create: () => AudioContext = () => new AudioContext(),
): Promise<AudioContext> {
  const context = create();
  if (context.state === "suspended") {
    await context.resume();
  }
  return context;
}
