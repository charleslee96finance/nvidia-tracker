"""Render a 30-second MP4 tour of the eight planets orbiting the Sun.

Orbital radii and planet sizes are compressed (not to scale) so everything
fits in one frame; angular speeds follow Kepler's third law (w ~ r^-1.5).
"""

import numpy as np
import matplotlib

matplotlib.use("Agg")
import imageio_ffmpeg

matplotlib.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()

import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, FFMpegWriter
from matplotlib.patches import Circle, Ellipse, FancyBboxPatch

FPS = 30
DURATION_S = 30
N_FRAMES = FPS * DURATION_S
SECONDS_PER_FACT = DURATION_S / 8

PLANETS = [
    # name, orbit radius, display radius, color, fact
    ("Mercury", 2.5, 0.18, "#b1adad",
     "Mercury - closest to the Sun; a year lasts just 88 Earth days"),
    ("Venus", 3.4, 0.30, "#e6c87d",
     "Venus - the hottest planet, with surface temps near 460 C"),
    ("Earth", 4.3, 0.32, "#4f8fdd",
     "Earth - the only world known to harbor life"),
    ("Mars", 5.1, 0.24, "#d1603d",
     "Mars - the Red Planet, home to Olympus Mons, the tallest volcano"),
    ("Jupiter", 6.6, 0.75, "#d8a05c",
     "Jupiter - the largest planet; over 1,300 Earths could fit inside"),
    ("Saturn", 7.9, 0.62, "#e3cf9e",
     "Saturn - famous for its rings; less dense than water"),
    ("Uranus", 9.0, 0.45, "#9bd4d4",
     "Uranus - an ice giant that spins on its side (98 degree tilt)"),
    ("Neptune", 9.8, 0.44, "#4969e1",
     "Neptune - the windiest planet, with gusts over 2,000 km/h"),
]

# Earth completes ~2.5 orbits over the video; others scale by Kepler's law.
K_SPEED = 2.5 * 2 * np.pi / N_FRAMES * 4.3**1.5
rng = np.random.default_rng(7)
PHASES = rng.uniform(0, 2 * np.pi, len(PLANETS))

fig = plt.figure(figsize=(12.8, 7.2), dpi=100)
fig.patch.set_facecolor("#04040f")
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(-20.1, 20.1)
ax.set_ylim(-11.6, 11.0)
ax.set_aspect("equal")
ax.axis("off")
ax.set_facecolor("#04040f")

# Starfield: one static layer plus one layer that twinkles.
stars_xy = rng.uniform([-20.1, -11.6], [20.1, 11.0], size=(260, 2))
star_sizes = rng.uniform(1, 7, 260)
ax.scatter(stars_xy[:160, 0], stars_xy[:160, 1], s=star_sizes[:160],
           c="white", alpha=0.55, lw=0)
twinkle = ax.scatter(stars_xy[160:, 0], stars_xy[160:, 1], s=star_sizes[160:],
                     c="white", alpha=0.4, lw=0)

# Sun with layered glow.
for r, a in [(2.0, 0.06), (1.6, 0.10), (1.3, 0.18)]:
    ax.add_patch(Circle((0, 0), r, color="#ffcf5c", alpha=a, lw=0))
ax.add_patch(Circle((0, 0), 1.0, color="#fff3b0", lw=0))
ax.text(0, 0, "Sun", ha="center", va="center", color="#8a6a15", fontsize=11,
        zorder=3)

# Orbit paths.
orbit_lines = []
for _, r_orb, _, _, _ in PLANETS:
    line, = ax.plot(r_orb * np.cos(np.linspace(0, 2 * np.pi, 200)),
                    r_orb * np.sin(np.linspace(0, 2 * np.pi, 200)),
                    color="white", alpha=0.12, lw=0.8)
    orbit_lines.append(line)

