from PIL import Image, ImageDraw
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

BG = (13, 15, 26, 255)       # #0d0f1a
ROWS = ['#ff5d73', '#ff9f5d', '#ffd23f']
BALL = (255, 210, 63, 255)   # #ffd23f
PADDLE = (255, 255, 255, 255)


def hex_to_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (255,)


def make_icon(size, filename, maskable=False):
    img = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img)

    pad = size * (0.16 if maskable else 0.08)
    inner = size - pad * 2

    # rounded background square (only for non-maskable / adaptive keeps full bleed)
    radius = size * 0.22
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    # bricks (3 rows)
    brick_area_top = pad + inner * 0.10
    brick_h = inner * 0.11
    gap = inner * 0.045
    cols = 4
    brick_w = (inner - gap * (cols - 1)) / cols
    for r, color in enumerate(ROWS):
        y0 = brick_area_top + r * (brick_h + gap)
        for c in range(cols):
            x0 = pad + c * (brick_w + gap)
            draw.rounded_rectangle(
                [x0, y0, x0 + brick_w, y0 + brick_h],
                radius=size * 0.015,
                fill=hex_to_rgba(color),
            )

    # ball
    ball_r = inner * 0.075
    ball_cx = pad + inner * 0.5
    ball_cy = pad + inner * 0.62
    draw.ellipse(
        [ball_cx - ball_r, ball_cy - ball_r, ball_cx + ball_r, ball_cy + ball_r],
        fill=BALL,
    )

    # paddle
    paddle_w = inner * 0.34
    paddle_h = inner * 0.07
    paddle_x0 = pad + inner * 0.5 - paddle_w / 2
    paddle_y0 = pad + inner * 0.82
    draw.rounded_rectangle(
        [paddle_x0, paddle_y0, paddle_x0 + paddle_w, paddle_y0 + paddle_h],
        radius=paddle_h / 2,
        fill=PADDLE,
    )

    img.save(os.path.join(OUT_DIR, filename))
    print('wrote', filename, size)


make_icon(192, 'icon-192.png')
make_icon(512, 'icon-512.png')
make_icon(512, 'icon-maskable-512.png', maskable=True)

# simple favicon
fav = Image.open(os.path.join(OUT_DIR, 'icon-192.png')).resize((64, 64))
fav.save(os.path.join(OUT_DIR, 'favicon.png'))
print('done')
