export async function exitAllFullscreen(doc = document) {
  // Jellyfin may already have fullscreen active before Multiview adds another element.
  for (let count = 0; doc.fullscreenElement && count < 8; count++) {
    await doc.exitFullscreen();
  }
  if (doc.fullscreenElement) throw new Error('Unable to exit fullscreen. Press Escape to exit.');
}
