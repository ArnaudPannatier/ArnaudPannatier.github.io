# My personal website page at Idiap

For now it's only using [tailwindcss](tailwindcss.com) installed with npx

Don't forget to run the following command before going to production:

```bash
NODE_ENV=production npx tailwindcss -i apply.css -o tailwind.css --minify
```