# Planets, trails, labels.
bodies, trails, labels, trail_xy = [], [], [], []
speeds = [K_SPEED / r**1.5 for _, r, _, _, _ in PLANETS]
for i, (name, r_orb, r_disp, color, _) in enumerate(PLANETS):
    trail, = ax.plot([], [], color=color, alpha=0.35, lw=1.4)
    trails.append(trail)
    trail_xy.append([])
    body = Circle((r_orb, 0), r_disp, color=color, lw=0, zorder=5)
    ax.add_patch(body)
    bodies.append(body)
    labels.append(ax.text(r_orb, r_disp + 0.3, name, ha="center", va="bottom",
                          color="white", fontsize=10, alpha=0.9, zorder=6))

saturn_ring = Ellipse((0, 0), 2.6, 0.7, angle=-18, fill=False,
                      edgecolor="#cbb88a", lw=2.5, alpha=0.85, zorder=4)
ax.add_patch(saturn_ring)
moon = Circle((0, 0), 0.08, color="#cccccc", lw=0, zorder=6)
ax.add_patch(moon)

highlight = Circle((0, 0), 1.0, fill=False, edgecolor="white", lw=1.2,
                   ls="--", alpha=0.9, zorder=7)
ax.add_patch(highlight)

ax.text(-19.4, 10.5, "The Solar System", ha="left", va="top", color="white",
        fontsize=20, weight="bold", zorder=8)
ax.text(-19.4, 9.55, "A tour of the eight planets\n(sizes and distances not to scale)",
        ha="left", va="top", color="#9aa0c0", fontsize=10, zorder=8)

fact_box = FancyBboxPatch((-12.5, -11.25), 25, 1.45,
                          boxstyle="round,pad=0.25,rounding_size=0.35",
                          facecolor="#0d0d26", edgecolor="white", lw=1.2,
                          alpha=0.9, zorder=8)
ax.add_patch(fact_box)
fact_text = ax.text(0, -10.5, "", ha="center", va="center", color="white",
                    fontsize=12.5, zorder=9)


def update(frame):
    t = frame / FPS
    twinkle.set_alpha(0.25 + 0.25 * (1 + np.sin(t * 4.0)) / 2)

    active = min(int(t / SECONDS_PER_FACT), len(PLANETS) - 1)
    for i, (name, r_orb, r_disp, color, fact) in enumerate(PLANETS):
        ang = PHASES[i] + speeds[i] * frame
        x, y = r_orb * np.cos(ang), r_orb * np.sin(ang)
        bodies[i].center = (x, y)
        labels[i].set_position((x, y + r_disp + 0.3))

        trail_xy[i].append((x, y))
        max_len = min(int(0.45 * 2 * np.pi / speeds[i]), 420)
        if len(trail_xy[i]) > max_len:
            trail_xy[i].pop(0)
        pts = np.array(trail_xy[i])
        trails[i].set_data(pts[:, 0], pts[:, 1])

        if name == "Saturn":
            saturn_ring.set_center((x, y))
        if name == "Earth":
            m_ang = 6.0 * speeds[i] * frame
            moon.center = (x + 0.62 * np.cos(m_ang), y + 0.62 * np.sin(m_ang))

        orbit_lines[i].set_alpha(0.35 if i == active else 0.12)

    name, r_orb, r_disp, color, fact = PLANETS[active]
    highlight.set_center(bodies[active].center)
    highlight.set_radius(r_disp + 0.45 + 0.06 * np.sin(t * 6))
    highlight.set_edgecolor(color)
    fact_text.set_text(fact)
    fact_box.set_edgecolor(color)

    if frame % 100 == 0:
        print(f"frame {frame}/{N_FRAMES}", flush=True)
    return []


ani = FuncAnimation(fig, update, frames=N_FRAMES, blit=False)
writer = FFMpegWriter(fps=FPS, bitrate=3500, codec="h264",
                      extra_args=["-pix_fmt", "yuv420p"])
ani.save("solar-system-video/solar_system.mp4", writer=writer, dpi=100)
print("done")
