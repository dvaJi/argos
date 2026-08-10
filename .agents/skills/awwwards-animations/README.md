# Awwwards Animations

A comprehensive Claude Code skill for creating **Awwwards/FWA-level web animations** in React. Production-ready patterns for scroll experiences, physics, audio-reactive visuals, and more.

## Features

- **React-first approach** with proper hooks, cleanup, and TypeScript
- **10+ animation libraries** covered with best practices
- **60fps guaranteed** patterns and performance optimization
- **Copy-paste ready** components and hooks

### What's Included

| Category | Libraries | Patterns |
|----------|-----------|----------|
| Scroll Animations | GSAP + ScrollTrigger, Motion | Parallax, pin sections, horizontal scroll |
| Smooth Scroll | Lenis + ReactLenis | GSAP integration, scroll-linked effects |
| React Animations | Motion (Framer Motion) | useScroll, useTransform, AnimatePresence |
| Lightweight Effects | Anime.js 4.0 | Timelines, stagger, SVG morphing |
| Geometric Shapes | SVG, Canvas, Zdog, p5.js | Tetris-style, creative coding |
| Audio Reactive | Tone.js, Web Audio API | Scroll audio, UI sounds, visualizers |
| Physics 2D | Matter.js | Gravity, collisions, constraints |
| 3D & WebGL | Three.js + GSAP | Shaders, canvas effects |

## Installation

### Using npx (skills.sh)

```bash
npx skills add YOUR_USERNAME/awwwards-animations
```

### Manual Installation

Copy the skill folder to your Claude Code skills directory:

```bash
# Global installation
cp -r awwwards-animations ~/.claude/.agents/skills/

# Or project-level
cp -r awwwards-animations .claude/skills/
```

## Usage

Once installed, simply ask Claude to help you with animations:

> "Create a hero section with parallax and smooth scroll"

> "Make a grid of blocks that fall with physics and play sounds on collision"

> "Build a magnetic cursor with blend mode difference"

Claude will use this skill automatically when you request animation-related help.

## Project Setup

When starting a new project, install the required dependencies:

```bash
# Core animation libraries
npm install gsap @gsap/react lenis motion animejs

# Optional: Physics & Audio
npm install matter-js tone
npm install --save-dev @types/matter-js
```

## Skill Structure

```
awwwards-animations/
├── SKILL.md                         # Core patterns & quick reference
└── references/
    ├── gsap-react.md                # useGSAP, ScrollTrigger, timelines
    ├── motion-patterns.md           # Framer Motion patterns
    ├── animejs-react.md             # Anime.js 4.0 patterns
    ├── lenis-react.md               # Smooth scroll integration
    ├── geometric-shapes.md          # SVG, Canvas, Zdog, p5.js
    ├── audio-reactive.md            # Tone.js, Web Audio
    ├── physics-2d.md                # Matter.js physics
    ├── advanced-patterns.md         # Three.js, WebGL, shaders
    └── performance.md               # 60fps optimization
```

## Key Patterns

### Lenis + GSAP ScrollTrigger (Critical Setup)

```tsx
import { ReactLenis, useLenis } from 'lenis/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Connect Lenis to ScrollTrigger
const lenis = useLenis()
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)
```

### Magnetic Button (Motion)

```tsx
<motion.button
  onMouseMove={handleMouse}
  onMouseLeave={() => setPosition({ x: 0, y: 0 })}
  animate={position}
  transition={{ type: 'spring', stiffness: 150, damping: 15 }}
>
  {children}
</motion.button>
```

### Physics + Audio Collision

```tsx
Matter.Events.on(engine, 'collisionStart', async () => {
  await Tone.start()
  synth.triggerAttackRelease('C4', '16n')
})
```

## Libraries & Versions

| Library | Version | Purpose |
|---------|---------|---------|
| GSAP | 3.12+ | Scroll animations, timelines |
| @gsap/react | latest | useGSAP hook |
| Lenis | 1.1+ | Smooth scroll |
| Motion | latest | React animations |
| Anime.js | 4.0+ | Lightweight animations |
| Matter.js | 0.19+ | 2D physics |
| Tone.js | 14+ | Audio synthesis |

## Inspiration

This skill is designed to help create websites at the level of:

- [Active Theory](https://activetheory.net)
- [Studio Freight](https://studiofreight.com)
- [Locomotive](https://locomotive.ca)
- [Resn](https://resn.co.nz)
- [Aristide Benoist](https://aristidebenoist.com)

## Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Add new patterns or improve existing ones
3. Submit a pull request

## License

MIT License - feel free to use in personal and commercial projects.

---

**Made for the creative developer community**
