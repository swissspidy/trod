# Unscoreable task types

- **hover-shape**: the task computes a hover score every 33 ms, but the call that would report it is commented out upstream (`// core.continuousReward(score);` with "TODO: Convert to the normal reward."). The episode never ends and never gives a reward, whatever the agent does. With our 24 h episode limit the raw reward is always 0. Excluded from the "100%" target, and reported separately.
