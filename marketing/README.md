# Marketing

| Path | What it is |
|---|---|
| `LAUNCH_PLAYBOOK.md` | The 30-day launch plan: who we sell to, the channels, targets, budget and the decisions needed |
| `INSTAGRAM_30_DAYS.md` | Every Instagram post for the first 30 days, with hooks and captions |
| `clips/<design>.mp4` | One vertical Reel per design (1080x1920, about 18 s, silent): the real opening, a scroll through the invitation, an end card |
| `posts/<design>.jpg` | One feed post per design (1080x1350) |
| `posts/profile-picture.png` | Instagram profile picture |

Everything uses each design's fictional sample couple and the sample photographs (`assets/samples/`), never real people.

## Remaking the assets after a design changes

```bash
node scripts/record-openings.mjs /tmp/raw              # all designs, or add design ids to record only some
```

Then encode each recording for Instagram (from the folder holding the `.webm` files):

```bash
for f in *.webm; do ffmpeg -y -i "$f" -ss 0.4 -vf "scale=1080:1920:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an "/path/to/invitestudio/marketing/clips/${f%.webm}.mp4"; done
```

Then remake the feed posts from the clips:

```bash
node scripts/make-social-posts.mjs
```

Both scripts use the machine's global Playwright if there is one (it includes the video encoder), otherwise the project's copy.
