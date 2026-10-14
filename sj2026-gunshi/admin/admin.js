// 管理画面の補助（A-7-2）: 「推挙する」の入力必須・リセットの確認ダイアログ
(function () {
  "use strict";
  var form = document.getElementById("ovform");
  function sync(tr) {
    var mode = tr.querySelector("select.mode");
    var on = mode && mode.value === "on";
    tr.querySelectorAll(".on-only").forEach(function (e) { e.disabled = !on; e.required = on && e.tagName === "SELECT"; });
    tr.classList.toggle("off", mode && mode.value === "off");
  }
  if (form) {
    form.querySelectorAll("tr[data-chk]").forEach(function (tr) {
      sync(tr);
      var m = tr.querySelector("select.mode");
      if (m) { m.addEventListener("change", function () { sync(tr); }); }
    });
  }
  document.querySelectorAll("form.reset").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      if (!window.confirm("10/" + f.getAttribute("data-day") + " の推挙回数と来場者番号をリセットします（退避あり）。よろしいですか？")) { e.preventDefault(); }
    });
  });
})();
