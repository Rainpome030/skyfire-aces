// ---------- camera ----------
function cameraViewAngle() {
  return save && save.cameraMode === CAMERA_WORLD_UP ? 0 : -Math.PI / 2 - player.heading;
}

function updateCamera(dt) {
  // 相机始终锁定玩家位置；视角设置只决定是否跟随玩家航向旋转。
  cam.x = player.x; cam.y = player.y;
  cam.zoom = lerp(cam.zoom, CAM_ZOOM, dt * 2);
  cam.shake = Math.max(0, cam.shake - dt * 34);
  if (cam.shake > 0.2) {
    cam.shakeX = rand(-1, 1) * cam.shake * 0.5;
    cam.shakeY = rand(-1, 1) * cam.shake * 0.5;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}
