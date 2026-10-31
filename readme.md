# Composition browser — the squirrel-proof guide

This is the composition gallery with the endlessly scrolling score covers and short background videos when you enter a composition.

Everything a composition shows on the page lives in one data file, [lib/catalog.json](lib/catalog.json). You do not edit it by hand. While the site runs there are two editors: **http://localhost:3000/editlive** edits the real page by clicking and dragging, and **http://localhost:3000/edit** is the same catalog as a form. Both also answer with `.html` on the end.

## Pick the thing you came here to do

| I want to… | Go here |
| --- | --- |
| Open the site and work on it | [Start the site](#start-the-site) |
| Change things by clicking and dragging on the page itself | [The live editor](#the-live-editor) |
| Change a title, year, blurb, cover crop, or room image in a form | [The table editor](#the-table-editor) |
| Add a brand-new composition | [Add a composition](#add-a-composition) |
| Pull in pieces from the old player's tracks.json | [Import the old catalog](#import-the-old-catalog) |
| Know what a field does | [Field reference](#field-reference) |
| Attach a video, or change its timing, speed, or look | [Video settings](#video-settings) |
| Attach a real recording to the in-room player | [Audio](#audio) |
| Make a video replay while experimenting | [The cooldown switch](#the-cooldown-switch) |
| Change the cover scroll speed | [Cover scrolling](#cover-scrolling) |
| Figure out why nothing happened | [Something is not working](#something-is-not-working) |

## Start the site

You need Node.js and npm installed. Use Terminal for the commands below.

**1. Go into the project.** Copy this whole line, paste it into Terminal, and press Return:

```sh
cd /Users/alex/Documents/Cufolio/composition-browser
```

**2. Start development mode:**

```sh
npm run dev
```

**3. Leave that Terminal window running.** Open the `Local` address it prints in your browser. It is usually `http://localhost:3000`; use the printed address if the port is different.

**4. Open an editor** in a second tab: `http://localhost:3000/editlive` to work on the page itself, or `http://localhost:3000/edit` for the form. Save there and the gallery tab updates by itself.

**To stop the site:** click the running Terminal window and press **Control+C**.

**If the dependencies are missing:** run this from the project folder, let it finish, then try `npm run dev` again:

```sh
npm install
```

## The live editor

`http://localhost:3000/editlive` shows the real page with a small glass panel floating over it. Neither exists on the deployed site.

| Do this on the page | What changes |
| --- | --- |
| Click any text and type | The title lines, year, place, ensemble, duration, and inside a composition the eyebrow, paragraph and meta line. Enter or clicking away keeps it, Escape puts it back. An empty line is removed; the panel has **Add a title line**. |
| Drag the big cover | Which part of the sheet shows (`cover.position`). |
| Scroll over the big cover | Zoom in and out (`cover.size`). It never gets smaller than the cover box. |
| Click the big cover | Choose or upload a different image. |
| Press play, then drag the empty background while the video shows | Where the video is cropped (`intro.position`). |
| Drag the empty background while the still room shows | Where the room image is cropped (`room.position`). |

The panel holds the rest. It drags by its title bar and remembers where you left it.

| Panel section | Shows | Controls |
| --- | --- | --- |
| Composition | always | title, id, order arrows, **Home**, add, duplicate, delete |
| Cover, Gallery | in the gallery | whole image or crop, zoom, look sliders, backdrop image, intro cooldown |
| Room | inside a composition | image, color, stars, tint (direction, color, strength), look sliders |
| Intro video | inside a composition | on/off, video file, fill or whole frame, start, play, speed, delay, tint, look |
| Sound | inside a composition | the recording |

**Look** is the CSS `filter` as sliders: brightness, contrast, saturation, grayscale, sepia, blur. **Tint** is the overlay gradient as a direction, a color and a strength; anything it cannot express shows as **custom** CSS.

Inside a composition the video keeps looping so you can place it. Untick **Show** to see the still room, or press **Replay timing** to watch the real delay, play and stop once.

**Undo and redo** are ⌘Z and ⇧⌘Z, or the arrows in the panel. Every drag, slider release and text edit is one step. **Save** is ⌘S. Nothing is written until you save.

### Matching the video to the room

When the video closes, the still room appears underneath it. If the two differ, the visitor sees a cut. In the Intro video section, tick **Hold the last frame and compare it with the room**. The video parks on the frame the visitor sees last, and a vertical line appears on the page: left of it is that frame, right of it is the room. Drag the line, or use the slider. **Blend** fades the frame over the room instead, which shows color differences as ghosting. **Hold to hide the frame** flips between the two while pressed.

Three buttons close the gap:

| Button | What it does |
| --- | --- |
| Use the frame as the room image | Saves the frame as a JPEG in `public/images`, sets it as the room image, and copies the video's crop position so they line up. The cut becomes invisible. |
| Match the room color | Sets the room's flat color to the frame's average color. Useful for gradient-only rooms. |
| Copy tint and look to the room | Copies the video's overlay and filter onto the room. |

Changing **start**, **play** or **speed** while holding moves the held frame, so you can also pick a better frame to end on.

## The table editor

`http://localhost:3000/edit` only exists while `npm run dev` is running. The deployed site does not have it.

| Column | What it does |
| --- | --- |
| Left | **Site settings** (home piece, gallery backdrop, intro cooldown) and the list of compositions in page order. Arrows reorder, **Add** makes a blank piece, **Import…** pulls from the old catalog. |
| Middle | The form for the selected piece: Text, Cover, Room, Intro video, Sound. |
| Right | A live preview of the cover, the room with its title, and the intro video. |

**Saving.** The Save button (or ⌘S) writes [lib/catalog.json](lib/catalog.json). The gallery tab reloads on its own. Save stays grey while the red list at the top shows a problem, such as two pieces with the same id or a video with no file.

**Choosing files.** Every image, video, and recording field has a **Choose** button. It opens everything already in `public/`, and you can drop new files on it to add them. Images and videos land in `public/images`, recordings in `public/audio`. You can also type a path: files inside `public/` are written without `public`, so `public/content/covers/raven-room.png` is `/content/covers/raven-room.png`.

**Cropping a cover from a sheet.** Under Cover, pick **Crop from a sheet**, then drag the white frame over the part you want. Drag its corner or scroll to resize. The frame keeps the cover's shape. **Whole image** uses the file as is.

## Add a composition

1. Click **Add** at the bottom of the left column.
2. Fill in the text. Give it a short `id` made of letters, numbers, and dashes.
3. Choose a cover image, then a room image or an overlay gradient.
4. Optionally turn on **Play a video on entry** and choose a recording under Sound.
5. Save. The `01—03` counts in the header and footer update by themselves.

**Duplicate** and **Delete** sit at the top of the form. Deleting a piece never deletes its files.

## Import the old catalog

**Import…** reads the older player's `tracks.json` and makes one composition per family (so the four Raven movements become one piece). It copies the family's cover into `public/content/covers/covers`. Tick the box to also copy the recordings, which are large. Nothing touches the catalog until you Save, and families whose id already exists are skipped, so running it twice is safe.

Imported pieces have empty `place`, `world`, and `note` fields and a plain dark room. Fill those in afterwards.

## Field reference

The editor labels match these names. Every file path is a URL without `public`.

### Text fields

| Field | What it is |
| --- | --- |
| `id` | Short unique name. Used in storage and for `homeId`. Letters, numbers, dashes. |
| `title` | Full title, used in labels and captions. |
| `lines` | The title split into display lines, e.g. `["The Raven", "Cantata"]`. |
| `year`, `place`, `ensemble`, `duration` | Shown under the title in the gallery and inside the composition. |
| `world` | Small eyebrow text inside the composition, e.g. `"Inside the raven’s chamber"`. |
| `note` | The paragraph inside the composition. |

### Cover

`cover` is the score artwork in the gallery.

| Field | What to put there | What happens |
| --- | --- | --- |
| `src` | `"/content/covers/reference.png"` | The image file. All three current covers are cropped from this one sheet. |
| `size` | `"400% 183.08%"` | How big the sheet is relative to the cover box. Leave out for `cover`. |
| `position` | `"26.04% 27.09%"` | Which part of the sheet shows. Leave out for `center`. |
| `filter` | `"grayscale(1)"`, `"sepia(.4)"`, `"contrast(1.2)"` | CSS filter on the cover. Leave out for none. |

For a cover that is its own image file, set `src` to that file and leave `size` and `position` out.

### Room

`room` is the full-screen background inside the composition.

| Field | What to put there | What happens |
| --- | --- | --- |
| `src` | `"/content/covers/raven-room.png"` | The room image. Leave out for a gradient-only room. |
| `overlay` | `"linear-gradient(90deg,#0b080787,#0b080715)"` | Gradient layers drawn over the image. With no `src`, this is the whole backdrop. Several layers go in one string separated by commas. |
| `position` | `"50% 100%"` | Which part of the image stays in view when it is cropped to the screen. Leave out for center. |
| `color` | `"#070d19"` | Flat color behind everything. Leave out for near-black. |
| `filter` | `"grayscale(1)"`, `"brightness(.8)"` | CSS filter on the image and overlay. Leave out for none. |
| `stars` | `true` | Adds the twinkling star layer. Leave out for none. |

### Video settings

`intro` is the short silent video that plays when you enter the composition. Leave `intro` out entirely for no video.

| Field | What to put there | What happens |
| --- | --- | --- |
| `src` | `"/content/covers/Ravenical.m4v"` | The video file. Must be a browser-friendly H.264 MP4 or M4V. |
| `start` | `12.5` | Seconds into the file where playback begins. Leave out for `0`. |
| `play` | `4` | Seconds the video stays on screen. Required. The file ending sooner also stops it. |
| `speed` | `1`, `0.5`, `2` | Playback rate. `0.5` is half speed, `2` is double. Leave out for `1`. |
| `delay` | `1.5` | Seconds after entering before the video appears. Leave out for `0`. |
| `fit` | `"cover"` or `"contain"` | `cover` fills the screen and may crop edges. `contain` shows the whole frame. |
| `position` | `"50% 100%"` | Crop focus when `fit` is `cover`. `50% 50%` centers it; `50% 0%` favors the top. |
| `filter` | `"grayscale(1) contrast(1.2)"` | CSS filter on the video. Leave out for none. |
| `overlay` | `"linear-gradient(90deg,#070d1980,transparent)"` or `"#00000040"` | A tint over the video, useful for keeping text readable. Leave out for none. |

`play` counts screen time, so `play: 4, speed: 2` shows eight seconds of footage in four seconds.

Videos play **silently**, behind the composition's text and controls. Leaving the composition stops its video. Missing or unplayable videos fall back to the still room.

To style the whole page only while a video is showing, use `.music-room.intro-playing` in [app/globals.css](app/globals.css). For example, `.music-room.intro-playing .immersive-heading { opacity: .5; }`.

### Audio

| Field | What to put there | What happens |
| --- | --- | --- |
| `audio` | `"/audio/raven.mp3"` | A real recording for the in-room play button. The label changes to `RECORDING`. |
| `tones` | `[146.83, 174.61, 220]` | Pitches in Hz for the synthesized ambient preview, used only when there is no `audio`. |

Put audio files in `public/audio` (create the folder) and reference them as `/audio/…`.

## The cooldown switch

In the editor, open **Site settings** and change **Intro cooldown (hours)**.

| Value | Behavior |
| --- | --- |
| `0` | Play on every entry. Use this while experimenting. |
| `24` | Play at most once per composition, per browser, every 24 hours. |
| Another positive number | Wait that many hours between showings. Decimals work, such as `0.5`. |

The clock starts when video playback begins. Watching Raven does not use up Midnight's showing.

**Your last test playback counts.** If you change `0` back to `24`, a video you just watched waits until its cooldown expires. The browser remembers showings across page reloads; a different browser or cleared site storage starts fresh.

## Cover scrolling

Scroll the mouse or trackpad, use the left/right arrow keys, use the onscreen arrows, swipe horizontally on a touch screen, or click a neighboring cover. The covers loop in both directions. **Escape** returns from a composition or closes an information panel.

To change scroll speed, open [app/globals.css](app/globals.css), search for `--score-scroll-duration`, and change its value in the `.gallery` rule:

```css
--score-scroll-duration: 800ms;
```

`400ms` is faster, `800ms` is the current setting, and `1200ms` is slower.

Visitors with reduced motion enabled get near-instant cover transitions and still backgrounds instead of intro videos.

## Something is not working

| What you see | What to do |
| --- | --- |
| The site will not open | Start `npm run dev` in the project folder, leave Terminal running, and use the `Local` address it prints. |
| Changes do not appear | Save the file. Confirm the browser address matches the running server. Refresh once. If needed, Control+C and `npm run dev` again. |
| Save is grey | Read the red list (top of the left column, or top of the live editor's panel) and fix what it names. |
| `/edit` or `/editlive` shows a 404 | The editors only exist in development mode. Start `npm run dev` and use its `Local` address. |
| Clicking text in the live editor does nothing | Text is only editable while the inspector panel is present. If the page was opened at `/` instead of `/editlive`, switch tabs. |
| Arrow keys move the gallery while typing | Click into the text first; keys only browse when nothing is being edited. |
| A red error appears after editing by hand | If you changed `lib/catalog.json` yourself, check for a missing comma, quote, or bracket. Undo and save to get back. |
| A video does not repeat | Set the intro cooldown to `0` in Site settings, save, return to the room, then enter the piece again. |
| A video never appears | Confirm you entered the composition, rather than only selected it. Check `intro.src`. Check the browser's reduced-motion setting. |
| You suspect a file path | Open its URL directly, for example `http://localhost:3000/content/covers/Ravenical.m4v`. A missing-file page means the path or filename is wrong. |
| You changed `start` and now see no video | `start` must be before the file's end; `play` must be greater than zero. |
| The file exists but will not play | Its encoding needs browser support. Use an H.264 MP4; renaming an extension does not convert it. |
| The picture is cropped | Set Fit to `contain`, or change Position to move the crop focus. |
| The cover shows the wrong part of the sheet | Under Cover, drag the crop frame. |
| The room is black | `room` needs a `src`, an `overlay`, or both. Check the file path. |
| There is no sound from the video | Intro videos are intentionally muted. Sound comes from `audio`, or the synth preview when there is none. |

## Where the other things live

| Thing | File |
| --- | --- |
| Everything per composition, plus cooldown, home piece, and gallery backdrop | [lib/catalog.json](lib/catalog.json), edited at `/edit` |
| The field list and types | [lib/compositions.ts](lib/compositions.ts) |
| The live editor | [app/editlive/live.tsx](app/editlive/live.tsx) and [app/editlive/live.css](app/editlive/live.css); the on-page handles live in [components/composition-browser.tsx](components/composition-browser.tsx) behind the `editor` prop |
| The table editor | [app/edit/editor.tsx](app/edit/editor.tsx), [app/edit/editor.css](app/edit/editor.css), shared pieces in [app/edit/shared.tsx](app/edit/shared.tsx), and the API routes under [app/api](app/api) |
| Layout, cover scrolling, shared playback styling | [app/globals.css](app/globals.css) |
| Page logic | [components/composition-browser.tsx](components/composition-browser.tsx) |
| Cover artwork element | [components/score-artwork.tsx](components/score-artwork.tsx) |
| Browser-tab title and page description | [app/layout.tsx](app/layout.tsx) |
| About / learn / ideas / contact panel text | [components/composition-browser.tsx](components/composition-browser.tsx), inside the `info-panel` section |

## Development mode versus the production version

**While editing:** use `npm run dev` and an editor at `/editlive` or `/edit`. Saving there updates the gallery automatically. The editors are not part of the production build.

**To run a production build:** stop the development server with Control+C, then run these one at a time:

```sh
npm run build
```

```sh
npm run start
```

Production mode does not hot reload. Stop it, rebuild, and start it again to include changes. For everyday tinkering, return to `npm run dev`.
