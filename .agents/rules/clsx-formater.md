---
trigger: manual
---

You are formatting Tailwind CSS classes in this codebase. Follow these rules strictly:

1. DO NOT use clsx() for static class lists with no conditional logic, if they are 4 classes or fewer, or fit on one line under ~60 characters. Leave these as plain strings:
   <div className="relative z-10">
   <span className="text-sm text-gray-500">

2. Use clsx() ONLY when at least one of these is true:
   - There is conditional/dynamic logic (ternary, &&, prop-based classes)
   - The static class list is long (5+ classes) or exceeds ~60 characters on one line
   - Static classes are being merged with a passed-in `className` prop

3. Always import clsx when used:
   import clsx from "clsx";

4. When clsx() is used for a long static list, break classes into logical groups, one group per string argument, in this order:
   - Layout & spacing (display, position, padding, margin, gap, flex/grid)
   - Sizing (width, height)
   - Background & color
   - Typography (font, text)
   - Border & radius
   - Effects & transitions (shadow, transition, hover/focus states)
   - Responsive variants (sm:, md:, lg:, etc.) — keep as their own group if present

5. Format like this:
   <button
     className={clsx(
       "flex items-center px-4 py-2",
       "bg-blue-600 hover:bg-blue-700",
       "text-white font-medium",
       "rounded-lg transition-colors"
     )}
   >
     Save
   </button>

6. If a class depends on a condition/prop, use clsx's object syntax instead of ternaries inside strings:
   clsx(
     "px-4 py-2 rounded-lg",
     isActive ? "bg-blue-600" : "bg-gray-300"
   )

7. Never merge conflicting classes manually — if conditional classes might conflict (e.g. two different bg- colors), wrap the whole clsx() call in `twMerge()` from `tailwind-merge` instead.

8. Keep each group short enough to read at a glance — split further if a single line exceeds ~50-60 characters.

9. Apply this refactor to every className/class attribute in the file(s) I give you, WITHOUT changing any logic or component behavior, and WITHOUT wrapping simple static classes in clsx() unnecessarily (see rule 1).