# Frontend UI rules

Before creating or modifying UI:

1. Read and follow `.agents/skills/shadcn/SKILL.md`.
2. Run `npx shadcn@latest info --json` and use the resolved project preset. Do not run `shadcn init` or change presets without explicit approval.
3. Run `npx shadcn@latest docs <component>` before using a component.
4. Check `src/components/ui` before adding anything. Use the shadcn-generated primitive and compose it; do not replace it with native controls or a hand-built equivalent.
5. Use `render` for Base UI composition, semantic theme tokens, `gap-*` for spacing, and `size-*` for equal dimensions.
6. Use shadcn `Select`, `Calendar`, `Popover`, `Field`, `Table`, `Dialog`, and `Button` components where applicable. Do not use native `<select>`, date inputs, or custom dropdown/calendar markup in application pages.
7. Review generated component files after adding them and preserve local project-specific lint fixes without overwriting components casually.
8. Run `npm run lint` and `npm run build` after UI changes.

The currently resolved preset is verified by the CLI; its code is the source of truth in `npx shadcn@latest info --json`.
