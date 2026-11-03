/** Shortest signed difference b - a between two angles. */
export function angleDiff(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
/** Frame-rate independent turn of angle `a` toward `b` (lambda ~ turn speed). */
export function dampAngle(a, b, lambda, dt) { return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt)); }
