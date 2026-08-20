# Third-party assets

This prototype vendors the following files so the demo does not depend on external hotlinks. Aircraft retain readable real-world silhouettes, while the NIGHTLINK environment uses a restrained military palette and mobile-suitable geometry budget. Models are rescaled and recolored at runtime. No sound assets are included.

## Fighter jets

- Creator: Captain_Ahab_62
- Source: https://opengameart.org/content/fighter-jets
- License: Creative Commons Zero (`CC0 1.0`), https://creativecommons.org/publicdomain/zero/1.0/
- Local legal-code copy: `assets/licenses/CC0-1.0.txt`
- Source archive: `fighter-jets.zip`, containing `basic_replacements.blend` (not included in the web build)
- Changes: selected named objects from the source Blender scene; joined related meshes where required; rotated to the prototype's +Z forward convention; recentered; normalized to a common horizontal span; exported as glTF binary; recolored and given procedural engine glow at runtime
- Retrieved: 2026-08-19

| Selected source object | Runtime role | Local file | SHA-256 |
| --- | --- | --- | --- |
| `F-14` + `F-14 wings` | player aircraft | `assets/models/skyfire-player-f14.glb` | `331e28f94f1ca862652331c00958462dab526f114525fda81c9db58b28428e00` |
| `Rafale B` | interceptor | `assets/models/skyfire-interceptor-rafale.glb` | `dde486da486273e5fe0fa5f6b26a44b14b1e9a8433958c7bd582fdb094ee8a3c` |
| `F-15` | ace | `assets/models/skyfire-ace-f15.glb` | `0eaa803f3632b2e35a9524c130975f87ece93bd0d749a5b26005e558b28d3b9d` |

The local `CC0-1.0.txt` legal-code copy has SHA-256 `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`.

## Military Base 3d Model

- Creator: the_jay
- Source: https://opengameart.org/content/military-base-3d-model
- License: Creative Commons Zero (`CC0 1.0`), https://creativecommons.org/publicdomain/zero/1.0/
- Local legal-code copy: `assets/licenses/CC0-1.0.txt`
- Source file: `military-island.blend`, SHA-256 `6c4c0f674225aedcaa79445ab0e4c1b2ce54cc910a396a2d3287773eed470376` (not included in the web build)
- Changes: selected the combined military-island mesh; omitted the source water plane, camera, and light; exported as glTF binary; normalized to a common span; desaturated and roughened the original palette at runtime
- Retrieved: 2026-08-19

| Runtime role | Local file | SHA-256 |
| --- | --- | --- |
| distant naval base / scale landmark | `assets/models/skyfire-military-island.glb` | `c320795b7776b9181b8bed2ddf279a93a5e4a52c2efe940357e5a152c6470466` |

## 3D Turret PBR

- Creator: PolygonDan
- Source: https://opengameart.org/content/3d-turret-pbr-texture-flat-diff-texture
- License: Creative Commons Zero (`CC0 1.0`), https://creativecommons.org/publicdomain/zero/1.0/
- Local legal-code copy: `assets/licenses/CC0-1.0.txt`
- Source archive: `Turret_final_PolygonDan.zip`, SHA-256 `9fabef87919f39ada0eda4330371f073f1f50b8988b31a53cf21ef38ad2c048e` (not included in the web build)
- Changes: selected `turret.fbx`; omitted source cameras, lights, and 2K textures; exported as a compact glTF binary; normalized, recentered, and given a new graphite/field-grey runtime material
- Retrieved: 2026-08-19

| Runtime role | Local file | SHA-256 |
| --- | --- | --- |
| anti-aircraft emplacement | `assets/models/skyfire-aa-turret-pbr.glb` | `474ce6f2cde7a3fcdcb36a8e349b3f630dfb714b84af076c7aa48a9ea4511187` |

## Patrol boat

