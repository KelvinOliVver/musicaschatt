/** Upper limits accepted by the streamer settings panel and stored preferences.
 * These are ceilings, not the live's active settings. Increasing them must
 * never silently modify the streamer's current saved choices.
 */
export const REQUEST_LIMITS = {
  cooldownSeconds: { min: 0, max: 604800 },    // 7 days
  maxPerUser: { min: 1, max: 1000 },
  maxQueue: { min: 1, max: 2000 },
  maxLinksPerMessage: { min: 1, max: 50 },
  maxDurationSeconds: { min: 0, max: 604800 }, // 0 = no time limit
} as const;
