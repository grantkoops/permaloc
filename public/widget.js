/* Permaloc chat bubble. Usage:
 * <script src="https://permaloc-chatbot.vercel.app/widget.js" defer></script>
 * Optional: data-color, data-position="left", data-teaser="..."
 */
(function () {
  if (window.__permalocChat) return;
  window.__permalocChat = true;

  var script =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"]');
  var origin = new URL(script.src, location.href).origin;
  var color = script.getAttribute("data-color") || "#1f5130";
  var side = script.getAttribute("data-position") === "left" ? "left" : "right";
  var teaserText = script.getAttribute("data-teaser");

  var css =
    "#plc-btn{position:fixed;bottom:20px;" + side + ":20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;" +
    "background:" + color + ";color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    "#plc-btn:hover{transform:scale(1.06)}#plc-btn svg{width:28px;height:28px}" +
    "#plc-frame{position:fixed;bottom:92px;" + side + ":20px;width:390px;height:620px;max-height:calc(100vh - 112px);border:0;border-radius:16px;" +
    "box-shadow:0 12px 48px rgba(0,0,0,.28);z-index:2147483000;background:#fff;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .18s,transform .18s}" +
    "#plc-frame.open{opacity:1;transform:none;pointer-events:auto}" +
    "#plc-teaser{position:fixed;bottom:34px;" + side + ":92px;max-width:240px;background:#fff;color:#222;font:14px/1.35 system-ui,sans-serif;padding:10px 14px;border-radius:12px;" +
    "box-shadow:0 4px 18px rgba(0,0,0,.18);z-index:2147483000;cursor:pointer}" +
    "@media (max-width:480px){#plc-frame{inset:0;width:100%;height:100%;max-height:none;border-radius:0;bottom:0;" + side + ":0}#plc-frame.open~#plc-btn{display:none}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var frame = document.createElement("iframe");
  frame.id = "plc-frame";
  frame.title = "Permaloc chat assistant";
  frame.setAttribute("aria-hidden", "true");
  var loaded = false;

  var chatIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var btn = document.createElement("button");
  btn.id = "plc-btn";
  btn.setAttribute("aria-label", "Open chat");
  btn.innerHTML = chatIcon;

  var teaser = null;
  function hideTeaser() {
    if (teaser) teaser.remove();
    teaser = null;
    try { sessionStorage.setItem("plc-teaser-seen", "1"); } catch (e) {}
  }

  function setOpen(open) {
    if (open && !loaded) {
      frame.src = origin + "/embed";
      loaded = true;
    }
    frame.classList.toggle("open", open);
    frame.setAttribute("aria-hidden", open ? "false" : "true");
    btn.innerHTML = open ? closeIcon : chatIcon;
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    if (open) hideTeaser();
  }

  btn.addEventListener("click", function () {
    setOpen(!frame.classList.contains("open"));
  });
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data && e.data.type === "permaloc-chat:close") setOpen(false);
  });

  document.body.appendChild(frame);
  document.body.appendChild(btn);

  var seen = false;
  try { seen = sessionStorage.getItem("plc-teaser-seen") === "1"; } catch (e) {}
  if (teaserText && !seen) {
    setTimeout(function () {
      if (frame.classList.contains("open")) return;
      teaser = document.createElement("div");
      teaser.id = "plc-teaser";
      teaser.textContent = teaserText;
      teaser.addEventListener("click", function () { setOpen(true); });
      document.body.appendChild(teaser);
    }, 4000);
  }
})();
