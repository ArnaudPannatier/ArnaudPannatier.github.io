# My personal website page at Idiap

For now it's only using [tailwindcss](tailwindcss.com) installed with npx

Don't forget to run the following command before going to production:

```bash
NODE_ENV=production npx tailwindcss -i apply.css -o tailwind.css --minify
```

or now  (way faster)

```bash
bun run tailwindcss -i apply.css -o tailwind.css --minify
```

to setup for a new project for example:

```bash
bun install -g tailwindcss
bun install -g tailwind
bun run tailwindcss init
```

## SOL — A stellar story

`sol-end-of-life/` contains the production build of the interactive Sun experience,
served at `/sol-end-of-life/` on GitHub Pages and arnaudpannatier.ch.
To refresh it from the sibling `sol-end-of-life` project, run:

```bash
(cd ../sol-end-of-life && npm ci && npm run build -- --base=./)
rsync -a --delete ../sol-end-of-life/dist/ sol-end-of-life/
```

Relative asset paths allow the same build to work on both hosts. Commit and push
the generated folder to `master` to deploy GitHub Pages. Publish that folder to
the existing Infomaniak site with:

```bash
rsync -av sol-end-of-life/ arnaud_infomaniak:sites/arnaudpannatier.ch/sol-end-of-life/
```
