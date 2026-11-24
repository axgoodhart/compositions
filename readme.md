# Composition browser — the squirrel-proof guide

This is the composition gallery with the endlessly scrolling score covers and short background videos when you enter a composition.

Everything a composition shows on the page lives in one data file, [lib/catalog.json](lib/catalog.json). You do not edit it by hand. While the site runs, **http://localhost:3000/editlive** is the editor: the real page in the middle, the list of pieces on the left, the controls on the right. It also answers to `/editlive.html`.

## Pick the thing you came here to do

| I want to… | Go here |
| --- | --- |
| Open the site and work on it | [Start the site](#start-the-site) |
| Change anything on a piece | [The editor](#the-editor) |
| Make the video end on the room without a visible cut | [Matching the video to the room](#matching-the-video-to-the-room) |
| Add a brand-new composition | [Add a composition](#add-a-composition) |
| Keep a piece in the editor but off the site | [Hide a piece](#hide-a-piece) |
| Put a moving background inside a composition | [Room video](#room-video) |
| Tidy the files in `public` | [Organize the files](#organize-the-files) |
| Pull in pieces from the old player's tracks.json | [Import the old catalog](#import-the-old-catalog) |
| Know what a field does | [Field reference](#field-reference) |
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

**4. Open the editor** in a second tab: `http://localhost:3000/editlive`. Save there and the gallery tab updates by itself.

**To stop the site:** click the running Terminal window and press **Control+C**.

**If the dependencies are missing:** run this from the project folder, let it finish, then try `npm run dev` again:

```sh
npm install
```

## The editor

`http://localhost:3000/editlive` only exists while `npm run dev` runs. The deployed site has none of it.

**Left: the pieces.** Every composition in page order, with its cover. Click one to go there. Drag one to reorder. Type in the box at the top to jump: a number, or part of a title, then Return. The `/` key puts you in that box.

**Middle: the page**, exactly as visitors see it, except that you can change it.

| Do this on the page | What changes |
| --- | --- |
| Click any text and type | Title lines, year, place, ensemble, duration. Return keeps it, Escape puts it back. An empty title line is removed. |
| Drag the big cover | Which part of the image shows. |
| Scroll over the big cover | Zoom. It never gets smaller than the cover box. |
| Click the big cover | Choose a different image. |
| Inside a composition, drag the empty background | Moves the room image, or the video while it shows. |
| Inside a composition, scroll over the empty background | Zooms the room image, or the video while it shows. |
| Drop a file anywhere on the page | An image becomes the cover (in the gallery) or the room image (inside a composition). A video becomes the intro, or the room video when the Room section is open. A recording becomes the sound. A PDF becomes the score. |

**Right: the controls**, one section open at a time. Opening a section moves the page to where you can see the result: Room, Video and Score enter the composition, Cover leaves it.

| Section | Controls |
| --- | --- |
| Piece | title lines, id, year, place, ensemble, duration, players · Home, Hidden, Duplicate, Delete |
| Cover | image · whole image or crop · zoom · adjust (look) |
| Room | image · video · fill, whole image or stretch · zoom · color · tint · adjust (look) |
| Video | on/off · show, replay · file · fill or whole frame · zoom · from, to, speed, delay, fade · compare last frame · adjust (tint, look) |
| Sound | the recording |
| Score | the PDF for the in-room score reader |
| Site | gallery backdrop · intro cooldown · import · preview and organize the files |

**Fill** covers the room and **whole image** shows all of it; both keep the image's proportions at every window size, and **zoom** scales on top. **Stretch** fits the room exactly and gives the proportions up.

**Look** is the CSS `filter` as sliders. **Tint** is the overlay gradient as a direction, a color and a strength; **css** takes any gradient by hand. Both sit behind **adjust**; a dot on it means something is set.

**Files.** Every image, video, recording and score opens the same picker in the right column: a search box, one group per folder, pictures at their real proportions, and a number on anything already in use (hover it to see where). The `+` adds files from your disk, or drop them anywhere on the picker. New files land under `public/media` by what they are for: `covers`, `rooms`, `intros`, `audio`, `scores`, `site`. [Organize the files](#organize-the-files) renames each one after the piece that uses it.

**Undo and redo** are ⌘Z and ⇧⌘Z. Every drag, slider release and text edit is one step, and so is Delete, so there is no confirmation. **Save** is ⌘S or the button. If the button says **Fix**, something is missing; click it and the editor takes you to the field and says what. Nothing is written until you save.

**Hide** (or the `\` key) puts the panels away so you can see the page alone. **Panels** brings them back.

## Matching the video to the room

When the video closes it fades into the still room. If the two differ, the visitor sees the join. In the Video section, turn on **compare last frame**. The video parks on the frame the visitor sees last and a vertical line appears on the page: left of it is that frame, right of it is the room. Drag the line or use the slider. **blend** fades the frame over the room instead, which shows color differences as ghosting. **peek** hides the frame while pressed.

Then fix what you see, with the comparison still up:

| To… | Do this |
| --- | --- |
| Move the room image | Drag the page on the room side of the line, or use **room zoom** |
| Move the video | Drag the page on the frame side of the line, or use **zoom** |
| End on a different frame | Move **to**. The held frame follows. **from** and **speed** keep that end frame fixed. |
| Soften the join | **fade** is how long the last frame takes to dissolve into the room |
| Give up and let the video win | **frame → room image** saves the frame as a JPEG and makes it the room. **room color ← frame** sets the flat color to the frame's average. **look → room** copies the video's tint and look onto the room. |

Compare stays on while you move between pieces, so you can check several in a row.

## Add a composition

1. Click **Add a piece** at the bottom of the left column. It appears at the end, selected.
2. Type the title lines on the page or in the Piece section. Give it a short `id` of letters, numbers and dashes.
3. Choose a cover image, then a room image or a tint.
4. Optionally turn the video on and choose a recording under Sound.
5. Save. The `01—03` counts in the header and footer update by themselves.

Deleting a piece never deletes its files, and ⌘Z brings it back.

## Hide a piece

In the Piece section, **Hidden** keeps the piece in the editor and leaves it off the site: visitors never see it in the gallery, the counts, the dots or the player. The editor still shows it everywhere, dimmed in the left column with an eye icon, and the page wears a small *hidden on the site* tag while you are on it. Press **Hidden** again to bring it back. The Home piece cannot be hidden; Save says **Fix** until you pick another Home or unhide it.

## Room video

A room can move. In the Room section, **video** chooses a silent clip that loops behind the composition's text while you are inside it; the room **image**, if there is one, shows until the video is ready. Dragging and scrolling the empty background moves and zooms the video just like the image, and the tint and look apply to it too. Clear the video to go back to the still room. Visitors who have asked their system for reduced motion see the first frame, unmoving.

Where it sits with the intro: the intro plays on top, then dissolves into the moving room.

## Organize the files

Files pile up: screenshots with long names, copies of the same recording in two folders, images nothing uses any more. **Organize** files everything under `public/media`, named after the piece that uses it:

| Folder | What goes there |
| --- | --- |
| `media/covers` | cover images, as `raven.webp` |
| `media/rooms` | room images and room videos, as `raven.png` and `raven-video.mp4` |
| `media/intros` | intro videos |
| `media/audio` | recordings |
| `media/site` | the gallery backdrop and the logomark |
| `media/scores` | scores, as `raven.pdf`; PDFs nothing uses keep their names |
| `media/library` | images, videos and recordings nothing uses yet, names kept |

Byte-identical copies are removed so one stays; nothing else is ever deleted. The catalog is rewritten to the new paths, and folders left empty disappear. Files named in the code (the logomark) stay where they are, and anything that is not media (`.txt`, `.json`, `.psd`) is listed and left alone.

Two ways to run it, both show the full list of what moves:

- In the editor, under **Site**: **preview** shows the plan, **organize** carries it out and reloads the catalog. Save first; the button waits while there are unsaved changes.
- In Terminal, from the project folder: `npm run media` shows the plan, `npm run media -- --apply` carries it out.

Run it whenever you like. A file already in its place is left alone, so the second run says *Everything is already in place*.

## Import the old catalog

Under **Site**, **Import** reads the older player's `tracks.json` and makes one composition per family (so the four Raven movements become one piece). It copies the family's cover into `public/media/covers`. Tick **copy recordings** to also copy the audio, which is large. Nothing touches the catalog until you Save, and families whose id already exists are skipped, so running it twice is safe.

Imported pieces have an empty `place` and a plain dark room.

## Field reference

The editor labels match these names. Every file path is a URL without `public`: `public/media/covers/raven.webp` is `/media/covers/raven.webp`.

### Text fields

| Field | What it is |
| --- | --- |
| `id` | Short unique name. Used in storage and for `homeId`. Letters, numbers, dashes. |
| `lines` | The title as display lines, e.g. `["The Raven", "Cantata"]`. |
| `title` | The lines joined with spaces. Kept up to date by the editor; used in labels and captions. |
| `year`, `place`, `ensemble`, `duration` | Shown under the title in the gallery and inside the composition. The first number in `year` and `duration` drives the YEAR and DURATION sorts. |
| `players` | Number of performers, e.g. `4`. Not shown; drives the PLAYERS sort. Pieces without it sort last. |
| `hidden` | `true` keeps the piece in the editor and off the site. Leave out to show it. |

### Cover

`cover` is the score artwork in the gallery.

| Field | What to put there | What happens |
| --- | --- | --- |
| `src` | `"/media/covers/raven.webp"` | The image file. |
| `size` | `"400% 183.08%"` | How big the image is relative to the cover box. Leave out for `cover`. |
| `position` | `"26.04% 27.09%"` | Which part shows. Leave out for `center`. |
| `filter` | `"grayscale(1)"`, `"sepia(.4)"` | CSS filter on the cover. Leave out for none. |

### Room

`room` is the full-screen background inside the composition.

| Field | What to put there | What happens |
| --- | --- | --- |
| `src` | `"/media/rooms/raven.png"` | The room image. Leave out for a tint-only room. |
| `video` | `"/media/rooms/raven-video.mp4"` | A silent looping video over the image, shown inside the composition. Uses the same `size`, `position` and `filter`. Leave out for a still room. |
| `overlay` | `"linear-gradient(90deg,#0b080787,#0b080715)"` | Gradient layers drawn over the image. With no `src`, this is the whole backdrop. |
| `size` | `"140% 125%"` | How big the image is relative to the screen. Leave out for `cover`. |
| `position` | `"50% 100%"` | Which part stays in view. Leave out for center. |
| `color` | `"#070d19"` | Flat color behind everything. Leave out for near-black. |
| `filter` | `"grayscale(1)"`, `"brightness(.8)"` | CSS filter on the image and overlay. Leave out for none. |

### Video settings

`intro` is the short silent video that plays when you enter the composition. Leave `intro` out entirely for no video.

| Field | What to put there | What happens |
| --- | --- | --- |
| `src` | `"/media/intros/raven.m4v"` | The video file. Must be a browser-friendly H.264 MP4 or M4V. |
| `start` | `12.5` | Seconds into the file where playback begins. Leave out for `0`. |
| `play` | `4` | Seconds the video stays on screen. Required. The editor derives it from **from**, **to** and **speed**. |
| `speed` | `1`, `0.5`, `2` | Playback rate. Leave out for `1`. |
| `delay` | `1.5` | Seconds after entering before the video appears. Leave out for `0`. |
| `fade` | `1.2` | Seconds the last frame takes to dissolve into the room. Leave out for `0.4`. |
| `fit` | `"cover"` or `"contain"` | `cover` fills the screen and may crop edges. `contain` shows the whole frame. |
| `zoom` | `1.4` | Scale on top of `fit`. Leave out for `1`. |
| `position` | `"50% 100%"` | Crop focus. `50% 50%` centers it; `50% 0%` favors the top. |
| `filter` | `"grayscale(1) contrast(1.2)"` | CSS filter on the video. Leave out for none. |
| `overlay` | `"linear-gradient(90deg,#070d1980,transparent)"` | A tint over the video. Leave out for none. |

`play` counts screen time, so `play: 4, speed: 2` shows eight seconds of footage in four seconds.

Videos play **silently**, behind the composition's text and controls. Leaving the composition stops its video. Missing or unplayable videos fall back to the still room.

To style the whole page only while a video is showing, use `.music-room.intro-playing` in [app/globals.css](app/globals.css).

### Generated covers

Pieces still showing the logomark (`logomark.webp`) have no cover yet. In the editor, Cover → **generate** (or **edit**, once a piece has a generated cover) opens the cover studio over the stage. The cover becomes a document edited in place: drag the title, subtitle or mark; drag the corner handle to resize; the small bar above a selection toggles bold, italic, capitals and lowercase, adjusts tracking and changes the font family; bold and italic are only offered where the family has those faces (the `weights` and `italics` columns of `coverFonts`). The panel beside it edits the text, fonts and colours, with palette chips that recolour everything at once. **Random** proposes eight covers, each a different *composition* (a design idea that decides where the title, subtitle and mark go, how big, and how they relate), from one shuffle to the next; click one to start from it. **Saved** keeps variants of this piece's cover in the catalog. **Use this cover** renders the document to `public/media/covers/generated/<id>-<hash>.webp` and stores the document with the piece, so the cover can be edited again later; organizing the files moves it up to `media/covers/<id>.webp`. The footer button generates every coverless piece at once, each with a composition, font and palette fixed by its id. Arrow keys nudge, Backspace removes a text, ⌘Z undoes inside the studio, Escape deselects and then closes.

Everything tunable lives in `lib/cover-looks.ts`:

| Block | What it does |
| --- | --- |
| `coverFonts` | One line per family: Google Fonts name, default weight and italic, a `style` tag (`italic`, `didone`, `display`, `caps`, `sans`), the weights the family offers and whether it has italics. Add or delete lines freely. |
| `coverLayouts` | The eighteen compositions, each with the font styles and title cases that suit it. Each is a `case` in `compose()` in `app/api/cover/route.tsx`, placing text boxes, shapes and the mark into a document; its own choices (which edge, how big a crop, which corner) come from the cover's variant seed. |
| `coverPalettes` | One line per palette: background, title ink, mark tint, band colour (also the accent) and the type colour on the band. |
| `allowedStyles`, `allowedLayouts`, `allowedPalettes`, `allowedCases` | Leave empty to use everything, or list what the generator may use, e.g. `allowedStyles = ["italic", "didone"]`. |

Text is fitted from the font's own advance widths, so titles fill the space they are given exactly. The studio draws the same document in HTML with the Google Fonts stylesheet; the saved image is rendered by Next's `ImageResponse` and `sharp`, both of which ship with the project. Fonts download the first time they render and are cached in `node_modules/.cache/cover-fonts`, so first use needs a network connection.

### Audio

| Field | What to put there | What happens |
| --- | --- | --- |
| `audio` | `"/media/audio/raven.mp3"` | A recording for the in-room play button. Without it there is no player. |

Recordings live in `public/media/audio`, referenced as `/media/audio/…`.

### Score

| Field | What to put there | What happens |
| --- | --- | --- |
| `score` | `"/media/scores/raven.pdf"` | A PDF for the in-room score reader. Without it there is no **score** button. |

Inside a composition, **score** opens the reader over the room: the page in the middle, the pages already read piled at the left, the next page at the right. Arrow keys, Space, a swipe, or a click on either pile turns the page; Escape or **close the score** returns to the room. The reader is `components/score-reader.tsx` and `components/score-reader.css`, with the motion and the 3D poses in the tuning blocks at the top of each. It draws PDFs with pdf.js 3.11.174, served from `public/pdfjs`.

## The cooldown switch

Under **Site**, change **intro cooldown**.

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
| Changes do not appear | Save in the editor. Confirm the browser address matches the running server. Refresh once. If needed, Control+C and `npm run dev` again. |
| The Save button says Fix | Click it. The editor goes to the field and the message says what is missing. |
| `/editlive` shows a 404 | The editor only exists in development mode. Start `npm run dev` and use its `Local` address. |
| Clicking text on the page does nothing | Text is only editable at `/editlive`, not at `/`. |
| Arrow keys move the gallery while typing | Click into the text first; keys only browse when nothing is being edited. |
| A red error appears after editing by hand | If you changed `lib/catalog.json` yourself, check for a missing comma, quote, or bracket. |
| A video does not repeat | Set the intro cooldown to `0` under Site, save, return to the room, then enter the piece again. |
| A video never appears | Confirm you entered the composition, rather than only selected it. Check the Video section has a file. Check the browser's reduced-motion setting. |
| You suspect a file path | Open its URL directly, for example `http://localhost:3000/media/intros/raven.m4v`. A missing-file page means the path or filename is wrong. |
| A piece is missing from the site but the editor has it | It is marked **Hidden** in the Piece section. |
| The room video does not move | Check the browser's reduced-motion setting; the first frame shows instead. Check the file plays at its URL. |
| You changed **from** and now see no video | **from** must be before the file's end; the clip must have a length. |
| The file exists but will not play | Its encoding needs browser support. Use an H.264 MP4; renaming an extension does not convert it. |
| The picture is cropped | Choose **whole frame**, or drag the video on the page. |
| The cover shows the wrong part of the image | Drag the big cover on the page. |
| The room is black | Room needs an image, a tint, or both. Check the file path. |
| There is no sound from the video | Intro videos are intentionally muted. Sound comes from the recording under Sound. |

## Where the other things live

| Thing | File |
| --- | --- |
| Everything per composition, plus cooldown, home piece, and gallery backdrop | [lib/catalog.json](lib/catalog.json), edited at `/editlive` |
| The field list and types | [lib/compositions.ts](lib/compositions.ts) |
| The editor | [app/editlive/live.tsx](app/editlive/live.tsx), [app/editlive/picker.tsx](app/editlive/picker.tsx), [app/editlive/shared.tsx](app/editlive/shared.tsx), [app/editlive/live.css](app/editlive/live.css); the on-page handles live in [components/composition-browser.tsx](components/composition-browser.tsx) behind the `editor` prop; the API routes under [app/api](app/api) |
| The file organizer and the `public/media` layout | [lib/media.ts](lib/media.ts), run by [scripts/organize-media.ts](scripts/organize-media.ts) and the Site section; the folder names in [lib/assets.ts](lib/assets.ts) |
| Layout, cover scrolling, shared playback styling | [app/globals.css](app/globals.css) |
| Page logic | [components/composition-browser.tsx](components/composition-browser.tsx) |
| Cover artwork element | [components/score-artwork.tsx](components/score-artwork.tsx) |
| Browser-tab title and page description | [app/layout.tsx](app/layout.tsx) |
| About / learn / ideas / contact panel text | [components/composition-browser.tsx](components/composition-browser.tsx), inside the `info-panel` section |

## Development mode versus the production version

**While editing:** use `npm run dev` and the editor at `/editlive`. Saving there updates the gallery automatically. The editor is not part of the production build.

**To run a production build:** stop the development server with Control+C, then run these one at a time:

```sh
npm run build
```

```sh
npm run start
```

Production mode does not hot reload. Stop it, rebuild, and start it again to include changes. For everyday tinkering, return to `npm run dev`.
