# Palette

Decision date: 2026-09-13. A calm blueprint palette with role-based color. This is a design decision, not a claim that a color proves software quality.

| Token    | Color     | Use                                 |
| -------- | --------- | ----------------------------------- |
| Navy     | `#0B1F3A` | Identity, headings, primary content |
| Canvas   | `#F8FAFC` | Workspace and quiet surfaces        |
| Surface  | `#FFFFFF` | Panels and component cards          |
| Slate    | `#475569` | Supporting text and contracts       |
| Muted    | `#64748B` | Secondary labels                    |
| Blue     | `#526F91` | Actions and keyboard focus          |
| Teal     | `#487477` | Data and overview indicators        |
| Lavender | `#716A84` | Muted lavender accent               |
| Warning  | `#806746` | Warning state                       |
| Error    | `#956161` | Error state and deletion controls   |

Navy and neutrals dominate. Blue is the primary action accent. Selection retains the component’s accent with a soft glow without changing card geometry. Thin grid lines, aligned cards, and monospace technical fields reinforce the architectural visual language. No gradients, neon, or decorative status colors.

Carbon uses neutrals for interface structure and core blue for primary actions; its semantic tokens separate roles from raw values. We adopt that principle rather than copying a brand palette. [Carbon overview](https://carbondesignsystem.com/elements/color/overview/), [Carbon tokens](https://carbondesignsystem.com/elements/color/tokens/).

WCAG calls for 4.5:1 normal-text contrast and 3:1 large-text contrast. The automated palette test checks navy, slate, muted, blue, teal, and all accent foregrounds on off-white, plus white text on blue buttons. These pass 4.5:1. This checks intended text pairs, not a claim of a complete accessibility audit. [W3C contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html).

Status names appear in the inspector and as accessible labels. Group selection also has a named selector. Do not convey new domain semantics with color alone.

Component accents: service blue, database teal, client navy, queue warning, boundary slate, note slate, and symbol error. Status indicators remain independent of component color. The inspector supports all seven accent colors; the library legend sits below Highlight group. Typography uses the native system UI font, including Apple system fonts on macOS, with no downloaded font dependency.