- Creators: Sketlux and yd
- Source: https://opengameart.org/content/patrol-boat
- License: Creative Commons Zero (`CC0 1.0`), https://creativecommons.org/publicdomain/zero/1.0/
- Local legal-code copy: `assets/licenses/CC0-1.0.txt`
- Source file: `pt-boat.blend`, SHA-256 `ef19f514a167c554a00fd980aefce0af32b814b97e96f1513fb4301579cbd853` (not included in the web build)
- Changes: selected mesh objects only; omitted cameras and lights; exported as glTF binary; normalized, recentered, recolored, and placed as non-interactive set dressing
- Retrieved: 2026-08-19

| Runtime role | Local file | SHA-256 |
| --- | --- | --- |
| distant maritime traffic / scale cue | `assets/models/skyfire-patrol-boat.glb` | `f033d19ffa3d47c01b7b1a518b1d145c94a8f2911daf6e7eecdeee940e405c46` |

## Transparent cloud texture

- Creator: WickedInsignia
- Source: https://opengameart.org/content/clouds-with-transparency-fxcloudalpha05png
- License: Creative Commons Zero (`CC0 1.0`), https://creativecommons.org/publicdomain/zero/1.0/
- Local legal-code copy: `assets/licenses/CC0-1.0.txt`
- Source file: `fx_cloudalpha05.png` (2048×2048), SHA-256 `5cae51b43d8d7dbb4b9d8e1f8830d4120ef1cd9f95690f4c5f58afb0c2b0f339` (not included in the web build)
- Changes: downscaled to 512×512 PNG; tinted and opacity-adjusted at runtime; used on horizontal cloud-layer cards instead of geometric cloud puffs
- Retrieved: 2026-08-19

| Runtime role | Local file | SHA-256 |
| --- | --- | --- |
| altitude-layer clouds | `assets/textures/skyfire-cloud-512.png` | `5cf885fcb4c8664035d720226a7b9244c1e4b4ba20227a3bc72cb07386720d86` |

## B612 typeface

- Copyright: 2012 The B612 Project Authors
- Source: https://github.com/polarsys/b612
- License: SIL Open Font License 1.1
- Local license copy: `assets/licenses/B612-OFL-1.1.txt`, SHA-256 `41eb0cf56ee1bae213d4a5c650fe60d936bdeda605d3cc6abd7a1720f6083e62`
- Changes: none; locally served TrueType files are used for English tactical labels and tabular telemetry. Chinese text falls back to the platform system font.
- Retrieved: 2026-08-19

| Local file | SHA-256 |
| --- | --- |
| `assets/fonts/B612-Regular.ttf` | `139dce659100a83bf95b48474696e448bee95631ef84fd3d0437ced2bf33cf73` |
| `assets/fonts/B612-Bold.ttf` | `91749541ac7b2c328b58832b7e2c4df809d7e2ba38d62a3a5aa3f8e38b271814` |
| `assets/fonts/B612Mono-Regular.ttf` | `b98cb96cc8a6206dae08c063d60902df7e6d40f86139ebdb97256704253c9c69` |
| `assets/fonts/B612Mono-Bold.ttf` | `b467b1d19fdabed42be51d87e38c86645ceeff2f828f294775188d00d1fd68ca` |

## Kenney Space Kit (radar only)

- Creator: Kenney (www.kenney.nl)
- Source: https://kenney.nl/assets/space-kit
- License: Creative Commons Zero (`CC0 1.0`), https://creativecommons.org/publicdomain/zero/1.0/
- Local license copy: `assets/licenses/Kenney-Space-Kit-CC0.txt`
- Changes: the radar was renamed, rescaled, recentered, and recolored; the former Space Kit turret and hangar were removed from the active NIGHTLINK scene
- Retrieved: 2026-08-19

| Selected source model | Local file | SHA-256 |
| --- | --- | --- |
| `radar.glb` | `assets/models/skyfire-radar.glb` | `143dd36b2c427e3201110967a18fd836bc7aa8002dbf3e44efa42c75fbb44ae5` |
