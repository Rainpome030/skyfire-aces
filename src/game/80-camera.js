// ---------- camera ----------
function updateCamera(dt) {
  // 追尾视角(任务书 20):相机硬锁玩家(旋转中心=飞机位置,否则飞机在屏幕上画圈)
  cam.x = player.x; cam.y = player.y;
  cam.zoom = lerp(cam.zoom, CAM_ZOOM, dt * 2);
  cam.shake = Math.max(0, cam.shake - dt * 34);
  if (cam.shake > 0.2) {
    cam.shakeX = rand(-1, 1) * cam.shake * 0.5;
    cam.shakeY = rand(-1, 1) * cam.shake * 0.5;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}
