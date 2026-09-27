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

The optimized source retains the composition with a longest edge of at most 1600px; each layout makes its own focal-point crop. The optional pixel-preview PNG is a preview, not a replacement for the uncropped source photo. The editor's controls affect the treatment settings; changing the preview crop does not change the site's public aspect ratios.

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

Keep your existing title/date/category values; the example is not an instruction to change them. The photo still lives at `source/images/covers/micrograd-v1.webp`. The same `<img>` source and options now reach article, featured and card templates. Front-matter covers take precedence over manifest entries for that post; use one workflow per post to avoid conflicting settings. Add `cover_style: original` to opt an image out of grayscale/pixel processing.

For front-matter paths, use the documented `/images/covers/...` form so Hexo adds the blog root. Relative post-asset filenames are not automatically resolved by this cover helper. Body images, diagrams and charts are untouched.

## Visual treatment and limitations

Processing: subject-aware crop -> downsample -> perceptual-luma approximation -> eight gray levels -> narrow black tile gaps. Bounded controls and deterministic dithering avoid animated noise. Default detail is 96 columns, finer than the old card art so a photograph remains recognizable. Dense scenes, fine text and color-dependent charts are unsuitable cover sources.

Public ratios: homepage 6:1; featured/article 3:1 on desktop and 2:1 on mobile; cards 4:3 on desktop and 16:10 on mobile. Text remains separate from the artwork. Optional alternative text is exposed for informative article artwork; duplicate decorative card links stay out of the accessibility tree.

No-JavaScript readers retain text/navigation and native front-matter images; manifest photos and canvas mosaics require JavaScript. Failed manifest/photo loading retains the seeded fallback. Native `<img>` covers retain an HTML grayscale fallback on canvas failure. This is a browser enhancement, not pre-rendered social-media preview artwork; manifest photos do not automatically replace Open Graph metadata.

The additions also shorten covers, brighten secondary text, underline the current category, improve keyboard focus, provide a collapsed section index on sufficiently structured articles and allow long inline math to scroll. They do not rewrite article text or change existing graphs.

## Tests and references

`npm test` runs the existing parser tests and 24 cover/sync tests. `python tests/browser_smoke.py` and `python tests/integration_smoke.py` are optional development checks; see the test files for requirements. Python/Playwright are not required for normal publishing.

Hexo primary references checked while integrating:

- https://hexo.io/docs/configuration — `skip_render`, source/public paths and subdirectory root.
- https://hexo.io/docs/themes — source assets and template loading.
- https://hexo.io/docs/asset-folders — global source image assets.
- https://hexo.io/docs/generating — generated output and deploy commands.
