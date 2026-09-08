// A render-blocking async resource also executes when React inserts a new root.
// ThemeSync remains the fallback and reveals content only after synchronization.
(function () {
  var root = document.documentElement;
  try {
    var script = document.currentScript;
    var enabled = script && new URL(script.src).searchParams.get("review") === "1";
    var local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]" || /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.localhost$/.test(location.hostname);
    var query = enabled && local ? new URLSearchParams(location.search).getAll("theme") : [];
    var review = query.length === 1 && (query[0] === "dark" || query[0] === "light") ? query[0] : null;
    var dark = (review || localStorage.getItem("theme")) === "dark";
    root.classList.toggle("review-theme", review !== null);
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
  } catch {
    root.classList.remove("review-theme", "dark");
    root.classList.add("light");
  }
})();
