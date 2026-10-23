# 1.1.1 documentation release

Date: 2026-10-23. Publication target: the public GitHub repository and source release.

## Change

The README now features Johannes Sundlo's public **Tack!** video as a real-world community example, with creator credit, a clickable thumbnail, a brief summary and a link back to current setup instructions.

The description is grounded in the video's visuals and Swedish auto-generated captions, reviewed on 23 October. It is Johannes's account of his own setup, not an independent audit or a claim that he uses the latest hosting configuration. No spoken quotation, private link inventory or copied video file is included.

## Verification and boundaries

- Check the README's rendered section, thumbnail and destination on GitHub after publication.
- Run the regression suite, type checking, lint, privacy check and production build.
- Keep release labels and changelog at 1.1.1.
- No application behavior, dependencies, Cloudflare settings, redirects or private operational repository are changed by this documentation patch. Existing installations remain on their deployed versions until deliberately updated.
- Rollback source reference: `v1.1.0`.
