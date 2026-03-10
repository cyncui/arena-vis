# Arena Vis — Product Requirements Document (Draft)

**A spatial interface for wandering through connected ideas.**

---

## Context

Are.na is a place where people collect and connect ideas over time. The connections between channels and blocks are the most interesting part — but they're largely invisible. You can follow a link from one channel to a connected block, and from that block to another channel, but this movement is linear. It happens one page at a time.

Arena Vis makes the shape of those connections visible. It renders an Are.na channel as a three-dimensional graph — blocks and channels floating in space, linked by the relationships that already exist. Instead of clicking through pages, you move through a constellation of ideas.

This is not an analytics tool. It's closer to a way of seeing.

---

## Who this is for

People who already use Are.na and want a different way to encounter what they've collected. Connected knowledge collectors who think spatially. Anyone curious about the structure of an idea-space — how one channel relates to another through shared blocks.

---

## Core experience

### Enter a channel, see its shape

A user pastes an Are.na channel URL or slug. The app fetches the channel's contents and renders a force-directed 3D graph:

- **Channels** appear as white spheres — reflective, slightly luminous.
- **Image blocks** appear as floating planes with their image texture.
- **Text and other blocks** appear as small colored cubes.
- **Links** between them are rendered as thin dark lines — present but unobtrusive.

Everything sits in a dark field scattered with faint particles, like a quiet night sky.

### Move through the graph

The graph is not a static diagram. You can orbit around it, zoom in, fly through it using keyboard controls (WASD + Q/E), or pan with a trackpad (shift-drag). The intent is unhurried, exploratory movement — not navigation toward a destination.

### Click to expand

Clicking a channel node loads its contents into the graph. New blocks and sub-channels appear, connected to the channel you opened. The graph grows outward.

Clicking a block loads the channels it belongs to — revealing unexpected connections. A photograph you saved in one channel might also live in three others you've never visited.

The graph accumulates. Each click adds to the structure rather than replacing it. You build up a picture of how things relate by wandering.

### Hover to focus

Nodes rest at a low opacity by default — present but not demanding attention. Hovering brings a node to full visibility. Channel spheres reveal square brackets `[ ]` on hover, a quiet typographic signal that this is a container, something you can open.

### Sidebar as context

When a node is selected, a panel appears beneath the search input showing what you're looking at — the channel name, block content, an image preview. For blocks, the image or text links back to the original on Are.na, so you can always return to the source. A breadcrumb trail tracks where you've been.

---

## Requirements

### Functional

| Requirement | Status |
|---|---|
| Accept Are.na channel URL or slug as input | Built |
| Fetch channel contents and block connections via Are.na API v3 | Built |
| Render 3D force-directed graph with distinct node types (channel sphere, image plane, text cube) | Built |
| Expand graph on channel click (load contents) | Built |
| Expand graph on block click (load connected channels) | Built |
| Node hover: opacity 0.5 base, 1.0 on hover | Built |
| Channel hover: show bracket decoration | Built |
| Selected node detail sidebar with Are.na backlinks | Built |
| Navigation history with breadcrumb trail | Built |
| Orbit, zoom, WASD fly, shift-drag pan controls | Built |
| Starfield background | Built |
| Link deduplication on repeated clicks | Built |

### Non-functional

| Requirement | Status |
|---|---|
| Node objects created once, not rebuilt on every interaction | Built |
| Three.js module loaded once at module scope | Built |
| Unused API calls removed; independent fetches parallelized | Built |
| Texture caching for image blocks | Built |

---

## API surface

The app uses three internal API routes, each proxying the Are.na API v3 with retry logic and rate-limit handling:

- **`/api/arena?slug=`** — Initial load. Fetches a channel, selects a random block, and returns the block's connected channels. Entry point into the graph.
- **`/api/channel?id=`** — Channel expansion. Returns up to 20 random blocks and 5 sub-channels for a given channel.
- **`/api/block-connections?id=&exclude=`** — Block expansion. Returns up to 3 connected channels not already present in the graph.

These limits are intentional. The graph should grow gradually, not overwhelm.

---

## Open questions

- **Sharing.** Can a user share a specific graph state (set of expanded channels) as a URL? This would make the tool useful for showing someone else the shape of a research project.
- **Persistence.** Should the graph be saveable — as a snapshot, or as a new Are.na channel? The graph itself is a kind of curation.
- **Search within the graph.** As the graph grows, finding a specific node becomes harder. A lightweight search or highlight-by-name could help.
- **Performance ceiling.** How large can the graph grow before interaction degrades? Do we need level-of-detail culling, node clustering, or pagination?
- **Mobile.** The 3D interaction model assumes a mouse or trackpad. A touch-friendly variant would need a fundamentally different interaction pattern — possibly a 2D fallback.

---

## Design principles

1. **Show the connections, not the content.** The graph is about relationships. Block previews exist in the sidebar, not as the primary interface.
2. **Accumulate, don't replace.** Each interaction adds to the graph. You build up context by exploring, the way you build understanding over time.
3. **Stay quiet.** Low opacity, dark background, thin lines. The interface should feel like a calm space for thinking, not a dashboard.
4. **Always lead back.** Every block links to its original on Are.na. This tool extends Are.na; it doesn't replace it.

---

*Draft — March 2026*
