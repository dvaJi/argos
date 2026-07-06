# Infographic Syntax Generation Guide

This document guides the generation of plain-text output that conforms to the AntV Infographic syntax specification.

## Contents

- Goals and inputs/outputs
- Syntax structure
- Syntax rules
- Template selection
- Generation flow
- Output format
- Common questions and best practices

## Goals and Inputs/Outputs

- **Input**: The user's text content or requirement description.
- **Output**: An `infographic` markdown code block containing only Infographic syntax.

## Syntax Structure

The Infographic syntax is made up of an entry line and block structures:

- **Entry line**: `infographic <template-name>`
- **Blocks**: `data` / `theme`
  - Use two-space indentation for levels within a block.

## Syntax Rules

- The first line must be `infographic <template-name>`; the template must be chosen from the list below.
- Key/value pairs use `key space value`.
- Arrays use `-` as the item prefix (inline form is allowed only when the user explicitly asks for it).
- Common `data` fields:
  - `title` (string) / `desc` (string) / `items` (array)
- Common `data.items` fields:
  - `label` (string) / `value` (number) / `desc` (string) / `icon` (string) / `children` (array)
- For comparison templates (names starting with `compare-`), you must build exactly two root nodes, and all comparison items must be the children of those two root nodes.
- The `hierarchy-structure` template supports at most 3 levels (root → group → child), and the order of `data.items` corresponds to the top-to-bottom hierarchy (the first item is at the top).
- `theme` may use `theme <theme-name>`, or you may use a `palette` block etc. for custom themes. Omit it for the default theme. Available theme names: `dark`, `hand-drawn`.
- Use the icon name directly (e.g., `mdi/chart-line`).
- Do NOT output JSON, Markdown, or any explanatory text.

## Template Selection

**Selection principles**:

- List-style infographics → `list-*`
- Order / flow / stages → `sequence-*`
- Binary or multi-way comparison → `compare-*`
- Hierarchical relationships → `hierarchy-*`
- Data statistics → `chart-*`
- Quadrants → `quadrant-*`
- Relationships → `relation-*`

**Available templates**:

- sequence-zigzag-steps-underline-text
- sequence-horizontal-zigzag-underline-text
- sequence-horizontal-zigzag-simple-illus
- sequence-circular-simple
- sequence-filter-mesh-simple
- sequence-mountain-underline-text
- sequence-cylinders-3d-simple
- sequence-color-snake-steps-horizontal-icon-line
- sequence-pyramid-simple
- sequence-funnel-simple
- sequence-roadmap-vertical-simple
- sequence-roadmap-vertical-plain-text
- sequence-zigzag-pucks-3d-simple
- sequence-ascending-steps
- sequence-ascending-stairs-3d-underline-text
- sequence-snake-steps-compact-card
- sequence-snake-steps-underline-text
- sequence-snake-steps-simple
- sequence-stairs-front-compact-card
- sequence-stairs-front-pill-badge
- sequence-timeline-simple
- sequence-timeline-rounded-rect-node
- sequence-timeline-simple-illus
- compare-binary-horizontal-simple-fold
- compare-hierarchy-left-right-circle-node-pill-badge
- compare-swot
- quadrant-quarter-simple-card
- quadrant-quarter-circular
- quadrant-simple-illus
- relation-circle-icon-badge
- relation-circle-circular-progress
- compare-binary-horizontal-badge-card-arrow
- compare-binary-horizontal-underline-text-vs
- hierarchy-tree-tech-style-capsule-item
- hierarchy-tree-curved-line-rounded-rect-node
- hierarchy-tree-tech-style-badge-card
- hierarchy-structure
- chart-column-simple
- chart-bar-plain-text
- chart-line-plain-text
- chart-pie-plain-text
- chart-pie-compact-card
- chart-pie-donut-plain-text
- chart-pie-donut-pill-badge
- chart-wordcloud
- list-grid-badge-card
- list-grid-candy-card-lite
- list-grid-ribbon-card
- list-row-horizontal-icon-arrow
- list-row-simple-illus
- list-sector-plain-text
- list-column-done-list
- list-column-vertical-icon-arrow
- list-column-simple-vertical-arrow
- list-zigzag-down-compact-card
- list-zigzag-down-simple
- list-zigzag-up-compact-card
- list-zigzag-up-simple

## Generation Flow

1. Extract the title, description, items, and hierarchy from the user content.
2. Match the structure type and select a template.
3. Organize the `data`: provide the required fields among `label/desc/value/icon` for each item.
4. If the user specifies a style or color, add the corresponding `theme`.
5. Output the plain-syntax text in a `plain` code block.

## Output Format

Output exactly one `infographic` markdown code block. Do not add any explanatory text:

```infographic
infographic list-row-horizontal-icon-arrow
data
  title Title
  desc Description
  items
    - label Item
      value 12.5
      desc Notes
      icon mdi/rocket-launch
theme
  palette
    - #3b82f6
    - #8b5cf6
    - #f97316
```

## Common Questions and Best Practices

- When the information is insufficient, you may fill in reasonable content, but avoid fabricating things unrelated to the topic.
- `value` is numeric; if no explicit number is given, you may omit it.
- `children` is for hierarchy; avoid mismatching the level with the template type.
- The output must strictly follow the indentation rules so it can be rendered as a stream.
