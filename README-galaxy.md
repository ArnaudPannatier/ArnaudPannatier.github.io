# Galaxy homepage

Homepage for https://arnaudpannatier.github.io/ and https://arnaudpannatier.ch/,
based on the original content at revision `9feb97a8fd680ba96c47594406e3c8a9696e5be1`.

```sh
python3 -m http.server 5180 --bind 127.0.0.1
```

Open http://127.0.0.1:5180. No build or package installation is needed.

The original Montserrat typeface, portrait, biography, publication entries,
and links are retained. Spacing, type sizes, the portrait frame and publication
formatting are refined, with a subtle reading backdrop present from the first
frame, including the galaxy-only opening. It fades away during the closing
galaxy view. Controls accommodate small screens and
display safe areas. The site starts in dark mode. The small half-dark,
half-white button at the top right switches themes and remembers the choice.

The opening shows the filtered simulation alone for 2.2 seconds, then fades in
the page without changing the background brightness.
Scrolling or using the keyboard reveals it immediately. Near the end of the
biography, continued native scrolling carries the text upward while the desktop
profile slides left. Extra space allows the text to leave the viewport and the
simulation to become fully visible again. On mobile the original stacked layout
scrolls normally. Reduced motion skips the opening and lateral motion.

Bottom-right telemetry reports the actual active GPU particle count and measured
animation frames per second, measured with the latest simulation’s rolling
half-second frame meter and updated four times per second. FPS is zero while paused
and unavailable values use a dash. The Galaxy link opens `simulation/`, a local
copy of the full built `ncorps` experiment, including its controls.

The WebGL background pauses in hidden tabs, respects reduced motion, and falls
back to a plain background without blocking content when WebGL is unavailable.
The original Google Fonts request is retained.

`galaxy-background/background.js` caps the adaptive simulation at 65,536 particles.
`galaxy-background/page.js` manages the introduction, theme and scroll sequence. The camera
has an optional non-interactive mode. The renderer, shaders, and adaptive
controller and frame meter are copied from the latest `../ncorps/src/`.
The local full simulation is rebuilt from that same source and includes
solid-particle rendering, opacity controls, zoom and Full perf mode. The gravitational model is
illustrative rather than an exact N-body solver.

## Browser checks

With the server running and the existing `../ncorps` Playwright installation:

```sh
node tests/preview.mjs
```

Screenshots are saved in the ignored `preview/` directory.

## Publishing

GitHub Pages serves the repository root on `master`. Push a verified release
to that branch to publish. The `.nojekyll` marker keeps the site fully static.

For Infomaniak, update `index.html`, `tailwind.css`, `galaxy-background/` and
`simulation/` under `sites/arnaudpannatier.ch`. Stage and verify the assets
first, back up the previous files outside the web root, and replace the
homepage last. Leave other site directories in place, including the independent
`/galaxy/` experiment. The homepage uses `galaxy-background/` specifically to
avoid that path. Deployment records and screenshots belong in `preview/`.
