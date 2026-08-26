---
name: visual-fidelity-check
description: Review a Tesseli screen against the visual specification and responsive behavior.
disable-model-invocation: true
---
# Visual Fidelity Check

Review the target route at desktop and mobile widths.

Check:
- palette hex/token usage;
- Inter/Playfair/JetBrains roles;
- spacing/radius/shadows;
- PageHeader hierarchy;
- sidebar/mobile nav consistency;
- dark mode;
- focus/hover/active states;
- empty/loading/error states;
- accessible labels/keyboard;
- few-click workflow.

Return deviations ordered by severity and fix them before PASS.
