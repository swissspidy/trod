---
"trod": minor
---

Learning that runs by itself: `trod learn --auto <n>` makes trod's new SessionEnd hook start `trod learn` in the background after every n finished sessions (at most once per 6 hours, never while another learning run is going, and never counting sessions trod started itself). `trod learn --auto off` turns it off.
