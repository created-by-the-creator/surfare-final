# Surf School artwork

The game uses the exact hero wave asset, `public/assets/Headbanner.png`, through
`ASSETS.waveBorder`. Its lower edge blends into a blue gradient sampled from
that same asset. This avoids stretching the foam into vertical white bars.
The decorative ocean has its own stacking context behind gates and gameplay.

`public/assets/surfy-surfing-body.png` is a transparent character layer created
with the built-in imagegen tool from `public/assets/surfy-surfing-left.png`.
The original hero sprite is preserved. The game composes the body with a separate
vector surfboard in `src/components/SurfyRider.jsx`. The rack, launch screen,
game introduction, and live rider use the same board renderer and selected index.

The four board designs are coral stripes, lagoon waves, sunset bands, and
midnight stars. Feet and board share one SVG coordinate system and animate as
one object. Unlock checks and the saved selection remain in the existing game
progress flow. There is no extra board painted over the old bitmap board.

## Final imagegen edit prompt

Edit target: attached existing Surfare Surfy surfing mascot PNG. Prepare ONE
production game sprite layer: remove ONLY the ivory surfboard completely and
remove scattered stray speckled pixels around the mascot. Preserve the entire
orange Surfy character in exactly this same crouching surfing pose, same
expression, proportions, direction, clothing, arms, two bare feet, illustration
style, colors, and original composition. Both feet must remain complete and
visible, with original sole positions, floating in place because a separate
vector surfboard will be rendered underneath by code. Keep his whole body, no
crop. Preserve original square 1254x1254 layout and his approximate original
position and scale so the feet align near bottom of image, original right foot
lower than left foot. Do not redraw or change character styling. No board, no
water, no shadows, no ground, no extra items, no text. Genuine transparent alpha
background, clean smooth cutout edges, no checkerboard or colored background.
This is an isolated character layer for an existing game; retain the supplied
character identity faithfully.

The generated output is 1280 × 1280 with alpha and is fitted to the shared 1254
coordinate system when rendered. The feet were checked against all four boards
at desktop and phone sizes.
