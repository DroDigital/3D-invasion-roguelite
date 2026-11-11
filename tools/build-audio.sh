#!/usr/bin/env bash
# Converts the sourced audio into small OGG Vorbis files under assets/audio.
#   tools/build-audio.sh <extracted-sfx-dir> <music-dir>
# <extracted-sfx-dir> holds kenney/ (Digital SFX Set), rd50/ (50 CC0 Sci-Fi SFX),
# exp/explosions/ (Baradari explosions) and btn/buttons_and_clicks/ (Independent nu ljudbank).
set -euo pipefail
SFX="$1"; MUSIC="$2"; OUT=assets/audio
mkdir -p "$OUT/sfx" "$OUT/music"

# name  source  max-seconds
while read -r name src max; do
  [ -z "$name" ] && continue
  ffmpeg -nostdin -v error -y -i "$SFX/$src" -t "$max" -af "afade=t=out:st=$(printf "%.2f" "$(echo "$max - 0.08" | bc)"):d=0.08,loudnorm=I=-18:TP=-2" \
    -ac 1 -ar 22050 -c:a libvorbis -q:a 2 "$OUT/sfx/$name.ogg"
done <<'LIST'
shot_kinetic   rd50/shoot_01.ogg                 0.3
shot_artillery rd50/shoot_02.ogg                 0.2
shot_missile   rd50/rocket_01.ogg                0.7
shot_laser     kenney/laser4.mp3                 0.45
shot_tesla     kenney/zap1.mp3                   0.45
shot_gravity   kenney/phaserDown2.mp3            0.3
shot_drone     kenney/pepSound1.mp3              0.3
hit            rd50/terminal_02.ogg              0.12
explode_small  exp/explosions/explodemini.wav    0.9
explode_big    exp/explosions/explode.wav        2.2
city_hit       kenney/lowThreeTone.mp3           0.9
alarm          rd50/retro_beep_03.ogg            0.55
abduct         rd50/teleport_01.ogg              0.45
escape         rd50/teleport_02.ogg              1.2
levelup        kenney/powerUp1.mp3               1.0
evolve         kenney/powerUp10.mp3              0.65
buy            kenney/threeTone1.mp3             0.8
ui_click       btn/buttons_and_clicks/button01.mp3.flac 0.3
ui_hover       btn/buttons_and_clicks/Clic01.mp3.flac   0.15
ability        kenney/phaseJump1.mp3             0.45
emp            kenney/zapThreeToneUp.mp3         1.1
shield         kenney/powerUp5.mp3               0.42
wave           kenney/highUp.mp3                 0.53
boss           rd50/weird_01.ogg                 0.7
gameover       kenney/lowDown.mp3                0.76
LIST

for pair in "calm:ObservingTheStar.ogg" "combat:MyVeryOwnDeadShip.ogg" "menu:GalacticTemple.ogg" "boss:Blackmoor_Colossus.mp3"; do
  name="${pair%%:*}"; src="${pair#*:}"
  ffmpeg -nostdin -v error -y -i "$MUSIC/$src" -ac 2 -ar 32000 -c:a libvorbis -q:a 1 "$OUT/music/$name.ogg"
done
du -sh "$OUT/sfx" "$OUT/music"
