# Photo covers in the local Hexo source project

## Where the durable files live

| Editable file | Generated output | Purpose |
| --- | --- | --- |
| `themes/simplism/source/js/covers.js` | `public/js/covers.js` | Photo processing and reading enhancements |
| `themes/simplism/source/css/covers.css` | `public/css/covers.css` | Monochrome design/readability additions |
| `themes/simplism/layout/` | Rendered pages | Head stylesheet, scripts and photo-aware templates |
| `source/covers.json` | `public/covers.json` | Homepage/article photo map |
| `source/images/covers/` | `public/images/covers/` | Optimized photographs you select |
| `source/tools/cover-studio/` | `public/tools/cover-studio/` | Local browser photo editor |

The head loads the cover CSS directly and the layout loads the script once. There is no generated-site loader patch. `skip_render` copies the editor HTML unchanged, without wrapping it in the blog layout. These source changes survive generation and the existing daily deployment.

## Recommended workflow: Cover Studio

Open `/blog/tools/cover-studio/` using the local preview server. Choose a JPEG, PNG or WebP you own or have permission to publish. Choose the homepage or an article. Check wide, card and mobile crops, then download the optimized photo and configuration.

Save the photo in **`source/images/covers/`** and the configuration in **`source/covers.json`**. Do not save only into `public/`, the browser's Downloads directory or generated `_posts/` files. The next successful build/deploy publishes the saved files.

The optimized source retains the composition with a longest edge of at most 1600px; each layout makes its own focal-point crop. You can also use the exported pixel PNG as finished artwork, with the processed notebook-cover configuration below. This preserves the selected composition and avoids a second processing pass.

The editor merges entries loaded when it opened and now accumulates subsequent configuration exports within that tab. Save the newest exported configuration. Reopen the editor after rebuilding before editing previously saved work; separate old tabs do not synchronize their in-memory state. The tool does not automatically upload or write to your project.

## Configuration example

The file starts empty. After you save an actual image at `source/images/covers/micrograd-v1.webp`, a configuration could be:

```json
{
  "version": 1,
  "covers": {
    "hero": {
      "src": "images/covers/micrograd-v1.webp",
      "columns": 96,
      "gap": 0.12,
      "contrast": 1.1,
      "brightness": 1,
      "focalX": 0.5,
      "focalY": 0.5,
      "dither": 0.2
    },
    "/blog/2026/08/18/Neural-Networks-Zero-to-Hero/micrograd/": {
      "src": "images/covers/micrograd-v1.webp",
      "alt": "Optional description for an informative article cover"
    }
  }
}
```

`hero` targets the homepage. An article URL path targets its featured/card/article artwork. Percent-encoded spaces and Unicode are normalized. Only same-origin photographs are processed; arbitrary external image hosts are rejected. Use project-relative `images/covers/...` or `/blog/images/covers/...` for `src`. Remove an entry to restore the seeded mosaic.

## Alternative: notebook front matter

For a cover that follows a note without depending on its dated URL, add these fields to the **original notebook Markdown**, not just the generated copy under `source/_posts/`:

```yaml
---
title: micrograd
date: 2026-08-18 22:01:11
categories: Neural-Networks-Zero-to-Hero
cover: /images/covers/micrograd-v1.webp
cover_alt: "A short description, if the cover conveys useful information"
cover_options:
  columns: 96
  focalX: 0.5
  focalY: 0.5
  contrast: 1.1
  brightness: 1
  gap: 0.12
---
```

Keep your existing title/date/category values; the example is not an instruction to change them. The photo still lives at `source/images/covers/micrograd-v1.webp`. The same `<img>` source and options now reach article, featured and card templates. Front-matter covers take precedence over manifest entries for that post; use one workflow per post to avoid conflicting settings. All untreated cover images use the shared grayscale/pixel engine, including legacy `cover_style: original` entries. Use `cover_style: processed` only for artwork already exported through Cover Studio.

For front-matter paths, use `/images/covers/...` for global images, or a relative filename for an image in that note's asset folder. Hexo adds the blog root; relative cover filenames resolve against the post URL. Body images, diagrams and charts are untouched.

## Notebook vector covers

The sync detects `<note-name>/<note-name>_cover_vector.svg` beside a Markdown note. For example, `Neural-Networks-Zero-to-Hero/micrograd/micrograd_cover_vector.svg` becomes the cover for `Neural-Networks-Zero-to-Hero/micrograd.md`. Cover metadata is added only to the generated mirror; the original note and SVG remain unchanged. An explicit `cover` field takes precedence.

Automatic vector sources receive the same pixel treatment as other cover images. The editor accepts SVG uploads alongside JPEG, PNG and WebP.

For a finished cover that is already converted, choose **Full artwork / cards · 16:9**, adjust the treatment and export **Download pixel preview**. Save the PNG in `source/images/covers/`, then add a durable entry to `source/covers.json`:

```json
"notebookCovers": {
  "Neural-Networks-Zero-to-Hero/micrograd.md": {
    "src": "/images/covers/micrograd-pixel-v1.png",
    "alt": "micrograd — BlackCat grayscale pixel cover"
  }
}
```

The sync adds `cover_style: processed` to the mirrored post. The exported PNG is displayed directly in its full 16:9 frame across article, featured and card layouts; article artwork aligns with the reading column. It works without JavaScript and avoids recropping, side bars and repeated pixel conversion. Missing processed files stop sync before the existing posts are replaced.

Micrograd uses 160 columns, no grid gaps, 110% contrast and **Dark paper** enabled. Its blocky silhouette and eight gray levels retain the site's pixel language without slicing through the lettering. Other covers default to a gentler 6% gap. Dark paper reverses light artwork into the site's dark palette while retaining its lettering and composition. The original SVG remains unchanged.

## Visual treatment and limitations

Processing: subject-aware crop -> downsample -> perceptual-luma approximation -> eight gray levels -> narrow black tile gaps. Bounded controls and deterministic dithering avoid animated noise. Default detail is 96 columns, finer than the old card art so a photograph remains recognizable. Dense scenes, fine text and color-dependent charts are unsuitable cover sources.

Public ratios: homepage 6:1; generated featured/article mosaics 3:1 on desktop and 2:1 on mobile; all cards 16:9. Finished processed artwork uses its full 16:9 composition. Text remains separate from the artwork. Optional alternative text is exposed for informative article artwork; duplicate decorative card links stay out of the accessibility tree.

No-JavaScript readers retain text/navigation and native front-matter images; manifest photos and canvas mosaics require JavaScript. Failed manifest/photo loading retains the seeded fallback. Native `<img>` covers retain an HTML grayscale fallback on canvas failure. This is a browser enhancement, not pre-rendered social-media preview artwork; manifest photos do not automatically replace Open Graph metadata.

The additions also shorten covers, brighten secondary text, underline the current category, improve keyboard focus, provide a collapsed section index on sufficiently structured articles and allow long inline math to scroll. They do not rewrite article text or change existing graphs.

## Tests and references

`npm test` runs the existing parser tests and 24 cover/sync tests. `python tests/browser_smoke.py` and `python tests/integration_smoke.py` are optional development checks; see the test files for requirements. Python/Playwright are not required for normal publishing.

Hexo primary references checked while integrating:

- https://hexo.io/docs/configuration — `skip_render`, source/public paths and subdirectory root.
- https://hexo.io/docs/themes — source assets and template loading.
- https://hexo.io/docs/asset-folders — global source image assets.
- https://hexo.io/docs/generating — generated output and deploy commands.
