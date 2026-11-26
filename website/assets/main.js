// Grenz & Co. Website: Menü, feste Kopfzeile, Bewertungsformular
(function () {
  var kopf = document.getElementById("kopf");
  var burger = kopf && kopf.querySelector(".burger");
  if (burger) {
    burger.addEventListener("click", function () {
      var offen = kopf.classList.toggle("open");
      burger.setAttribute("aria-expanded", offen ? "true" : "false");
      burger.setAttribute("aria-label", offen ? "Menü schließen" : "Menü öffnen");
    });
    kopf.querySelectorAll("nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        kopf.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }
  if (kopf) {
    var setze = function () { kopf.classList.toggle("fix", window.scrollY > 520); };
    window.addEventListener("scroll", setze, { passive: true });
    setze();
  }

  // Vorschau: Die Anfrage wird als vorbereitete E-Mail an info@grenz-co.de geöffnet.
  // Für den Livegang wird hier die Übergabe an Salesforce (Web-to-Lead) angeschlossen.
  var form = document.getElementById("bewertungsformular");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var d = new FormData(form);
      var text = [
        "Bewertungsanfrage über grenz-co.de",
        "",
        "Objektart: " + d.get("objektart"),
        "Ort: " + d.get("ort"),
        "Name: " + d.get("name"),
        "Telefon: " + d.get("telefon"),
      ].join("\n");
      window.location.href = "mailto:info@grenz-co.de?subject=" + encodeURIComponent("Bewertungsanfrage " + d.get("objektart") + ", " + d.get("ort")) + "&body=" + encodeURIComponent(text);
      form.classList.add("sent");
    });
  }
})();
