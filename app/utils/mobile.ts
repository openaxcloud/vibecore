export function isMobile() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.innerWidth < 768 ||
    window.innerHeight < 500 ||
    /iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent)
  );
}
